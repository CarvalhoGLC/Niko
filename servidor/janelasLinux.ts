import { execFile } from "node:child_process";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { iconeDoApp } from "./controleRapidoLinux";

// Duas fontes de janelas, nesta ordem:
//  1. extensão "Window Calls" do GNOME Shell (enxerga tudo, inclusive apps nativos de Wayland);
//  2. wmctrl/xprop (só janelas X11 e XWayland).

const DESTINO = "org.gnome.Shell";
const CAMINHO = "/org/gnome/Shell/Extensions/Windows";
const INTERFACE = "org.gnome.Shell.Extensions.Windows";

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

// O WM_CLASS pode vir como "instancia.Classe" ou como o id do app ("org.gnome.Nautilus").
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

// ---------- fonte 1: extensão Window Calls ----------

interface JanelaBruta {
  id: number;
  pid: number;
  classe: string;
  titulo: string;
  ativa: boolean;
  minimizada: boolean;
}

interface ItemDaExtensao {
  id?: number;
  pid?: number;
  wm_class?: string;
  wm_class_instance?: string;
  title?: string;
  window_type?: number;
  focus?: boolean;
  minimized?: boolean;
}

function chamarExtensao(metodo: string, assinatura?: string, valor?: string): Promise<string> {
  const argumentos = ["--user", "--json=short", "call", DESTINO, CAMINHO, INTERFACE, metodo];
  if (assinatura && valor !== undefined) argumentos.push(assinatura, valor);
  return rodar("busctl", argumentos);
}

async function textoDaExtensao(metodo: string, assinatura?: string, valor?: string): Promise<string> {
  const resposta = JSON.parse(await chamarExtensao(metodo, assinatura, valor)) as { data?: unknown[] };
  const texto = resposta.data?.[0];
  if (typeof texto !== "string") throw new Error("resposta_invalida");
  return texto;
}

const titulosEmCache = new Map<number, { titulo: string; quando: number }>();

async function tituloDaJanela(id: number): Promise<string> {
  const guardado = titulosEmCache.get(id);
  if (guardado && Date.now() - guardado.quando < 3000) return guardado.titulo;
  const titulo = await textoDaExtensao("GetTitle", "u", String(id)).catch(() => "");
  titulosEmCache.set(id, { titulo, quando: Date.now() });
  if (titulosEmCache.size > 200) for (const [chave, v] of titulosEmCache) if (Date.now() - v.quando > 30_000) titulosEmCache.delete(chave);
  return titulo;
}

async function janelasDaExtensao(): Promise<JanelaBruta[]> {
  const itens = JSON.parse(await textoDaExtensao("List")) as ItemDaExtensao[];
  const normais = itens.filter((i) => typeof i.id === "number" && (i.window_type === undefined || i.window_type === 0));
  return Promise.all(
    normais.map(async (i) => ({
      id: i.id as number,
      pid: Number(i.pid) || 0,
      classe: i.wm_class || i.wm_class_instance || "",
      titulo: (typeof i.title === "string" && i.title) || (await tituloDaJanela(i.id as number)) || i.wm_class || "",
      ativa: i.focus === true,
      minimizada: i.minimized === true,
    })),
  );
}

// ---------- fonte 2: wmctrl (X11 e XWayland) ----------

async function janelasDoX11(): Promise<JanelaBruta[]> {
  const [saida, raiz] = await Promise.all([rodar("wmctrl", ["-lpx"]), rodar("xprop", ["-root", "_NET_ACTIVE_WINDOW"]).catch(() => "")]);
  const ativa = /0x([0-9a-f]+)/i.exec(raiz);
  const idAtiva = ativa ? parseInt(ativa[1] ?? "0", 16) : 0;
  const brutas: { id: number; pid: number; classe: string; titulo: string }[] = [];
  for (const linha of saida.split("\n")) {
    const m = /^(0x[0-9a-f]+)\s+(-?\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/i.exec(linha);
    if (!m || m[2] === "-1") continue;
    const titulo = (m[6] ?? "").trim();
    if (!titulo) continue;
    brutas.push({ id: parseInt(m[1] ?? "0", 16), pid: Number(m[3]), classe: m[4] ?? "", titulo });
  }
  const minimizadas = await Promise.all(brutas.map((j) => rodar("xprop", ["-id", `0x${j.id.toString(16)}`, "_NET_WM_STATE"]).then((s) => s.includes("_NET_WM_STATE_HIDDEN"), () => false)));
  return brutas.map((j, i) => ({ ...j, ativa: j.id === idAtiva, minimizada: minimizadas[i] ?? false }));
}

// ---------- montagem da lista ----------

type Fonte = "extensao" | "x11";
let fonte: Fonte = "x11";
let extensaoIndisponivelAte = 0;
let ultimaFrente: { fonte: Fonte; id: number } | null = null;
let emCache: { quando: number; dados: Promise<{ janelas: unknown[] }> } | null = null;

async function coletar(): Promise<JanelaBruta[]> {
  if (Date.now() >= extensaoIndisponivelAte) {
    try {
      const lista = await janelasDaExtensao();
      fonte = "extensao";
      return lista;
    } catch {
      // Sem a extensão (ou sem D-Bus do Shell): tenta de novo só daqui a 15 s.
      extensaoIndisponivelAte = Date.now() + 15_000;
    }
  }
  fonte = "x11";
  return janelasDoX11();
}

async function montarLista(): Promise<{ janelas: unknown[] }> {
  const brutas = await coletar();
  const programas = new Map(brutas.map((j) => [j.id, j.pid > 0 ? (lerArquivo(`/proc/${j.pid}/comm`) ?? "") : ""]));
  const emFoco = brutas.find((j) => j.ativa && !j.minimizada);
  // Quando o foco está numa janela do próprio Niko, vale a última janela de fora, como no Windows.
  if (emFoco && programas.get(emFoco.id) !== "niko") ultimaFrente = { fonte, id: emFoco.id };
  const idFrente = emFoco && programas.get(emFoco.id) === "niko" ? (ultimaFrente?.fonte === fonte ? ultimaFrente.id : 0) : (emFoco?.id ?? 0);
  const janelas = brutas.flatMap((j) => {
    const programa = programas.get(j.id) ?? "";
    if (programa === "niko") return [];
    const app = acharApp(j.classe, programa);
    let caminho: string | null = null;
    if (j.pid > 0) {
      try {
        caminho = readlinkSync(`/proc/${j.pid}/exe`);
      } catch {
        caminho = null;
      }
    }
    return [{ id: String(j.id), pid: j.pid, titulo: j.titulo, minimizada: j.minimizada, ativa: j.id === idFrente && !j.minimizada, app: programa || j.classe, nome: app?.nome ?? (programa || j.classe), caminho, icone: app ? iconeDe(app.icone) : null }];
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
  emCache = null;
  if (fonte === "extensao") {
    const metodo = { focar: "Activate", minimizar: "Minimize", fechar: "Close" }[acao];
    return { ok: await funcionou(chamarExtensao(metodo, "u", String(id))) };
  }
  const hex = `0x${id.toString(16)}`;
  if (acao === "focar") return { ok: await funcionou(rodar("wmctrl", ["-i", "-a", hex])) };
  if (acao === "fechar") return { ok: await funcionou(rodar("wmctrl", ["-i", "-c", hex])) };
  const ok = (await funcionou(rodar("xdotool", ["windowminimize", String(id)]))) || (await funcionou(rodar("wmctrl", ["-i", "-r", hex, "-b", "add,hidden"])));
  return { ok };
}
