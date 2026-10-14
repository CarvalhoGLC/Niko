import { spawn } from "node:child_process";
import { garantirScript } from "./scriptsTemporarios.ts";

const CODIGO = `
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NikoCredencial {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENCIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredWrite(ref CREDENCIAL c, int f);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredRead(string alvo, int tipo, int f, out IntPtr c);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredDelete(string alvo, int tipo, int f);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr p);
  public static bool Gravar(string alvo, string segredo) {
    byte[] bytes = Encoding.Unicode.GetBytes(segredo);
    CREDENCIAL c = new CREDENCIAL();
    c.Type = 1; c.TargetName = alvo; c.Persist = 2; c.UserName = "niko";
    c.CredentialBlobSize = bytes.Length; c.CredentialBlob = Marshal.AllocHGlobal(bytes.Length);
    Marshal.Copy(bytes, 0, c.CredentialBlob, bytes.Length);
    try { return CredWrite(ref c, 0); } finally { Marshal.FreeHGlobal(c.CredentialBlob); }
  }
  public static string Ler(string alvo) {
    IntPtr p;
    if (!CredRead(alvo, 1, 0, out p)) return null;
    try {
      CREDENCIAL c = (CREDENCIAL)Marshal.PtrToStructure(p, typeof(CREDENCIAL));
      if (c.CredentialBlobSize == 0) return "";
      return Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2);
    } finally { CredFree(p); }
  }
  public static bool Apagar(string alvo) { return CredDelete(alvo, 1, 0); }
}
`;

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${CODIGO}
'@
$entrada = [Console]::In.ReadToEnd() | ConvertFrom-Json
$resultado = @{ ok = $true }
switch ($entrada.acao) {
  'gravar' { $resultado.ok = [NikoCredencial]::Gravar($entrada.alvo, $entrada.segredo) }
  'ler' { $resultado.valor = [NikoCredencial]::Ler($entrada.alvo) }
  'apagar' { $resultado.ok = [NikoCredencial]::Apagar($entrada.alvo) }
}
$resultado | ConvertTo-Json -Compress
`;

const PREFIXO = "Niko/";
const TEMPO_LIMITE_MS = 20000;

const cache = new Map<string, string | null>();
const leiturasEmAndamento = new Map<string, Promise<string | null>>();

function executar(entrada: Record<string, string>): Promise<{ ok?: boolean; valor?: string | null }> {
  return new Promise((resolver, rejeitar) => {
    const processo = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", garantirScript("niko-credencial", SCRIPT)], { windowsHide: true });
    let saida = "";
    let erro = "";
    const relogio = setTimeout(() => {
      processo.kill();
      rejeitar(new Error("tempo_credencial"));
    }, TEMPO_LIMITE_MS);
    processo.stdout.on("data", (d) => (saida += d.toString()));
    processo.stderr.on("data", (d) => (erro += d.toString()));
    processo.on("error", (e) => {
      clearTimeout(relogio);
      rejeitar(e);
    });
    processo.on("close", (codigo) => {
      clearTimeout(relogio);
      if (codigo !== 0) return rejeitar(new Error(erro.trim().split("\n")[0] || "falha_credencial"));
      try {
        resolver(JSON.parse(saida.trim().split("\n").pop() ?? "{}"));
      } catch {
        rejeitar(new Error("resposta_invalida"));
      }
    });
    processo.stdin.end(JSON.stringify(entrada));
  });
}

function validarId(id: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error("id_invalido");
}

const NO_LINUX = process.platform === "linux";

function secretTool(argumentos: string[], entrada = ""): Promise<{ codigo: number; saida: string }> {
  return new Promise((resolver, rejeitar) => {
    const processo = spawn("secret-tool", argumentos, { stdio: ["pipe", "pipe", "ignore"] });
    let saida = "";
    const relogio = setTimeout(() => {
      processo.kill();
      rejeitar(new Error("tempo_credencial"));
    }, TEMPO_LIMITE_MS);
    processo.stdout.on("data", (d) => (saida += d.toString()));
    processo.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(relogio);
      rejeitar(new Error(e.code === "ENOENT" ? "secret_tool_ausente" : "falha_credencial"));
    });
    processo.on("close", (codigo) => {
      clearTimeout(relogio);
      resolver({ codigo: codigo ?? 1, saida });
    });
    processo.stdin.on("error", () => undefined);
    processo.stdin.end(entrada);
  });
}

export async function gravarSegredo(id: string, segredo: string) {
  validarId(id);
  if (!segredo || segredo.length > 4000) throw new Error("segredo_invalido");
  if (NO_LINUX) {
    const r = await secretTool(["store", `--label=${PREFIXO}${id}`, "app", "niko", "id", id], segredo);
    if (r.codigo !== 0) throw new Error("falha_ao_gravar");
  } else if (process.platform === "win32") {
    const r = await executar({ acao: "gravar", alvo: PREFIXO + id, segredo });
    if (!r.ok) throw new Error("falha_ao_gravar");
  } else {
    throw new Error("plataforma_nao_suportada");
  }
  leiturasEmAndamento.delete(id);
  cache.set(id, segredo);
}

function lerDoCofre(id: string): Promise<string | null> {
  if (NO_LINUX) return secretTool(["lookup", "app", "niko", "id", id]).then((r) => (r.codigo === 0 ? r.saida : null));
  return executar({ acao: "ler", alvo: PREFIXO + id }).then((r) => r.valor ?? null);
}

export async function lerSegredo(id: string): Promise<string | null> {
  validarId(id);
  if (cache.has(id)) return cache.get(id) ?? null;
  if (process.platform !== "win32" && !NO_LINUX) return null;
  const emAndamento = leiturasEmAndamento.get(id);
  if (emAndamento) return emAndamento;
  const leitura: Promise<string | null> = lerDoCofre(id)
    .then((valor) => {
      if (leiturasEmAndamento.get(id) === leitura) cache.set(id, valor);
      return valor;
    })
    .catch((e) => {
      if (NO_LINUX) return null;
      throw e;
    })
    .finally(() => {
      if (leiturasEmAndamento.get(id) === leitura) leiturasEmAndamento.delete(id);
    });
  leiturasEmAndamento.set(id, leitura);
  return leitura;
}

export async function apagarSegredo(id: string) {
  validarId(id);
  cache.delete(id);
  leiturasEmAndamento.delete(id);
  if (NO_LINUX) {
    await secretTool(["clear", "app", "niko", "id", id]);
    return;
  }
  if (process.platform !== "win32") return;
  await executar({ acao: "apagar", alvo: PREFIXO + id });
}