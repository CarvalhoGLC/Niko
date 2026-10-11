import { execFile, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import os from "node:os";

const ENERGIA = "/sys/class/power_supply";
const LUZ_DA_TELA = "/sys/class/backlight";
const AMBIENTE = { ...process.env, LC_ALL: "C.UTF-8", LANG: "C.UTF-8" };

function rodar(programa: string, argumentos: string[], limiteMs = 8000): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    execFile(programa, argumentos, { timeout: limiteMs, encoding: "utf8", env: AMBIENTE, maxBuffer: 8 * 1024 * 1024 }, (erro, saida) => (erro ? rejeitar(erro) : resolver(saida)));
  });
}

function tentar<T>(promessa: Promise<T>, padrao: T): Promise<T> {
  return promessa.catch(() => padrao);
}

const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

function lerSys(caminho: string): string | null {
  try {
    return readFileSync(caminho, "utf8").trim();
  } catch {
    return null;
  }
}

function arredondar(valor: number, casas = 1): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

// O nmcli em modo "-t" separa os campos com ":" e escapa ":" e "\" com barra invertida.
function campos(linha: string): string[] {
  const saida: string[] = [];
  let atual = "";
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === "\\" && i + 1 < linha.length) {
      atual += linha[++i];
      continue;
    }
    if (c === ":") {
      saida.push(atual);
      atual = "";
      continue;
    }
    atual += c;
  }
  saida.push(atual);
  return saida;
}

const linhasDe = (texto: string) => texto.split("\n").filter((l) => l.trim() !== "");

// ---------- bateria e tipo do computador ----------

function baterias(): string[] {
  try {
    return readdirSync(ENERGIA)
      .map((nome) => join(ENERGIA, nome))
      .filter((pasta) => lerSys(join(pasta, "type")) === "Battery" && lerSys(join(pasta, "scope")) !== "Device");
  } catch {
    return [];
  }
}

function bateria(): { nivel: number; carregando: boolean; minutos: number | null } | null {
  const pasta = baterias()[0];
  if (!pasta) return null;
  const nivel = Number(lerSys(join(pasta, "capacity")));
  if (!Number.isFinite(nivel)) return null;
  const status = lerSys(join(pasta, "status")) ?? "";
  const carregando = ["Charging", "Full", "Not charging"].includes(status);
  let minutos: number | null = null;
  if (status === "Discharging") {
    const energia = Number(lerSys(join(pasta, "energy_now")));
    const potencia = Number(lerSys(join(pasta, "power_now")));
    const carga = Number(lerSys(join(pasta, "charge_now")));
    const corrente = Number(lerSys(join(pasta, "current_now")));
    const horas = energia > 0 && potencia > 0 ? energia / potencia : carga > 0 && corrente > 0 ? carga / corrente : 0;
    if (horas > 0 && horas < 100) minutos = Math.round(horas * 60);
  }
  return { nivel: Math.round(nivel), carregando, minutos };
}

export async function tipo() {
  const temBateria = baterias().length > 0;
  const chassi = Number(lerSys("/sys/class/dmi/id/chassis_type"));
  const portateis = [8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32];
  return { notebook: temBateria || portateis.includes(chassi), bateria: temBateria };
}

// ---------- brilho ----------

function luzDaTela(): { nome: string; atual: number; max: number } | null {
  let nomes: string[] = [];
  try {
    nomes = readdirSync(LUZ_DA_TELA);
  } catch {
    return null;
  }
  const prioridade = (nome: string) => ["raw", "platform", "firmware"].indexOf(lerSys(join(LUZ_DA_TELA, nome, "type")) ?? "");
  const ordenados = [...nomes].sort((a, b) => {
    const pa = prioridade(a);
    const pb = prioridade(b);
    return (pa < 0 ? 9 : pa) - (pb < 0 ? 9 : pb);
  });
  for (const nome of ordenados) {
    const atual = Number(lerSys(join(LUZ_DA_TELA, nome, "brightness")));
    const max = Number(lerSys(join(LUZ_DA_TELA, nome, "max_brightness")));
    if (max > 0 && Number.isFinite(atual)) return { nome, atual, max };
  }
  return null;
}

function brilhoAtual(): number | null {
  const luz = luzDaTela();
  return luz ? Math.round((luz.atual / luz.max) * 100) : null;
}

export async function brilho(nivel: number) {
  const luz = luzDaTela();
  if (!luz) throw new Error("brilho_indisponivel");
  const percentual = Math.max(0, Math.min(100, nivel));
  const alvo = Math.max(1, Math.round((luz.max * percentual) / 100));
  // O logind aceita a troca de brilho do usuário da sessão ativa, sem precisar de root.
  await rodar("busctl", ["call", "org.freedesktop.login1", "/org/freedesktop/login1/session/auto", "org.freedesktop.login1.Session", "SetBrightness", "ssu", "backlight", luz.nome, String(alvo)]);
  return { ok: true, brilho: percentual };
}

// ---------- Wi-Fi ----------

async function dispositivoWifi(): Promise<{ nome: string; estado: string } | null> {
  const saida = await tentar(rodar("nmcli", ["-t", "-f", "DEVICE,TYPE,STATE", "device"]), "");
  const achado = linhasDe(saida).map(campos).find((c) => c[1] === "wifi");
  return achado ? { nome: achado[0] ?? "", estado: achado[2] ?? "" } : null;
}

async function wifiAtual() {
  const [dispositivo, lista] = await Promise.all([dispositivoWifi(), tentar(rodar("nmcli", ["-t", "-f", "ACTIVE,SSID,SIGNAL", "device", "wifi", "list", "--rescan", "no"]), "")]);
  const atual: { ssid: string | null; sinal: number | null; conectado: boolean; existe: boolean } = { ssid: null, sinal: null, conectado: dispositivo?.estado === "connected", existe: dispositivo !== null };
  if (atual.conectado) {
    for (const linha of linhasDe(lista)) {
      const c = campos(linha);
      if (c[0] === "yes") {
        atual.ssid = c[1] || null;
        atual.sinal = Number(c[2]) || 0;
        break;
      }
    }
  }
  return atual;
}

async function perfisSalvos(): Promise<Set<string>> {
  const saida = await tentar(rodar("nmcli", ["-t", "-f", "NAME,TYPE", "connection", "show"]), "");
  return new Set(
    linhasDe(saida)
      .map(campos)
      .filter((c) => c[1] === "802-11-wireless")
      .map((c) => c[0] ?? ""),
  );
}

export async function redes() {
  const [lista, conhecidas] = await Promise.all([rodar("nmcli", ["-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", "auto"], 25000), perfisSalvos()]);
  const mapa = new Map<string, { ssid: string; sinal: number; segura: boolean; salva: boolean }>();
  for (const linha of linhasDe(lista)) {
    const [ssid = "", sinalTexto = "0", seguranca = ""] = campos(linha);
    if (!ssid) continue;
    const sinal = Number(sinalTexto) || 0;
    const anterior = mapa.get(ssid);
    if (!anterior || sinal > anterior.sinal) mapa.set(ssid, { ssid, sinal, segura: seguranca !== "" && seguranca !== "--", salva: conhecidas.has(ssid) });
  }
  return { redes: [...mapa.values()].sort((a, b) => b.sinal - a.sinal) };
}

export async function conectar(ssid: string, senha: string) {
  if (ssid.startsWith("-")) throw new Error("valor_invalido");
  const jaSalva = (await perfisSalvos()).has(ssid);
  try {
    if (jaSalva) await rodar("nmcli", ["--wait", "20", "connection", "up", "id", ssid], 30000);
    else await rodar("nmcli", ["--wait", "20", "device", "wifi", "connect", ssid, ...(senha ? ["password", senha] : [])], 30000);
  } catch {
    // Senha errada deixa um perfil quebrado para trás; só apaga se foi esta tentativa que criou.
    if (!jaSalva) await tentar(rodar("nmcli", ["connection", "delete", "id", ssid]), "");
  }
  return { ok: true, wifi: await wifiAtual() };
}

export async function esquecer(ssid: string) {
  if (ssid.startsWith("-")) throw new Error("valor_invalido");
  await tentar(rodar("nmcli", ["connection", "delete", "id", ssid]), "");
  return { ok: true };
}

export async function desconectar() {
  const dispositivo = await dispositivoWifi();
  if (dispositivo) await tentar(rodar("nmcli", ["device", "disconnect", dispositivo.nome]), "");
  return { ok: true };
}

// ---------- rádios e Bluetooth ----------

async function radios(): Promise<Record<string, boolean>> {
  const saida: Record<string, boolean> = {};
  const [wifi, bluetooth] = await Promise.all([tentar(rodar("nmcli", ["radio", "wifi"]), ""), tentar(rodar("bluetoothctl", ["show"]), "")]);
  if (wifi.trim()) saida.WiFi = wifi.trim() === "enabled";
  if (/Powered:/.test(bluetooth)) saida.Bluetooth = /Powered:\s*yes/.test(bluetooth);
  return saida;
}

export async function radio(tipoDoRadio: "WiFi" | "Bluetooth", ligado: boolean) {
  const existentes = await radios();
  if (!(tipoDoRadio in existentes)) throw new Error("radio_ausente");
  if (tipoDoRadio === "WiFi") {
    await rodar("nmcli", ["radio", "wifi", ligado ? "on" : "off"]);
  } else if (ligado) {
    await tentar(rodar("rfkill", ["unblock", "bluetooth"]), "");
    await rodar("bluetoothctl", ["power", "on"]);
  } else {
    await rodar("bluetoothctl", ["power", "off"]);
  }
  await esperar(800);
  return { ok: true, radios: await radios() };
}

interface Aparelho {
  id: string;
  nome: string;
  ativo: boolean;
  conectado: boolean;
}

async function aparelhosBluetooth(): Promise<Aparelho[]> {
  let saida = await tentar(rodar("bluetoothctl", ["devices", "Paired"]), "");
  if (!/^Device\s/m.test(saida)) saida = await tentar(rodar("bluetoothctl", ["paired-devices"]), "");
  const itens = linhasDe(saida)
    .map((linha) => /^Device\s+([0-9A-Fa-f:]{17})\s+(.*)$/.exec(linha.trim()))
    .filter((m): m is RegExpExecArray => m !== null);
  const lista = await Promise.all(
    itens.map(async (m) => {
      const info = await tentar(rodar("bluetoothctl", ["info", m[1] ?? ""]), "");
      const conectado = /Connected:\s*yes/.test(info);
      return { id: m[1] ?? "", nome: m[2] ?? "", ativo: conectado, conectado };
    }),
  );
  return lista.sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome));
}

export async function bluetooth() {
  return { aparelhos: await aparelhosBluetooth() };
}

// ---------- estado geral (ilha) ----------

let estadoEmCache: { quando: number; dados: Promise<unknown> } | null = null;

export function estado(): Promise<unknown> {
  if (!estadoEmCache || Date.now() - estadoEmCache.quando > 2000) {
    const dados = Promise.all([wifiAtual(), radios()]).then(([wifi, rad]) => ({ bateria: bateria(), brilho: brilhoAtual(), wifi, radios: rad }));
    estadoEmCache = { quando: Date.now(), dados };
    dados.catch(() => (estadoEmCache = null));
  }
  return estadoEmCache.dados;
}

// ---------- informações do computador ----------

async function usoDaCpu(): Promise<number> {
  const ler = () =>
    os.cpus().reduce(
      (soma, cpu) => {
        const t = cpu.times;
        soma.total += t.user + t.nice + t.sys + t.idle + t.irq;
        soma.ocioso += t.idle;
        return soma;
      },
      { total: 0, ocioso: 0 },
    );
  const antes = ler();
  await esperar(300);
  const depois = ler();
  const total = depois.total - antes.total;
  return total > 0 ? Math.round((1 - (depois.ocioso - antes.ocioso) / total) * 100) : 0;
}

function memoria(): { total: number; livre: number } {
  const texto = lerSys("/proc/meminfo") ?? "";
  const kb = (chave: string) => Number(new RegExp(`^${chave}:\\s+(\\d+)`, "m").exec(texto)?.[1] ?? 0);
  return { total: kb("MemTotal"), livre: kb("MemAvailable") };
}

function nomeDoSistema(): string {
  const texto = lerSys("/etc/os-release") ?? "";
  const bonito = /^PRETTY_NAME="?([^"\n]*)"?/m.exec(texto)?.[1] ?? "Linux";
  return `${bonito} (kernel ${os.release()})`;
}

function modeloDoComputador(fabricante: string): string {
  const nome = lerSys("/sys/class/dmi/id/product_name") ?? "";
  const versao = lerSys("/sys/class/dmi/id/product_version") ?? "";
  // Nos Lenovo o product_name é um código; o nome comercial fica em product_version.
  if (/lenovo/i.test(fabricante) && versao && !/^(none|n\/a|not |default|to be)/i.test(versao)) return versao;
  return nome;
}

async function placasDeVideo(): Promise<string[]> {
  const saida = await tentar(rodar("lspci", ["-mm"]), "");
  const placas: string[] = [];
  for (const linha of linhasDe(saida)) {
    const partes = [...linha.matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? "");
    if (partes.length >= 3 && /VGA|3D|Display/i.test(partes[0] ?? "")) placas.push(`${partes[1]} ${partes[2]}`.trim());
  }
  return placas;
}

async function discos() {
  const saida = await tentar(rodar("df", ["-B1", "--output=source,target,size,avail", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs", "-x", "overlay", "-x", "efivarfs"]), "");
  const vistos = new Set<string>();
  const lista: { unidade: string; nome: string; total_gb: number; livre_gb: number }[] = [];
  for (const linha of linhasDe(saida).slice(1)) {
    const m = /^(\S+)\s+(.+?)\s+(\d+)\s+(\d+)$/.exec(linha.trim());
    if (!m || !(m[1] ?? "").startsWith("/dev/") || vistos.has(m[1] ?? "")) continue;
    vistos.add(m[1] ?? "");
    lista.push({ unidade: m[2] ?? "", nome: basename(m[1] ?? ""), total_gb: arredondar(Number(m[3]) / 2 ** 30), livre_gb: arredondar(Number(m[4]) / 2 ** 30) });
  }
  return lista;
}

async function processos() {
  const saida = await tentar(rodar("ps", ["-eo", "comm=,rss=,cputimes="]), "");
  const grupos = new Map<string, { nome: string; processos: number; memoria_mb: number; cpu_segundos: number }>();
  let total = 0;
  for (const linha of linhasDe(saida)) {
    const partes = linha.trim().split(/\s+/);
    const cpu = Number(partes.pop());
    const rss = Number(partes.pop());
    const nome = partes.join(" ");
    // Threads do kernel não têm memória residente; só contam programas de verdade.
    if (!nome || !Number.isFinite(rss) || rss <= 0) continue;
    total++;
    const grupo = grupos.get(nome) ?? { nome, processos: 0, memoria_mb: 0, cpu_segundos: 0 };
    grupo.processos++;
    grupo.memoria_mb += rss / 1024;
    grupo.cpu_segundos += Number.isFinite(cpu) ? cpu : 0;
    grupos.set(nome, grupo);
  }
  const todos = [...grupos.values()].map((g) => ({ ...g, memoria_mb: Math.round(g.memoria_mb), cpu_segundos: Math.round(g.cpu_segundos) }));
  return {
    total,
    porMemoria: [...todos].sort((a, b) => b.memoria_mb - a.memoria_mb).slice(0, 12),
    porCpu: [...todos].sort((a, b) => b.cpu_segundos - a.cpu_segundos).slice(0, 8),
  };
}

async function janelasAbertas(): Promise<{ programa: string; titulo: string }[]> {
  // Só enxerga janelas de apps no X11/XWayland; no Wayland puro a lista vem vazia.
  const saida = await tentar(rodar("wmctrl", ["-lp"]), "");
  const lista: { programa: string; titulo: string }[] = [];
  for (const linha of linhasDe(saida)) {
    const m = /^0x[0-9a-f]+\s+(-?\d+)\s+(\d+)\s+\S+\s+(.*)$/i.exec(linha);
    if (!m || m[1] === "-1" || !(m[3] ?? "").trim()) continue;
    lista.push({ programa: lerSys(`/proc/${m[2]}/comm`) ?? "", titulo: (m[3] ?? "").trim() });
    if (lista.length >= 30) break;
  }
  return lista;
}

function enderecos(): { interface: string; ip: string }[] {
  const lista: { interface: string; ip: string }[] = [];
  for (const [nome, itens] of Object.entries(os.networkInterfaces())) {
    for (const item of itens ?? []) {
      if (item.family === "IPv4" && !item.internal && !item.address.startsWith("169.254.")) lista.push({ interface: nome, ip: item.address });
    }
  }
  return lista;
}

export async function computador() {
  const fabricante = lerSys("/sys/class/dmi/id/sys_vendor") ?? "";
  const mem = memoria();
  const cpus = os.cpus();
  const [uso, placas, listaDiscos, procs, janelas, wifi, aparelhos] = await Promise.all([usoDaCpu(), placasDeVideo(), discos(), processos(), janelasAbertas(), wifiAtual(), aparelhosBluetooth()]);
  return {
    nome: os.hostname(),
    sistema: nomeDoSistema(),
    fabricante,
    modelo: modeloDoComputador(fabricante),
    processador: cpus[0]?.model ?? "",
    nucleos: cpus.length,
    uso_cpu_pct: uso,
    memoria_total_gb: arredondar(mem.total / 1048576),
    memoria_livre_gb: arredondar(mem.livre / 1048576),
    placa_de_video: placas,
    ligado_ha_horas: arredondar(os.uptime() / 3600),
    discos: listaDiscos,
    bateria: bateria(),
    wifi,
    ips: enderecos(),
    bluetooth: aparelhos.map((a) => ({ nome: a.nome, conectado: a.conectado })),
    programas_mais_memoria: procs.porMemoria,
    programas_mais_cpu_acumulada: procs.porCpu,
    janelas_abertas: janelas,
    total_processos: procs.total,
  };
}

// ---------- configurações do sistema ----------

function abrirDesacoplado(programa: string, argumentos: string[]): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(programa, argumentos, { detached: true, stdio: "ignore" });
    filho.on("error", rejeitar);
    filho.on("spawn", () => {
      filho.unref();
      resolver();
    });
  });
}

export async function configuracoes(pagina: "bluetooth" | "wifi" | "rede" | "bateria") {
  const gnome = { bluetooth: "bluetooth", wifi: "wifi", rede: "wifi", bateria: "power" }[pagina];
  const kde = { bluetooth: "kcm_bluetooth", wifi: "kcm_networkmanagement", rede: "kcm_networkmanagement", bateria: "kcm_powerdevilprofilesconfig" }[pagina];
  try {
    await abrirDesacoplado("gnome-control-center", [gnome]);
  } catch {
    await abrirDesacoplado("systemsettings", [kde]).catch(() => {
      throw new Error("configuracoes_indisponiveis");
    });
  }
  return { ok: true };
}