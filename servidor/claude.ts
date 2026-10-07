import type { IncomingMessage, ServerResponse } from "node:http";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { pastaDados } from "./ia";

export const CABECALHO_SEGREDO = "x-niko-gancho";
const CAMINHO_EVENTO = "/ponte/claude/evento";
const LIMITE_CORPO = 2 * 1024 * 1024;
const LIMITE_CAMPO = 4000;
const LIMITE_RESPOSTA_FINAL = 12000;
const ESPERA_DECISAO_MS = 110_000;
const TEMPO_HOOK_RAPIDO = 5;
const TEMPO_HOOK_DECISAO = 120;
const MAXIMO_HISTORICO = 300;
const PROFUNDIDADE_MAXIMA = 6;

export const EVENTOS_INSTALADOS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Notification",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "SessionEnd",
] as const;

const CAMPOS_DESCARTADOS = ["tool_response", "tool_result", "transcript_path", "scratchpad_dir"];
const FERRAMENTAS_QUE_DECIDEM = new Set<FerramentaDeCodigo>(["claude", "codex", "copilot"]);
const MENSAGEM_DE_NEGACAO = "Negado pelo usuário no Niko.";

export type FerramentaDeCodigo = "claude" | "copilot" | "codex" | "opencode" | "antigravity" | "kimi";

export interface EventoClaude {
  id: string;
  recebidoEm: string;
  ferramenta: FerramentaDeCodigo;
  evento: string;
  sessao: string;
  cwd: string;
  dados: Record<string, unknown>;
  pedidoId?: string;
}

interface RegraSugerida {
  toolName: string;
  ruleContent: string;
}

interface Pendente {
  res: ServerResponse;
  ferramenta: FerramentaDeCodigo;
  temporizador: NodeJS.Timeout;
  sessao: string;
  sugestoes: RegraSugerida[];
}

const projetosConhecidos = new Set<string>();

function regrasSugeridas(dados: Record<string, unknown>): RegraSugerida[] {
  const lista = Array.isArray(dados.permission_suggestions) ? dados.permission_suggestions : [];
  const regras: RegraSugerida[] = [];
  for (const s of lista) {
    if (!s || typeof s !== "object") continue;
    const sugestao = s as { type?: unknown; behavior?: unknown; rules?: unknown };
    if (sugestao.type !== "allow" || sugestao.behavior !== "allow" || !Array.isArray(sugestao.rules)) continue;
    for (const r of sugestao.rules) {
      const m = typeof r === "string" ? /^([A-Za-z0-9_.:-]{1,64})\((.{1,300})\)$/.exec(r.trim()) : null;
      if (m && !regras.some((x) => x.toolName === m[1] && x.ruleContent === m[2])) regras.push({ toolName: m[1], ruleContent: m[2] });
    }
  }
  return regras.slice(0, 4);
}

const historico: EventoClaude[] = [];
const ouvintes = new Set<ServerResponse>();
const pendentes = new Map<string, Pendente>();

function pastaClaude() {
  return join(homedir(), ".claude");
}

function caminhoSettings() {
  return join(pastaClaude(), "settings.json");
}

export function porta() {
  return Number(process.env.NIKO_PORTA) || 47831;
}

function urlDoGancho() {
  return `http://127.0.0.1:${porta()}${CAMINHO_EVENTO}`;
}

let segredoEmMemoria: string | null = null;

export function segredo(): string {
  if (segredoEmMemoria) return segredoEmMemoria;
  const arquivo = join(pastaDados(), "gancho-claude.json");
  try {
    const lido = JSON.parse(readFileSync(arquivo, "utf8")) as { segredo?: string };
    if (typeof lido.segredo === "string" && lido.segredo.length >= 32) return (segredoEmMemoria = lido.segredo);
  } catch {
    mkdirSync(pastaDados(), { recursive: true });
  }
  const novo = randomBytes(32).toString("hex");
  writeFileSync(arquivo, JSON.stringify({ segredo: novo }), "utf8");
  return (segredoEmMemoria = novo);
}

export function segredoConfere(recebido: unknown): boolean {
  if (typeof recebido !== "string") return false;
  const esperado = Buffer.from(segredo());
  const dado = Buffer.from(recebido);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

function ehGanchoDoNiko(gancho: unknown): boolean {
  if (!gancho || typeof gancho !== "object") return false;
  const g = gancho as { type?: unknown; url?: unknown; headers?: Record<string, unknown> };
  return g.type === "http" && typeof g.url === "string" && g.url.includes(CAMINHO_EVENTO) && Boolean(g.headers && CABECALHO_SEGREDO in g.headers);
}

type Settings = Record<string, unknown> & { hooks?: Record<string, unknown> };

function lerSettings(): { texto: string | null; dados: Settings } {
  const caminho = caminhoSettings();
  if (!existsSync(caminho)) return { texto: null, dados: {} };
  const texto = readFileSync(caminho, "utf8");
  if (!texto.trim()) return { texto, dados: {} };
  try {
    const dados = JSON.parse(texto.replace(/^﻿/, "")) as unknown;
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) throw new Error();
    const hooks = (dados as Settings).hooks;
    if (hooks !== undefined && (!hooks || typeof hooks !== "object" || Array.isArray(hooks))) throw new Error();
    return { texto, dados: dados as Settings };
  } catch {
    throw new Error("settings_invalido");
  }
}

function semGanchosDoNiko(dados: Settings): Settings {
  const copia: Settings = JSON.parse(JSON.stringify(dados)) as Settings;
  const hooks = copia.hooks && typeof copia.hooks === "object" && !Array.isArray(copia.hooks) ? (copia.hooks as Record<string, unknown>) : null;
  if (!hooks) return copia;
  for (const [evento, grupos] of Object.entries(hooks)) {
    if (!Array.isArray(grupos)) continue;
    const restantes = grupos
      .map((grupo) => {
        if (!grupo || typeof grupo !== "object") return grupo;
        const g = grupo as { hooks?: unknown[] };
        if (!Array.isArray(g.hooks)) return grupo;
        const filtrados = g.hooks.filter((h) => !ehGanchoDoNiko(h));
        return filtrados.length === g.hooks.length ? grupo : filtrados.length ? { ...g, hooks: filtrados } : null;
      })
      .filter((g) => g !== null);
    if (restantes.length) hooks[evento] = restantes;
    else delete hooks[evento];
  }
  if (Object.keys(hooks).length === 0) delete copia.hooks;
  return copia;
}

function comGanchosDoNiko(dados: Settings): Settings {
  const limpo = semGanchosDoNiko(dados);
  const hooks = (limpo.hooks && typeof limpo.hooks === "object" && !Array.isArray(limpo.hooks) ? limpo.hooks : {}) as Record<string, unknown[]>;
  const chave = segredo();
  for (const evento of EVENTOS_INSTALADOS) {
    const atuais = Array.isArray(hooks[evento]) ? hooks[evento] : [];
    hooks[evento] = [
      ...atuais,
      {
        hooks: [
          {
            type: "http",
            url: urlDoGancho(),
            timeout: evento === "PermissionRequest" ? TEMPO_HOOK_DECISAO : TEMPO_HOOK_RAPIDO,
            headers: { [CABECALHO_SEGREDO]: chave },
          },
        ],
      },
    ];
  }
  return { ...limpo, hooks };
}

function ocultarSegredo(texto: string) {
  return texto.split(segredo()).join("••••••••");
}

export function estadoDaInstalacao() {
  const caminho = caminhoSettings();
  let dados: Settings = {};
  let invalido = false;
  try {
    dados = lerSettings().dados;
  } catch {
    invalido = true;
  }
  const hooks = (dados.hooks ?? {}) as Record<string, unknown>;
  const ganchosDoNiko = Object.values(hooks)
    .flatMap((grupos) => (Array.isArray(grupos) ? grupos : []))
    .flatMap((g) => (Array.isArray((g as { hooks?: unknown[] })?.hooks) ? (g as { hooks: unknown[] }).hooks : []))
    .filter(ehGanchoDoNiko);
  const atual = (h: unknown) => {
    const g = h as { url: string; headers: Record<string, unknown> };
    return g.url === urlDoGancho() && g.headers[CABECALHO_SEGREDO] === segredo();
  };
  const instalados = EVENTOS_INSTALADOS.filter((evento) => {
    const grupos = hooks[evento];
    return Array.isArray(grupos) && grupos.some((g) => Array.isArray((g as { hooks?: unknown[] })?.hooks) && (g as { hooks: unknown[] }).hooks.some((h) => ehGanchoDoNiko(h) && atual(h)));
  });
  return {
    caminho,
    existe: existsSync(caminho),
    claudeInstalado: existsSync(pastaClaude()),
    invalido,
    instalado: instalados.length === EVENTOS_INSTALADOS.length,
    parcial: instalados.length > 0 && instalados.length < EVENTOS_INSTALADOS.length,
    eventos: instalados,
    desatualizado: ganchosDoNiko.some((h) => !atual(h)),
    conectado: ouvintes.size > 0,
  };
}

export function previaDaInstalacao(acao: "instalar" | "remover") {
  const { texto, dados } = lerSettings();
  const proposto = acao === "instalar" ? comGanchosDoNiko(dados) : semGanchosDoNiko(dados);
  return { caminho: caminhoSettings(), atual: texto === null ? null : ocultarSegredo(texto), proposto: ocultarSegredo(`${JSON.stringify(proposto, null, 2)}\n`) };
}

function gravarComCopia(conteudo: Settings) {
  const caminho = caminhoSettings();
  mkdirSync(pastaClaude(), { recursive: true });
  let copia: string | null = null;
  if (existsSync(caminho)) {
    copia = `${caminho}.niko-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    copyFileSync(caminho, copia);
  }
  const temporario = `${caminho}.niko-gravando`;
  writeFileSync(temporario, `${JSON.stringify(conteudo, null, 2)}\n`, "utf8");
  renameSync(temporario, caminho);
  return { caminho, copia };
}

export function instalarGanchos(corpo: Record<string, unknown>) {
  if (corpo.confirmacao !== "INSTALAR") throw new Error("confirmacao_invalida");
  return gravarComCopia(comGanchosDoNiko(lerSettings().dados));
}

export function removerGanchos(corpo: Record<string, unknown>) {
  if (corpo.confirmacao !== "REMOVER") throw new Error("confirmacao_invalida");
  return gravarComCopia(semGanchosDoNiko(lerSettings().dados));
}

function cortar(valor: unknown, limite = LIMITE_CAMPO, profundidade = 0): unknown {
  if (typeof valor === "string") return valor.length > limite ? `${valor.slice(0, limite)}…` : valor;
  if ((Array.isArray(valor) || (valor && typeof valor === "object")) && profundidade >= PROFUNDIDADE_MAXIMA) return null;
  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => cortar(v, limite, profundidade + 1));
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor as Record<string, unknown>).slice(0, 40).map(([k, v]) => [k, cortar(v, limite, profundidade + 1)]));
  return valor;
}

export function lerCorpoJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolver, rejeitar) => {
    let tamanho = 0;
    const partes: Buffer[] = [];
    req.on("data", (p: Buffer) => {
      tamanho += p.length;
      if (tamanho > LIMITE_CORPO) {
        req.destroy();
        rejeitar(new Error("corpo_grande"));
        return;
      }
      partes.push(p);
    });
    req.on("end", () => {
      try {
        const dados = JSON.parse(Buffer.concat(partes).toString("utf8").replace(/^﻿/, "")) as unknown;
        resolver(dados && typeof dados === "object" && !Array.isArray(dados) ? (dados as Record<string, unknown>) : {});
      } catch {
        rejeitar(new Error("json_invalido"));
      }
    });
    req.on("error", rejeitar);
  });
}

const EVENTOS_COM_MODELO = new Set(["SessionStart", "UserPromptSubmit", "Stop", "SubagentStop"]);
const BYTES_DO_FIM_DO_TRANSCRIPT = 256 * 1024;

/** Lê só o fim do transcript da sessão e devolve o modelo da última resposta do assistente. */
export function modeloDoTranscript(caminho: string): string | undefined {
  if (!isAbsolute(caminho) || !caminho.endsWith(".jsonl") || caminho.length > 1000) return undefined;
  let descritor: number | undefined;
  try {
    const tamanho = statSync(caminho).size;
    const inicio = Math.max(0, tamanho - BYTES_DO_FIM_DO_TRANSCRIPT);
    const buffer = Buffer.alloc(tamanho - inicio);
    descritor = openSync(caminho, "r");
    readSync(descritor, buffer, 0, buffer.length, inicio);
    const linhas = buffer.toString("utf8").split("\n");
    for (let i = linhas.length - 1; i >= 0; i--) {
      if (!linhas[i].includes('"model"')) continue;
      try {
        const linha = JSON.parse(linhas[i]) as { type?: string; message?: { model?: unknown } };
        const modelo = linha.type === "assistant" ? linha.message?.model : undefined;
        if (typeof modelo === "string" && modelo && !modelo.startsWith("<")) return modelo.slice(0, 80);
      } catch {
        // linha cortada no começo do trecho lido
      }
    }
  } catch {
    return undefined;
  } finally {
    if (descritor !== undefined) closeSync(descritor);
  }
  return undefined;
}

function transmitir(evento: EventoClaude) {
  historico.push(evento);
  if (historico.length > MAXIMO_HISTORICO) historico.splice(0, historico.length - MAXIMO_HISTORICO);
  const linha = `${JSON.stringify(evento)}\n`;
  for (const ouvinte of ouvintes) ouvinte.write(linha);
}

export function responderVazio(res: ServerResponse) {
  if (res.writableEnded) return;
  res.statusCode = 200;
  res.setHeader("cache-control", "no-store");
  res.end();
}

export async function receberEventoDoGancho(req: IncomingMessage, res: ServerResponse) {
  if (req.headers.origin || !segredoConfere(req.headers[CABECALHO_SEGREDO])) {
    res.statusCode = 403;
    return res.end();
  }
  let corpo: Record<string, unknown>;
  try {
    corpo = await lerCorpoJson(req);
  } catch {
    return responderVazio(res);
  }
  processarEvento(corpo, "claude", res);
}

export function processarEvento(corpo: Record<string, unknown>, ferramenta: FerramentaDeCodigo, res: ServerResponse, aoResponderVazio: (res: ServerResponse) => void = responderVazio) {
  const nome = typeof corpo.hook_event_name === "string" ? corpo.hook_event_name : "";
  const modeloAtual = EVENTOS_COM_MODELO.has(nome) && typeof corpo.transcript_path === "string" ? modeloDoTranscript(corpo.transcript_path) : undefined;
  for (const campo of CAMPOS_DESCARTADOS) delete corpo[campo];
  if (modeloAtual) corpo.model = modeloAtual;
  const ultima = typeof corpo.last_assistant_message === "string" ? corpo.last_assistant_message.slice(0, LIMITE_RESPOSTA_FINAL) : undefined;
  const dados = cortar(corpo) as Record<string, unknown>;
  if (ultima !== undefined) dados.last_assistant_message = ultima;
  const evento: EventoClaude = {
    id: randomUUID(),
    recebidoEm: new Date().toISOString(),
    ferramenta,
    evento: nome,
    sessao: typeof corpo.session_id === "string" ? corpo.session_id : "",
    cwd: typeof corpo.cwd === "string" ? corpo.cwd : "",
    dados,
  };
  if (evento.cwd && evento.cwd.length < 500) {
    projetosConhecidos.add(evento.cwd);
    if (projetosConhecidos.size > 50) projetosConhecidos.delete(projetosConhecidos.values().next().value as string);
  }
  if (nome !== "PermissionRequest" || ouvintes.size === 0 || !FERRAMENTAS_QUE_DECIDEM.has(ferramenta)) {
    aoResponderVazio(res);
    transmitir(evento);
    return;
  }
  const pedidoId = randomUUID();
  evento.pedidoId = pedidoId;
  const temporizador = setTimeout(() => encerrarPedido(pedidoId, null, "expirou"), ESPERA_DECISAO_MS);
  pendentes.set(pedidoId, { res, ferramenta, temporizador, sessao: evento.sessao, sugestoes: ferramenta === "claude" ? regrasSugeridas(corpo) : [] });
  res.on("close", () => {
    if (pendentes.has(pedidoId)) encerrarPedido(pedidoId, null, "cancelado");
  });
  transmitir(evento);
}

function encerrarPedido(pedidoId: string, decisao: "allow" | "deny" | null, motivo: string, regra?: RegraSugerida) {
  const pendente = pendentes.get(pedidoId);
  if (!pendente) return false;
  pendentes.delete(pedidoId);
  clearTimeout(pendente.temporizador);
  if (!pendente.res.writableEnded) {
    if (decisao && pendente.ferramenta === "copilot") {
      pendente.res.statusCode = 200;
      pendente.res.setHeader("content-type", "application/json; charset=utf-8");
      pendente.res.end(JSON.stringify(decisao === "allow" ? { behavior: "allow" } : { behavior: "deny", message: MENSAGEM_DE_NEGACAO }));
    } else if (decisao) {
      const corpo = {
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision:
            decisao === "deny"
              ? { behavior: "deny", message: MENSAGEM_DE_NEGACAO }
              : regra
                ? { behavior: "allow", updatedPermissions: [{ type: "allow", toolName: regra.toolName, ruleContent: regra.ruleContent, behavior: "allow", mode: "local", directories: [] }] }
                : { behavior: "allow" },
        },
      };
      pendente.res.statusCode = 200;
      pendente.res.setHeader("content-type", "application/json; charset=utf-8");
      pendente.res.end(JSON.stringify(corpo));
    } else responderVazio(pendente.res);
  }
  transmitir({ id: randomUUID(), recebidoEm: new Date().toISOString(), ferramenta: pendente.ferramenta, evento: "NikoPedidoEncerrado", sessao: pendente.sessao, cwd: "", dados: { motivo, decisao }, pedidoId });
  return true;
}

export function decidirPedido(corpo: Record<string, unknown>) {
  const pedidoId = typeof corpo.pedidoId === "string" ? corpo.pedidoId : "";
  const decisao = corpo.decisao === "allow" || corpo.decisao === "deny" ? corpo.decisao : corpo.decisao === "terminal" ? null : undefined;
  if (decisao === undefined) throw new Error("decisao_invalida");
  let regra: RegraSugerida | undefined;
  if (corpo.regra && typeof corpo.regra === "object") {
    if (decisao !== "allow") throw new Error("decisao_invalida");
    const pedida = corpo.regra as Partial<RegraSugerida>;
    regra = pendentes.get(pedidoId)?.sugestoes.find((s) => s.toolName === pedida.toolName && s.ruleContent === pedida.ruleContent);
    if (!regra) throw new Error("regra_invalida");
  }
  if (!encerrarPedido(pedidoId, decisao, decisao ? "decidido" : "terminal", regra)) throw new Error("pedido_expirou");
  return { ok: true };
}

function caminhoDoVsCode(): string | null {
  if (process.platform !== "win32") {
    const extras = ["/usr/bin/code", "/usr/local/bin/code", "/var/lib/flatpak/exports/bin/com.visualstudio.code"];
    const doPath = (process.env.PATH ?? "").split(delimiter).filter(Boolean).map((p) => join(p, "code"));
    return [...doPath, ...extras].find((c) => existsSync(c)) ?? null;
  }
  const candidatos = [
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"),
    join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft VS Code", "Code.exe"),
    join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft VS Code", "Code.exe"),
  ];
  for (const pasta of (process.env.PATH ?? "").split(";")) {
    if (/microsoft vs code[\\/]bin$/i.test(pasta.trim())) candidatos.push(join(pasta.trim(), "..", "Code.exe"));
  }
  return candidatos.find((c) => c && existsSync(c)) ?? null;
}

function abrirDesacoplado(programa: string, argumentos: string[]) {
  const ambiente = { ...process.env };
  delete ambiente.ELECTRON_RUN_AS_NODE;
  const filho = spawn(programa, argumentos, { detached: true, stdio: "ignore", windowsHide: false, env: ambiente });
  filho.on("error", () => undefined);
  filho.unref();
}

export function abrirProjeto(corpo: Record<string, unknown>) {
  const cwd = typeof corpo.cwd === "string" ? corpo.cwd : "";
  if (!projetosConhecidos.has(cwd) || !isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error("projeto_desconhecido");
  if (corpo.como === "vscode") {
    const code = caminhoDoVsCode();
    if (!code) throw new Error("vscode_nao_encontrado");
    abrirDesacoplado(code, [cwd]);
  } else if (corpo.como === "pasta") {
    abrirDesacoplado(process.platform === "win32" ? "explorer.exe" : "xdg-open", [cwd]);
  } else throw new Error("acao_invalida");
  return { ok: true };
}

export function ouvirEventos(req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-accel-buffering", "no");
  const limite = Date.now() - 6 * 3600_000;
  for (const evento of historico) if (Date.parse(evento.recebidoEm) >= limite) res.write(`${JSON.stringify(evento)}\n`);

  res.write(`${JSON.stringify({ evento: "NikoConectado", id: randomUUID(), recebidoEm: new Date().toISOString(), ferramenta: "claude", sessao: "", cwd: "", dados: {} })}\n`);
  ouvintes.add(res);
  const pulso = setInterval(() => res.write("\n"), 20_000);
  req.on("close", () => {
    clearInterval(pulso);
    ouvintes.delete(res);
  });
}

export function ehRotaDoGancho(caminho: string) {
  return caminho === CAMINHO_EVENTO;
}