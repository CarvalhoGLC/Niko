import type { IncomingMessage, ServerResponse } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  CABECALHO_SEGREDO, estadoDaInstalacao, instalarGanchos, lerCorpoJson, porta, processarEvento, removerGanchos, segredo, segredoConfere, type FerramentaDeCodigo,
} from "./claude";

const PREFIXO_DA_ROTA = "/ponte/agentes/evento/";
const TEMPO_DO_PEDIDO_S = 115;
const TEMPO_DO_GANCHO_DECISAO_S = 120;
const TEMPO_DO_GANCHO_RAPIDO_S = 10;
const TEMPO_DO_GANCHO_FINAL_S = 3;
const INICIO_DO_BLOCO_TOML = "# niko:inicio (gerado pelo Niko, remova pelo Niko)";
const FIM_DO_BLOCO_TOML = "# niko:fim";

export const FERRAMENTAS_DE_CODIGO: FerramentaDeCodigo[] = ["claude", "codex", "copilot", "opencode", "antigravity", "kimi"];
const FERRAMENTAS_COM_RESPOSTA_JSON = new Set<FerramentaDeCodigo>(["copilot", "antigravity"]);

type Corpo = Record<string, unknown>;

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function objeto(v: unknown): Corpo {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Corpo) : {};
}

function casa(...partes: string[]) {
  return join(homedir(), ...partes);
}

function urlDoEvento(ferramenta: FerramentaDeCodigo, evento: string) {
  return `http://127.0.0.1:${porta()}${PREFIXO_DA_ROTA}${ferramenta}?evento=${encodeURIComponent(evento)}`;
}

export function comandoDoGancho(ferramenta: FerramentaDeCodigo, evento: string, chave: string, decide = false) {
  const tempo = decide ? TEMPO_DO_PEDIDO_S : TEMPO_DO_GANCHO_RAPIDO_S - 2;
  return `curl.exe -s -m ${tempo} -X POST -H "content-type: application/json" -H "${CABECALHO_SEGREDO}: ${chave}" --data-binary "@-" "${urlDoEvento(ferramenta, evento)}"`;
}

const EVENTOS_DO_COPILOT: Record<string, string> = {
  sessionStart: "SessionStart",
  sessionEnd: "SessionEnd",
  userPromptSubmitted: "UserPromptSubmit",
  preToolUse: "PreToolUse",
  postToolUseFailure: "PostToolUseFailure",
  agentStop: "Stop",
  errorOccurred: "StopFailure",
  notification: "Notification",
  permissionRequest: "PermissionRequest",
  subagentStart: "SubagentStart",
  subagentStop: "SubagentStop",
};

const EVENTOS_DO_CODEX = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "Stop", "Interrupt", "SubagentStart", "SubagentStop"];
const EVENTOS_DO_KIMI = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "Notification", "Stop", "Interrupt"];
const EVENTOS_DO_ANTIGRAVITY = ["PreInvocation", "PreToolUse", "Stop"];

function tipoDeAviso(tipo: string): string {
  return /permission|approv|input|idle|elicitation/i.test(tipo) ? "agent_needs_input" : tipo;
}

function argumentos(v: unknown): Corpo {
  if (typeof v === "string") {
    try {
      return objeto(JSON.parse(v));
    } catch {
      return { command: v };
    }
  }
  return objeto(v);
}

/** Converte o evento de cada ferramenta para o formato dos hooks do Claude Code, que a ilha já entende. */
export function normalizarEvento(ferramenta: FerramentaDeCodigo, eventoDaRota: string, corpo: Corpo): Corpo | null {
  if (ferramenta === "copilot") {
    const nome = EVENTOS_DO_COPILOT[eventoDaRota];
    if (!nome || (eventoDaRota === "errorOccurred" && corpo.recoverable === true)) return null;
    const erro = objeto(corpo.error);
    return {
      hook_event_name: nome,
      session_id: texto(corpo.sessionId),
      cwd: texto(corpo.cwd),
      prompt: texto(corpo.prompt) || texto(corpo.initialPrompt),
      tool_name: texto(corpo.toolName),
      tool_input: argumentos(corpo.toolArgs ?? corpo.toolInput),
      error_message: texto(erro.message),
      notification_type: tipoDeAviso(texto(corpo.notification_type)),
      message: texto(corpo.message),
    };
  }
  if (ferramenta === "codex" || ferramenta === "kimi") {
    const nome = texto(corpo.hook_event_name) || eventoDaRota;
    if (nome === "Interrupt") return { ...corpo, hook_event_name: "Stop" };
    if (ferramenta === "kimi" && nome === "PermissionRequest") return { ...corpo, hook_event_name: "Notification", notification_type: "agent_needs_input", message: "" };
    if (nome === "Notification") return { ...corpo, hook_event_name: nome, notification_type: tipoDeAviso(texto(corpo.notification_type)) };
    if (nome === "TurnStarted") return null;
    return { ...corpo, hook_event_name: nome };
  }
  if (ferramenta === "antigravity") {
    const pastas = Array.isArray(corpo.workspacePaths) ? corpo.workspacePaths : [];
    const base = { session_id: texto(corpo.conversationId), cwd: texto(pastas[0]), model: texto(corpo.modelName) };
    if (eventoDaRota === "PreInvocation") return { ...base, hook_event_name: "NikoPensando" };
    if (eventoDaRota === "Stop") return { ...base, hook_event_name: "Stop" };
    if (eventoDaRota === "PreToolUse") {
      const chamada = objeto(corpo.toolCall);
      return { ...base, hook_event_name: "PreToolUse", tool_name: texto(chamada.name) || texto(chamada.toolName) || texto(chamada.tool), tool_input: argumentos(chamada.args ?? chamada.arguments ?? chamada.input) };
    }
    return null;
  }
  if (ferramenta === "opencode") return texto(corpo.hook_event_name) ? corpo : null;
  return null;
}

function responderJsonVazio(res: ServerResponse) {
  if (res.writableEnded) return;
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end("{}");
}

function responderNada(res: ServerResponse) {
  if (res.writableEnded) return;
  res.statusCode = 200;
  res.setHeader("cache-control", "no-store");
  res.end();
}

export function ehRotaDeAgente(caminho: string) {
  return caminho.startsWith(PREFIXO_DA_ROTA);
}

export async function receberEventoDeAgente(req: IncomingMessage, res: ServerResponse, url: URL) {
  const ferramenta = url.pathname.slice(PREFIXO_DA_ROTA.length) as FerramentaDeCodigo;
  if (req.headers.origin || !segredoConfere(req.headers[CABECALHO_SEGREDO]) || ferramenta === "claude" || !FERRAMENTAS_DE_CODIGO.includes(ferramenta)) {
    res.statusCode = 403;
    return res.end();
  }
  const vazio = FERRAMENTAS_COM_RESPOSTA_JSON.has(ferramenta) ? responderJsonVazio : responderNada;
  let corpo: Corpo;
  try {
    corpo = await lerCorpoJson(req);
  } catch {
    return vazio(res);
  }
  const normalizado = normalizarEvento(ferramenta, url.searchParams.get("evento") ?? "", corpo);
  if (!normalizado) return vazio(res);
  processarEvento(normalizado, ferramenta, res, vazio);
}

interface Instalador {
  arquivo: () => string;
  detectado: () => boolean;
  propor: (atual: string | null, chave: string) => string | null;
  retirar: (atual: string) => string | null;
}

function gancho(ferramenta: FerramentaDeCodigo, evento: string, chave: string, decide = false) {
  return { type: "command", command: comandoDoGancho(ferramenta, evento, chave, decide), timeout: decide ? TEMPO_DO_GANCHO_DECISAO_S : evento === "SessionEnd" || evento === "Interrupt" ? TEMPO_DO_GANCHO_FINAL_S : TEMPO_DO_GANCHO_RAPIDO_S };
}

function ehDoNiko(valor: unknown, ferramenta: FerramentaDeCodigo) {
  return JSON.stringify(valor ?? null).includes(`${PREFIXO_DA_ROTA}${ferramenta}`);
}

function lerJson(textoAtual: string | null): Corpo {
  if (!textoAtual || !textoAtual.trim()) return {};
  let dados: unknown;
  try {
    dados = JSON.parse(textoAtual.replace(/^﻿/, ""));
  } catch {
    throw new Error("configuracao_invalida");
  }
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) throw new Error("configuracao_invalida");
  const hooks = (dados as Corpo).hooks;
  if (hooks !== undefined && (!hooks || typeof hooks !== "object" || Array.isArray(hooks))) throw new Error("configuracao_invalida");
  return dados as Corpo;
}

function semGruposDoNiko(hooks: Corpo, ferramenta: FerramentaDeCodigo): Corpo {
  const limpo: Corpo = {};
  for (const [evento, grupos] of Object.entries(hooks)) {
    const restantes = Array.isArray(grupos) ? grupos.filter((g) => !ehDoNiko(g, ferramenta)) : grupos;
    if (!Array.isArray(restantes) || restantes.length) limpo[evento] = restantes;
  }
  return limpo;
}

const INSTALADORES: Record<Exclude<FerramentaDeCodigo, "claude">, Instalador> = {
  copilot: {
    arquivo: () => casa(".copilot", "hooks", "niko.json"),
    detectado: () => existsSync(casa(".copilot")),
    propor: (_atual, chave) => {
      const hooks = Object.fromEntries(
        Object.keys(EVENTOS_DO_COPILOT).map((evento) => {
          const decide = evento === "permissionRequest";
          const comando = comandoDoGancho("copilot", evento, chave, decide);
          return [evento, [{ type: "command", bash: `${comando} || true`, powershell: `${comando}; exit 0`, timeoutSec: decide ? TEMPO_DO_GANCHO_DECISAO_S : TEMPO_DO_GANCHO_RAPIDO_S }]];
        }),
      );
      return `${JSON.stringify({ version: 1, hooks }, null, 2)}\n`;
    },
    retirar: () => null,
  },
  codex: {
    arquivo: () => casa(".codex", "hooks.json"),
    detectado: () => existsSync(casa(".codex")),
    propor: (atual, chave) => {
      const dados = lerJson(atual);
      const hooks = semGruposDoNiko(objeto(dados.hooks), "codex");
      for (const evento of EVENTOS_DO_CODEX) {
        const grupos = Array.isArray(hooks[evento]) ? (hooks[evento] as unknown[]) : [];
        hooks[evento] = [...grupos, { hooks: [gancho("codex", evento, chave, evento === "PermissionRequest")] }];
      }
      return `${JSON.stringify({ ...dados, hooks }, null, 2)}\n`;
    },
    retirar: (atual) => {
      const dados = lerJson(atual);
      const hooks = semGruposDoNiko(objeto(dados.hooks), "codex");
      const resto = { ...dados, hooks };
      if (Object.keys(hooks).length === 0) delete (resto as Corpo).hooks;
      return `${JSON.stringify(resto, null, 2)}\n`;
    },
  },
  antigravity: {
    arquivo: () => casa(".gemini", "config", "hooks.json"),
    detectado: () => existsSync(casa(".gemini", "antigravity")) || existsSync(casa(".gemini", "config")),
    propor: (atual, chave) => {
      const dados = lerJson(atual);
      const niko: Corpo = { enabled: true };
      for (const evento of EVENTOS_DO_ANTIGRAVITY) {
        niko[evento] = [{ ...(evento === "PreToolUse" ? { matcher: "*" } : {}), hooks: [gancho("antigravity", evento, chave)] }];
      }
      return `${JSON.stringify({ ...dados, niko }, null, 2)}\n`;
    },
    retirar: (atual) => {
      const dados = lerJson(atual);
      delete dados.niko;
      return `${JSON.stringify(dados, null, 2)}\n`;
    },
  },
  kimi: {
    arquivo: () => casa(".kimi-code", "config.toml"),
    detectado: () => existsSync(casa(".kimi-code")),
    propor: (atual, chave) => {
      const base = semBlocoToml(atual ?? "").replace(/\s*$/, "");
      if (/^\s*hooks\s*=/m.test(base)) throw new Error("hooks_em_linha");
      const entradas = EVENTOS_DO_KIMI.map((evento) => {
        const g = gancho("kimi", evento, chave);
        return `[[hooks]]\nevent = "${evento}"\ncommand = '${g.command}'\ntimeout = ${g.timeout}`;
      });
      return `${base ? `${base}\n\n` : ""}${INICIO_DO_BLOCO_TOML}\n${entradas.join("\n\n")}\n${FIM_DO_BLOCO_TOML}\n`;
    },
    retirar: (atual) => `${semBlocoToml(atual).replace(/\s*$/, "")}\n`,
  },
  opencode: {
    arquivo: () => casa(".config", "opencode", "plugins", "niko.js"),
    detectado: () => existsSync(casa(".config", "opencode")),
    propor: (_atual, chave) => pluginDoOpencode(chave),
    retirar: () => null,
  },
};

export function proporConfiguracao(id: Exclude<FerramentaDeCodigo, "claude">, atual: string | null, chave: string) {
  return INSTALADORES[id].propor(atual, chave);
}

export function retirarConfiguracao(id: Exclude<FerramentaDeCodigo, "claude">, atual: string) {
  return INSTALADORES[id].retirar(atual);
}

function semBlocoToml(textoAtual: string) {
  const inicio = textoAtual.indexOf(INICIO_DO_BLOCO_TOML);
  if (inicio < 0) return textoAtual;
  const fim = textoAtual.indexOf(FIM_DO_BLOCO_TOML, inicio);
  return textoAtual.slice(0, inicio) + (fim < 0 ? "" : textoAtual.slice(fim + FIM_DO_BLOCO_TOML.length));
}

export function pluginDoOpencode(chave: string) {
  const url = `http://127.0.0.1:${porta()}${PREFIXO_DA_ROTA}opencode`;
  return `// Gerado pelo Niko: manda os eventos do OpenCode para a ilha. Remova pelo Niko.
const URL_DO_NIKO = ${JSON.stringify(url)};
const CHAVE = ${JSON.stringify(chave)};

function enviar(corpo) {
  fetch(URL_DO_NIKO, {
    method: "POST",
    headers: { "content-type": "application/json", ${JSON.stringify(CABECALHO_SEGREDO)}: CHAVE },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

export const NikoPlugin = async ({ directory }) => ({
  event: async ({ event }) => {
    const p = event.properties ?? {};
    const sessao = p.sessionID ?? p.info?.id ?? "";
    const base = { session_id: sessao, cwd: directory };
    if (event.type === "session.created") enviar({ ...base, hook_event_name: "SessionStart" });
    else if (event.type === "session.idle") enviar({ ...base, hook_event_name: "Stop" });
    else if (event.type === "session.error") enviar({ ...base, hook_event_name: "StopFailure", error_message: String(p.error?.data?.message ?? p.error?.name ?? "") });
    else if (event.type === "session.deleted") enviar({ ...base, hook_event_name: "SessionEnd" });
    else if (event.type === "permission.asked" || event.type === "permission.updated") enviar({ ...base, hook_event_name: "Notification", notification_type: "agent_needs_input", message: "" });
    else if (event.type === "permission.replied") enviar({ ...base, hook_event_name: "NikoPensando" });
  },
  "chat.message": async (input, output) => {
    const partes = Array.isArray(output?.parts) ? output.parts : [];
    enviar({ session_id: input.sessionID, cwd: directory, hook_event_name: "UserPromptSubmit", prompt: partes.filter((x) => x.type === "text").map((x) => x.text).join("\\n").slice(0, 2000) });
  },
  "tool.execute.before": async (input, output) => {
    enviar({ session_id: input.sessionID, cwd: directory, hook_event_name: "PreToolUse", tool_name: input.tool, tool_input: output?.args ?? {} });
  },
});
`;
}

function lerTexto(caminho: string): string | null {
  return existsSync(caminho) ? readFileSync(caminho, "utf8") : null;
}

function gravarComCopia(caminho: string, conteudo: string | null) {
  mkdirSync(dirname(caminho), { recursive: true });
  let copia: string | null = null;
  if (existsSync(caminho)) {
    copia = `${caminho}.niko-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    copyFileSync(caminho, copia);
  }
  if (conteudo === null) {
    rmSync(caminho, { force: true });
    return { caminho, copia };
  }
  const temporario = `${caminho}.niko-gravando`;
  writeFileSync(temporario, conteudo, "utf8");
  renameSync(temporario, caminho);
  return { caminho, copia };
}

export interface EstadoDaFerramenta {
  id: FerramentaDeCodigo;
  caminho: string;
  detectado: boolean;
  instalado: boolean;
  desatualizado: boolean;
  invalido: boolean;
}

function estadoDe(id: FerramentaDeCodigo): EstadoDaFerramenta {
  if (id === "claude") {
    const e = estadoDaInstalacao();
    return { id, caminho: e.caminho, detectado: e.claudeInstalado, instalado: e.instalado, desatualizado: e.desatualizado || e.parcial, invalido: e.invalido };
  }
  const instalador = INSTALADORES[id];
  const caminho = instalador.arquivo();
  const conteudo = lerTexto(caminho) ?? "";
  const temNiko = conteudo.includes(`${PREFIXO_DA_ROTA}${id}`);
  const atual = temNiko && conteudo.includes(segredo()) && conteudo.includes(`127.0.0.1:${porta()}`);
  let invalido = false;
  if (conteudo && caminho.endsWith(".json")) {
    try {
      lerJson(conteudo);
    } catch {
      invalido = true;
    }
  }
  return { id, caminho, detectado: instalador.detectado(), instalado: atual, desatualizado: temNiko && !atual, invalido };
}

export function estadoDosAgentes() {
  return { ferramentas: FERRAMENTAS_DE_CODIGO.map(estadoDe) };
}

export function instalarAgente(id: string, corpo: Corpo) {
  if (!FERRAMENTAS_DE_CODIGO.includes(id as FerramentaDeCodigo)) throw new Error("ferramenta_desconhecida");
  if (id === "claude") return instalarGanchos(corpo);
  if (corpo.confirmacao !== "INSTALAR") throw new Error("confirmacao_invalida");
  const instalador = INSTALADORES[id as Exclude<FerramentaDeCodigo, "claude">];
  const caminho = instalador.arquivo();
  return gravarComCopia(caminho, instalador.propor(lerTexto(caminho), segredo()));
}

export function removerAgente(id: string, corpo: Corpo) {
  if (!FERRAMENTAS_DE_CODIGO.includes(id as FerramentaDeCodigo)) throw new Error("ferramenta_desconhecida");
  if (id === "claude") return removerGanchos(corpo);
  if (corpo.confirmacao !== "REMOVER") throw new Error("confirmacao_invalida");
  const instalador = INSTALADORES[id as Exclude<FerramentaDeCodigo, "claude">];
  const caminho = instalador.arquivo();
  const atual = lerTexto(caminho);
  if (atual === null) return { caminho, copia: null };
  return gravarComCopia(caminho, instalador.retirar(atual));
}
