import { criarProcessoPowerShell } from "./processoPowerShell";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$metodoOp = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' })[0]
function Esperar($tarefa, $tipo) {
  $t = $metodoOp.MakeGenericMethod($tipo).Invoke($null, @($tarefa))
  $t.Wait(-1) | Out-Null
  $t.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IContentTypeProvider, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$gerente = Esperar ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$ultimaCapa = ''
$capaAtual = $null
$capaTrocadaEm = [DateTime]::MinValue
$metodoParaFluxo = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [type[]]@([Windows.Storage.Streams.IInputStream]))
$propriedadeTipo = [Windows.Storage.Streams.IContentTypeProvider].GetProperty('ContentType')

function Capa($props) {
  try {
    if (-not $props.Thumbnail) { return $null }
    $fluxo = Esperar ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $net = $metodoParaFluxo.Invoke($null, @($fluxo))
    $mem = New-Object System.IO.MemoryStream
    $net.CopyTo($mem)
    $net.Dispose()
    if ($mem.Length -eq 0 -or $mem.Length -gt 2000000) { return $null }
    $tipo = [string]$propriedadeTipo.GetValue($fluxo)
    if (-not $tipo.StartsWith('image/')) { $tipo = 'image/jpeg' }
    return 'data:' + $tipo + ';base64,' + [Convert]::ToBase64String($mem.ToArray())
  } catch { return $null }
}

function Estado {
  $s = $gerente.GetCurrentSession()
  if (-not $s) { return @{ sessao = $false } }
  $props = Esperar ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $info = $s.GetPlaybackInfo()
  $linha = $s.GetTimelineProperties()
  $chaveCapa = [string]$s.SourceAppUserModelId + '|' + [string]$props.Title + '|' + [string]$props.Artist
  if ($chaveCapa -ne $script:ultimaCapa) {
    $script:ultimaCapa = $chaveCapa
    $script:capaTrocadaEm = [DateTime]::Now
    $script:capaAtual = Capa $props
  } elseif (-not $script:capaAtual -or ([DateTime]::Now - $script:capaTrocadaEm).TotalSeconds -lt 4) {
    $script:capaAtual = Capa $props
  }
  return @{
    sessao = $true
    app = [string]$s.SourceAppUserModelId
    titulo = [string]$props.Title
    artista = [string]$props.Artist
    album = [string]$props.AlbumTitle
    tocando = ([string]$info.PlaybackStatus -eq 'Playing')
    posicao = [math]::Round($linha.Position.TotalSeconds, 1)
    duracao = [math]::Round(($linha.EndTime - $linha.StartTime).TotalSeconds, 1)
    atualizadoEm = $linha.LastUpdatedTime.ToUnixTimeMilliseconds()
    podeAvancar = [bool]$info.Controls.IsNextEnabled
    podeVoltar = [bool]$info.Controls.IsPreviousEnabled
    podeBuscar = [bool]$info.Controls.IsPlaybackPositionEnabled
    capa = $script:capaAtual
  }
}

while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($null -eq $linha) { break }
  try {
    $pedido = $linha | ConvertFrom-Json
    $s = $gerente.GetCurrentSession()
    switch ($pedido.acao) {
      'alternar' { if ($s) { Esperar ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null } }
      'proxima' { if ($s) { Esperar ($s.TrySkipNextAsync()) ([bool]) | Out-Null } }
      'anterior' { if ($s) { Esperar ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null } }
      'posicao' { if ($s) { Esperar ($s.TryChangePlaybackPositionAsync([long]([double]$pedido.segundos * 10000000))) ([bool]) | Out-Null } }
    }
    if ($pedido.acao -ne 'estado') { Start-Sleep -Milliseconds 250 }
    $r = Estado
    $r.id = $pedido.id
    [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress -Depth 3))
  } catch {
    [Console]::Out.WriteLine((@{ id = $pedido.id; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

const midia = criarProcessoPowerShell("niko-midia", SCRIPT, "midia_encerrada");

type AcaoMidia = "estado" | "alternar" | "proxima" | "anterior" | "posicao";

const SEPARADOR_LINUX = "\u001f";
const FORMATO_LINUX = ["{{playerName}}", "{{status}}", "{{title}}", "{{artist}}", "{{album}}", "{{position}}", "{{mpris:length}}", "{{mpris:artUrl}}"].join(SEPARADOR_LINUX);

function playerctl(argumentos: string[]): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    execFile("playerctl", argumentos, { timeout: 5000, encoding: "utf8" }, (erro, saida) => (erro ? rejeitar(erro) : resolver(saida)));
  });
}

async function capaLinux(url: string): Promise<string | null> {
  if (url.startsWith("https://")) return url;
  if (!url.startsWith("file://")) return null;
  try {
    const bytes = await readFile(fileURLToPath(url));
    if (bytes.length === 0 || bytes.length > 2_000_000) return null;
    const tipo = /\.png$/i.test(url) ? "image/png" : /\.webp$/i.test(url) ? "image/webp" : "image/jpeg";
    return `data:${tipo};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function microParaSegundos(valor: string): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.round(n / 100000) / 10 : 0;
}

async function estadoLinux(): Promise<Record<string, unknown>> {
  let saida: string;
  try {
    saida = await playerctl(["metadata", "--format", FORMATO_LINUX]);
  } catch {
    return { sessao: false };
  }
  const [app = "", status = "", titulo = "", artista = "", album = "", posicao = "", duracao = "", arte = ""] = saida.replace(/\n$/, "").split(SEPARADOR_LINUX);
  return {
    sessao: true,
    app,
    titulo,
    artista,
    album,
    tocando: status === "Playing",
    posicao: microParaSegundos(posicao),
    duracao: microParaSegundos(duracao),
    atualizadoEm: Date.now(),
    podeAvancar: true,
    podeVoltar: true,
    podeBuscar: microParaSegundos(duracao) > 0,
    capa: await capaLinux(arte),
  };
}

async function pedirMidiaLinux(acao: AcaoMidia, segundos?: number): Promise<unknown> {
  const comandos: Record<AcaoMidia, string[] | null> = {
    estado: null,
    alternar: ["play-pause"],
    proxima: ["next"],
    anterior: ["previous"],
    posicao: ["position", String(Math.max(0, Number(segundos) || 0))],
  };
  const comando = comandos[acao];
  if (comando) {
    await playerctl(comando).catch(() => undefined);
    await new Promise((resolver) => setTimeout(resolver, 250));
  }
  return estadoLinux();
}

export function pedirMidia(acao: AcaoMidia, segundos?: number): Promise<unknown> {
  if (process.platform === "linux") return pedirMidiaLinux(acao, segundos);
  return midia.pedir({ acao, segundos: Number(segundos) || 0 });
}

export function encerrarMidia() {
  midia.encerrar();
}