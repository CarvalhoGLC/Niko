import { execFile } from "node:child_process";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { iconeDoApp } from "./controleRapidoLinux";

// Funciona com janelas X11 e XWayland. Apps nativos de Wayland não aparecem nas ferramentas abaixo.

function rodar(programa: string, argumentos: string[], limiteMs = 5000): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    execFile(programa, argumentos, { timeout: limiteMs, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (erro, saida) => (erro ? rejeitar(erro) : resolver(saida)));
  });
}

const funcionou = (promessa: Promise<unknown>) =>
  promessa.then(
    () => true,
    () => false,
  );

function lerArquivo(caminho: string): string | null {
  try {
    return readFileSync(caminho, "utf8").trim();
  } catch {
    return null;
  }
}

// ---------- catálogo de aplicativos (arquivos .desktop) ----------

interface AppDesktop {
  nome: string;
  icone: string;
}

let catalogo: { em: number; mapa: Map<string, AppDesktop> } | null = null;

function pastasDeApps(): string[] {
  const casa = homedir();
  const dados = (process.env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":").filter(Boolean);
  return [join(casa, ".local/share/applications"), ...dados.map((d) => join(d, "applications")), "/var/lib/flatpak/exports/share/applications", join(casa, ".local/share/flatpak/exports/share/applications")];
}

function catalogoDeApps(): Map<string, AppDesktop> {
  if (catalogo && Date.now() - catalogo.em < 120_000) return catalogo.mapa;
  const mapa = new Map<string, AppDesktop>();
  for (const pasta of pastasDeApps()) {
    let arquivos: string[] = [];
    try {
      arquivos = readdirSync(pasta);
    } catch {
      continue;
    }
    for (const arquivo of arquivos) {
      if (!arquivo.endsWith(".desktop")) continue;
      let texto = "";
      try {
        texto = readFileSync(join(pasta, arquivo), "utf8");
      } catch {
        continue;
      }
      const entrada = texto.split(/^\[(?!Desktop Entry\])/m)[0] ?? "";
      const campo = (chave: string) => new RegExp(`^${chave}=(.*)$`, "m").exec(entrada)?.[1]?.trim() ?? "";
      const nome = campo("Name");
      if (!nome) continue;
      const chaves = [campo("StartupWMClass"), arquivo.replace(/\.desktop$/, ""), basename(campo("Exec").split(/\s+/)[0] ?? "")].map((c) => c.toLowerCase()).filter(Boolean);
      for (const chave of chaves) if (!mapa.has(chave)) mapa.set(chave, { nome, icone: campo("Icon") });
    }
  }
  catalogo = { em: Date.now(), mapa };
  return mapa;
}

function iconeDe(icone: string): string | null {
  if (!icone) return null;
  if (!icone.startsWith("/")) return iconeDoApp(icone);
  try {
    const bytes = readFileSync(icone);
    if (bytes.length === 0 || bytes.length > 300_000) return null;
    const tipo = /\.svg$/i.test(icone) ? "image/svg+xml" : "image/png";
    return `data:${tipo};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// O WM_CLASS vem como "instancia.Classe"; qualquer pedaço pode ser o nome do .desktop.
function acharApp(classe: string, programa: string): AppDesktop | null {
  const partes = classe.toLowerCase().split(".");
  const candidatos = [classe.toLowerCase()];
  for (let i = 1; i < partes.length; i++) candidatos.push(partes.slice(i).join("."));
  for (let i = partes.length - 1; i > 0; i--) candidatos.push(partes.slice(0, i).join("."));
  candidatos.push(programa.toLowerCase());
  const mapa = catalogoDeApps();
  for (const candidato of candidatos) {
    const achado = candidato ? mapa.get(candidato) : undefined;
    if (achado) return achado;
  }
  return null;
}

// ---------- janelas ----------

interface JanelaX {
  id: number;
  pid: number;
  classe: string;
  titulo: string;
}

async function janelasDoX(): Promise<JanelaX[]> {
  const saida = await rodar("wmctrl", ["-lpx"]);
  const lista: JanelaX[] = [];
  for (const linha of saida.split("\n")) {
    const m = /^(0x[0-9a-f]+)\s+(-?\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/i.exec(linha);
    if (!m || m[2] === "-1") continue;
    const titulo = (m[6] ?? "").trim();
    if (!titulo) continue;
    lista.push({ id: parseInt(m[1] ?? "0", 16), pid: Number(m[3]), classe: m[4] ?? "", titulo });
  }
  return lista;
}

async function janelaAtiva(): Promise<number> {
  const saida = await rodar("xprop", ["-root", "_NET_ACTIVE_WINDOW"]).catch(() => "");
  const m = /0x([0-9a-f]+)/i.exec(saida);
  return m ? parseInt(m[1] ?? "0", 16) : 0;
}

async function estaMinimizada(id: number): Promise<boolean> {
  const saida = await rodar("xprop", ["-id", `0x${id.toString(16)}`, "_NET_WM_STATE"]).catch(() => "");
  return saida.includes("_NET_WM_STATE_HIDDEN");
}

let ultimaFrente = 0;
let emCache: { quando: number; dados: Promise<{ janelas: unknown[] }> } | null = null;

async function montarLista(): Promise<{ janelas: unknown[] }> {
  const [brutas, ativa] = await Promise.all([janelasDoX(), janelaAtiva()]);
  const programas = new Map(brutas.map((j) => [j.id, lerArquivo(`/proc/${j.pid}/comm`) ?? ""]));
  // Quando o foco está numa janela do próprio Niko, vale a última janela de fora, como no Windows.
  if (ativa !== 0 && programas.get(ativa) !== "niko") ultimaFrente = ativa;
  const frente = programas.get(ativa) === "niko" ? ultimaFrente : ativa;
  const minimizadas = await Promise.all(brutas.map((j) => estaMinimizada(j.id)));
  const janelas = brutas.flatMap((j, i) => {
    const programa = programas.get(j.id) ?? "";
    if (programa === "niko") return [];
    const app = acharApp(j.classe, programa);
    const minimizada = minimizadas[i] ?? false;
    let caminho: string | null = null;
    try {
      caminho = readlinkSync(`/proc/${j.pid}/exe`);
    } catch {
      caminho = null;
    }
    return [{ id: String(j.id), pid: j.pid, titulo: j.titulo, minimizada, ativa: j.id === frente && !minimizada, app: programa, nome: app?.nome ?? programa ?? j.classe, caminho, icone: app ? iconeDe(app.icone) : null }];
  });
  return { janelas };
}

function listar(): Promise<{ janelas: unknown[] }> {
  if (!emCache || Date.now() - emCache.quando > 700) {
    const dados = montarLista();
    emCache = { quando: Date.now(), dados };
    dados.catch(() => (emCache = null));
  }
  return emCache.dados;
}

export async function pedirJanelasLinux(acao: "listar" | "focar" | "minimizar" | "fechar", janela?: string): Promise<unknown> {
  if (acao === "listar") return listar().catch(() => ({ janelas: [] }));
  const id = Number(janela);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("janela_invalida");
  const hex = `0x${id.toString(16)}`;
  emCache = null;
  if (acao === "focar") return { ok: await funcionou(rodar("wmctrl", ["-i", "-a", hex])) };
  if (acao === "fechar") return { ok: await funcionou(rodar("wmctrl", ["-i", "-c", hex])) };
  const ok = (await funcionou(rodar("xdotool", ["windowminimize", String(id)]))) || (await funcionou(rodar("wmctrl", ["-i", "-r", hex, "-b", "add,hidden"])));
  return { ok };
}