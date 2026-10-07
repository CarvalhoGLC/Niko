import { execFile, spawn } from "node:child_process";
import { readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AMBIENTE = { ...process.env, LC_ALL: "C.UTF-8", LANG: "C.UTF-8" };

function rodar(programa: string, argumentos: string[], limiteMs = 8000): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    execFile(programa, argumentos, { timeout: limiteMs, encoding: "utf8", env: AMBIENTE, maxBuffer: 8 * 1024 * 1024 }, (erro, saida) => (erro ? rejeitar(erro) : resolver(saida)));
  });
}

function tentar<T>(promessa: Promise<T>, padrao: T): Promise<T> {
  return promessa.catch(() => padrao);
}

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

// Tenta cada alternativa em ordem e para na primeira que abre.
async function primeiraQueAbre(alternativas: [string, string[]][]): Promise<boolean> {
  for (const [programa, argumentos] of alternativas) {
    try {
      await abrirDesacoplado(programa, argumentos);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

// ---------- áudio: volume geral (WirePlumber) ----------

const ALVOS = ["@DEFAULT_AUDIO_SINK@", "@DEFAULT_AUDIO_SOURCE@"] as const;

async function pontaDeAudio(alvo: string): Promise<{ volume: number; mudo: boolean } | null> {
  const saida = await tentar(rodar("wpctl", ["get-volume", alvo]), "");
  const m = /Volume:\s*([\d.]+)/.exec(saida);
  if (!m) return null;
  return { volume: Math.max(0, Math.min(100, Math.round(Number(m[1]) * 100))), mudo: /\[MUTED\]/.test(saida) };
}

export async function volume(fluxo: number, valor: number) {
  const alvo = ALVOS[fluxo];
  if (!alvo) return { ok: false };
  const ok = await rodar("wpctl", ["set-volume", alvo, `${Math.max(0, Math.min(100, valor))}%`]).then(
    () => true,
    () => false,
  );
  return { ok };
}

export async function mudo(fluxo: number, silenciar: boolean) {
  const alvo = ALVOS[fluxo];
  if (!alvo) return { ok: false };
  const ok = await rodar("wpctl", ["set-mute", alvo, silenciar ? "1" : "0"]).then(
    () => true,
    () => false,
  );
  return { ok };
}

// ---------- áudio: volume por aplicativo (PulseAudio/PipeWire via pactl) ----------

interface EntradaDeAudio {
  index: number;
  mute?: boolean;
  corked?: boolean;
  volume?: Record<string, { value_percent?: string }>;
  properties?: Record<string, string>;
}

async function entradasDeAudio(): Promise<EntradaDeAudio[]> {
  const saida = await tentar(rodar("pactl", ["--format=json", "list", "sink-inputs"]), "[]");
  try {
    const lista = JSON.parse(saida) as unknown;
    return Array.isArray(lista) ? (lista as EntradaDeAudio[]) : [];
  } catch {
    return [];
  }
}

// Apps sem PID no PipeWire (alguns sandboxes) ganham um id sintético estável por stream.
function idDaSessao(e: EntradaDeAudio): number {
  const pid = Number(e.properties?.["application.process.id"]);
  return Number.isInteger(pid) && pid > 0 ? pid : 4_000_000_000 + e.index;
}

function volumeDaEntrada(e: EntradaDeAudio): number {
  const primeiro = Object.values(e.volume ?? {})[0];
  const n = parseInt(primeiro?.value_percent ?? "0", 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

const iconesEmCache = new Map<string, string | null>();

export function iconeDoApp(nome: string | undefined): string | null {
  if (!nome || !/^[A-Za-z0-9._-]{1,100}$/.test(nome)) return null;
  if (iconesEmCache.has(nome)) return iconesEmCache.get(nome) ?? null;
  const casa = homedir();
  const bases = [join(casa, ".local/share/icons"), "/usr/share/icons", "/var/lib/flatpak/exports/share/icons", join(casa, ".local/share/flatpak/exports/share/icons")];
  const candidatos: [string, string][] = [];
  for (const base of bases) for (const lado of ["64x64", "48x48", "128x128", "256x256", "32x32"]) candidatos.push([join(base, "hicolor", lado, "apps", `${nome}.png`), "image/png"]);
  for (const base of bases) candidatos.push([join(base, "hicolor", "scalable", "apps", `${nome}.svg`), "image/svg+xml"]);
  candidatos.push([`/usr/share/pixmaps/${nome}.png`, "image/png"]);
  let valor: string | null = null;
  for (const [caminho, tipo] of candidatos) {
    try {
      const bytes = readFileSync(caminho);
      if (bytes.length > 0 && bytes.length <= 300_000) {
        valor = `data:${tipo};base64,${bytes.toString("base64")}`;
        break;
      }
    } catch {
      continue;
    }
  }
  iconesEmCache.set(nome, valor);
  return valor;
}

function caminhoDoProcesso(pid: number): string | null {
  try {
    return readlinkSync(`/proc/${pid}/exe`);
  } catch {
    return null;
  }
}

export async function audio() {
  const [saida, entrada, entradas] = await Promise.all([pontaDeAudio(ALVOS[0]), pontaDeAudio(ALVOS[1]), entradasDeAudio()]);
  const sessoes = entradas.map((e) => {
    const props = e.properties ?? {};
    const pid = idDaSessao(e);
    return {
      pid,
      sistema: false,
      ativa: e.corked !== true,
      volume: volumeDaEntrada(e),
      mudo: e.mute === true,
      nome: props["application.name"] ?? props["application.process.binary"] ?? props["media.name"] ?? "",
      caminho: pid < 4_000_000_000 ? caminhoDoProcesso(pid) : null,
      icone: iconeDoApp(props["application.icon_name"] ?? props["application.process.binary"]),
    };
  });
  return { saida, entrada, sessoes };
}

export async function sessao(pids: number[], volumePedido: number, mudoPedido: number) {
  const alvos = new Set(pids);
  let ajustadas = 0;
  for (const e of await entradasDeAudio()) {
    if (!alvos.has(idDaSessao(e))) continue;
    if (volumePedido >= 0) await tentar(rodar("pactl", ["set-sink-input-volume", String(e.index), `${volumePedido}%`]), "");
    if (mudoPedido >= 0) await tentar(rodar("pactl", ["set-sink-input-mute", String(e.index), String(mudoPedido)]), "");
    ajustadas++;
  }
  return { ajustadas };
}

// ---------- tema ----------

const INTERFACE_GNOME = "org.gnome.desktop.interface";

export async function tema() {
  const esquema = await tentar(rodar("gsettings", ["get", INTERFACE_GNOME, "color-scheme"]), "");
  return { escuro: esquema.includes("prefer-dark") };
}

export async function definirTema(escuro: boolean) {
  await rodar("gsettings", ["set", INTERFACE_GNOME, "color-scheme", escuro ? "'prefer-dark'" : "'default'"]).catch(() => {
    throw new Error("tema_indisponivel");
  });
  // Apps GTK3 antigos só obedecem ao tema; troca só se o usuário usa o Adwaita padrão.
  const atual = (await tentar(rodar("gsettings", ["get", INTERFACE_GNOME, "gtk-theme"]), "")).trim().replace(/'/g, "");
  if (atual === "Adwaita" || atual === "Adwaita-dark") await tentar(rodar("gsettings", ["set", INTERFACE_GNOME, "gtk-theme", escuro ? "'Adwaita-dark'" : "'Adwaita'"]), "");
  return tema();
}

// ---------- ferramentas rápidas ----------

export async function ferramenta(nome: string) {
  if (nome === "captura") {
    const abriu = await primeiraQueAbre([
      ["gnome-screenshot", ["-i"]],
      ["spectacle", ["-r"]],
      ["flameshot", ["gui"]],
    ]);
    if (!abriu) {
      await rodar("gdbus", ["call", "--session", "--dest", "org.freedesktop.portal.Desktop", "--object-path", "/org/freedesktop/portal/desktop", "--method", "org.freedesktop.portal.Screenshot.Screenshot", "", "{'interactive': <true>}"]).catch(() => {
        throw new Error("ferramenta_indisponivel");
      });
    }
    return { ok: true };
  }
  if (nome === "teclado") {
    const abriu = await primeiraQueAbre([["onboard", []]]);
    if (!abriu) {
      await rodar("gsettings", ["set", "org.gnome.desktop.a11y.applications", "screen-keyboard-enabled", "true"]).catch(() => {
        throw new Error("ferramenta_indisponivel");
      });
    }
    return { ok: true };
  }
  if (nome === "iniciar") {
    const tentativas: [string, string[]][] = [
      ["gdbus", ["call", "--session", "--dest", "org.gnome.Shell", "--object-path", "/org/gnome/Shell", "--method", "org.gnome.Shell.FocusSearch"]],
      ["gdbus", ["call", "--session", "--dest", "org.kde.plasmashell", "--object-path", "/PlasmaShell", "--method", "org.kde.PlasmaShell.activateLauncherMenu"]],
      ["xdotool", ["key", "Super_L"]],
    ];
    for (const [programa, argumentos] of tentativas) {
      try {
        await rodar(programa, argumentos);
        return { ok: true, aberto: false };
      } catch {
        continue;
      }
    }
    throw new Error("ferramenta_indisponivel");
  }
  if (nome === "papelDeParede") {
    const abriu = await primeiraQueAbre([
      ["gnome-control-center", ["background"]],
      ["systemsettings", ["kcm_wallpaper"]],
    ]);
    if (!abriu) throw new Error("ferramenta_indisponivel");
    return { ok: true };
  }
  throw new Error("ferramenta_desconhecida");
}

export async function iniciarAberto() {
  // Não há como saber se a visão geral do GNOME está aberta; a interface trata como fechada.
  return { aberto: false };
}

// ---------- energia ----------

export async function energia(tipo: string) {
  const comandos: Record<string, [string, string[]]> = {
    bloquear: ["loginctl", ["lock-session"]],
    suspender: ["systemctl", ["suspend"]],
    reiniciar: ["systemctl", ["reboot"]],
    desligar: ["systemctl", ["poweroff"]],
  };
  const comando = comandos[tipo];
  if (!comando) throw new Error("acao_desconhecida");
  try {
    await rodar(comando[0], comando[1], 15000);
  } catch {
    if (tipo !== "bloquear") throw new Error("falha_energia");
    await rodar("xdg-screensaver", ["lock"]).catch(() => {
      throw new Error("falha_energia");
    });
  }
  return { ok: true };
}

// ---------- bandeja ----------

export async function bandeja() {
  // A bandeja de ícones do Windows não existe no Linux; o GNOME e o KDE têm a própria.
  return { itens: [] as { caminho: string; nome: string; dica: string | null; icone: string | null }[] };
}