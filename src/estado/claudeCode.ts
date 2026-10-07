import { create } from "zustand";
import type { EventoClaude, FerramentaDeCodigo, RegraSugerida } from "../ponte/claudeCode";
import { alteracaoDaFerramenta, type AlteracaoDeArquivo } from "../utilitarios/diff";
import { T } from "../textos/textos";

export type EstadoSessao = keyof typeof T.ilha.claude.estados;

export interface PassoClaude {
  id: string;
  tipo: "pedido" | "ferramenta" | "falha" | "subagente" | "aviso" | "fim" | "erro";
  ferramenta?: string;
  rotulo: string;
  detalhe?: string;
  hora: string;
  alteracao?: AlteracaoDeArquivo;
}

export interface SessaoClaude {
  id: string;
  ferramenta: FerramentaDeCodigo;
  projeto: string;
  cwd: string;
  estado: EstadoSessao;
  passos: PassoClaude[];
  pedido?: string;
  resposta?: string;
  erro?: string;
  modo?: string;
  modelo?: string;
  ferramentasUsadas: number;
  iniciadaEm: string;
  atualizadaEm: string;
}

export interface PedidoDePermissao {
  pedidoId: string;
  ferramentaDeCodigo: FerramentaDeCodigo;
  sessao: string;
  projeto: string;
  ferramenta: string;
  alvo: string;
  entrada: string;
  recebidoEm: string;
  alteracao?: AlteracaoDeArquivo;
  sugestoes: RegraSugerida[];
}

const MAXIMO_PASSOS = 80;

export type MotivoDeEncerramento = keyof typeof T.ilha.claude.pedidoEncerrado;
const MAXIMO_SESSOES = 8;
const CAMPOS_ALVO = ["command", "file_path", "path", "url", "query", "pattern", "prompt", "description"] as const;

/** "claude-opus-4-7[1m]" vira "Opus 4.7"; "claude-3-5-sonnet-20241022" vira "Sonnet 3.5"; o resto fica como veio. */
export function nomeDoModelo(id: string): string {
  const limpo = id.trim().replace(/\[.*\]$/, "").replace(/-\d{8}$/, "");
  const novo = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?$/i.exec(limpo);
  const antigo = /^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)$/i.exec(limpo);
  const familia = novo?.[1] ?? antigo?.[3];
  const versao = novo ? [novo[2], novo[3]] : antigo ? [antigo[1], antigo[2]] : null;
  if (!familia || !versao) return limpo;
  return `${familia[0].toUpperCase()}${familia.slice(1).toLowerCase()} ${versao.filter(Boolean).join(".")}`;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

export function nomeDoProjeto(cwd: string, reserva = "Claude Code"): string {
  const limpo = cwd.replace(/[\\/]+$/, "");
  const i = Math.max(limpo.lastIndexOf("\\"), limpo.lastIndexOf("/"));
  return (i >= 0 ? limpo.slice(i + 1) : limpo) || reserva;
}

export function rotuloDaFerramenta(ferramenta: string): string {
  return T.ilha.claude.ferramentas[ferramenta] ?? ferramenta;
}

export function alvoDaFerramenta(entrada: Record<string, unknown>): string {
  for (const campo of CAMPOS_ALVO) {
    const v = entrada[campo];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function encurtarCaminho(valor: string): string {
  if (!/[\\/]/.test(valor) || /\s/.test(valor.trim())) return valor;
  const partes = valor.split(/[\\/]+/).filter(Boolean);
  return partes.length > 2 ? `…/${partes.slice(-2).join("/")}` : valor;
}

function sugestoesDoEvento(d: Record<string, unknown>): RegraSugerida[] {
  const lista = Array.isArray(d.permission_suggestions) ? d.permission_suggestions : [];
  const regras: RegraSugerida[] = [];
  for (const s of lista) {
    const sugestao = (s ?? {}) as { type?: unknown; behavior?: unknown; rules?: unknown };
    if (sugestao.type !== "allow" || sugestao.behavior !== "allow" || !Array.isArray(sugestao.rules)) continue;
    for (const r of sugestao.rules) {
      const m = typeof r === "string" ? /^([A-Za-z0-9_.:-]{1,64})\((.{1,300})\)$/.exec(r.trim()) : null;
      if (m && !regras.some((x) => x.toolName === m[1] && x.ruleContent === m[2])) regras.push({ toolName: m[1], ruleContent: m[2] });
    }
  }
  return regras.slice(0, 4);
}

function formatarEntrada(entrada: Record<string, unknown>): string {
  const comando = texto(entrada.command);
  if (comando) return comando;
  const caminho = texto(entrada.file_path) || texto(entrada.path);
  const conteudo = texto(entrada.new_string) || texto(entrada.content);
  if (caminho && conteudo) return `${caminho}\n\n${conteudo.slice(0, 1200)}`;
  return alvoDaFerramenta(entrada) || JSON.stringify(entrada, null, 2).slice(0, 1500);
}

interface EstadoClaude {
  sessoes: Record<string, SessaoClaude>;
  ordem: string[];
  pedidos: PedidoDePermissao[];
  conectado: boolean;
  focada: string | null;
  aplicar: (e: EventoClaude) => void;
  definirConectado: (ligado: boolean) => void;
  focar: (id: string) => void;
  fechar: (id: string) => void;
  removerPedido: (pedidoId: string) => void;
}

const MAXIMO_VISTOS = 2000;
const eventosAplicados = new Set<string>();

function jaFoiAplicado(id: string): boolean {
  if (eventosAplicados.has(id)) return true;
  eventosAplicados.add(id);
  if (eventosAplicados.size > MAXIMO_VISTOS) eventosAplicados.delete(eventosAplicados.values().next().value as string);
  return false;
}

const CHAVE_FECHADAS = "niko:claude-sessoes-fechadas";
const MAXIMO_FECHADAS = 60;

function lerFechadas(): Record<string, number> {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE_FECHADAS) ?? "{}") as unknown;
    return dados && typeof dados === "object" && !Array.isArray(dados) ? (dados as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function gravarFechadas(fechadas: Record<string, number>) {
  const recentes = Object.entries(fechadas).sort((a, b) => b[1] - a[1]).slice(0, MAXIMO_FECHADAS);
  try {
    localStorage.setItem(CHAVE_FECHADAS, JSON.stringify(Object.fromEntries(recentes)));
  } catch {
    return;
  }
}

function sessaoFoiFechadaAntes(e: EventoClaude): boolean {
  const fechadas = lerFechadas();
  const fechadaEm = fechadas[e.sessao];
  if (fechadaEm === undefined) return false;
  if (Date.parse(e.recebidoEm) <= fechadaEm) return true;
  delete fechadas[e.sessao];
  gravarFechadas(fechadas);
  return false;
}

function semASessao(s: { sessoes: Record<string, SessaoClaude>; ordem: string[]; focada: string | null; pedidos: PedidoDePermissao[] }, id: string) {
  const sessoes = { ...s.sessoes };
  delete sessoes[id];
  const ordem = s.ordem.filter((x) => x !== id);
  return { sessoes, ordem, focada: s.focada === id ? ordem[0] ?? null : s.focada, pedidos: s.pedidos.filter((p) => p.sessao !== id) };
}

function novoPasso(e: EventoClaude, tipo: PassoClaude["tipo"], rotulo: string, detalhe?: string, ferramenta?: string): PassoClaude {
  return { id: e.id, tipo, rotulo, detalhe, ferramenta, hora: e.recebidoEm };
}

export const useClaudeCode = create<EstadoClaude>((set, get) => ({
  sessoes: {},
  ordem: [],
  pedidos: [],
  conectado: false,
  focada: null,

  definirConectado: (conectado) => set({ conectado }),
  focar: (id) => set({ focada: id }),
  removerPedido: (pedidoId) => set((s) => ({ pedidos: s.pedidos.filter((p) => p.pedidoId !== pedidoId) })),
  fechar: (id) => {
    gravarFechadas({ ...lerFechadas(), [id]: Date.now() });
    set((s) => semASessao(s, id));
  },

  aplicar: (e) => {
    if (e.evento === "NikoConectado" || jaFoiAplicado(e.id)) return;
    if (e.evento === "NikoPedidoEncerrado") {
      if (e.pedidoId) get().removerPedido(e.pedidoId);
      const motivo = texto(e.dados.motivo);
      const aviso = Object.hasOwn(T.ilha.claude.pedidoEncerrado, motivo) ? T.ilha.claude.pedidoEncerrado[motivo as MotivoDeEncerramento] : null;
      set((s) => {
        const sessao = s.sessoes[e.sessao];
        if (!sessao) return {};
        const passos = aviso ? [...sessao.passos, novoPasso(e, "aviso", aviso)].slice(-MAXIMO_PASSOS) : sessao.passos;
        const aindaEsperando = s.pedidos.some((p) => p.sessao === e.sessao);
        const estado = sessao.estado === "aprovacao" && !aindaEsperando ? "trabalhando" : sessao.estado;
        return { sessoes: { ...s.sessoes, [e.sessao]: { ...sessao, passos, estado } } };
      });
      return;
    }
    if (!e.sessao || sessaoFoiFechadaAntes(e)) return;
    if (e.evento === "SessionEnd") {
      set((s) => (s.sessoes[e.sessao] ? semASessao(s, e.sessao) : {}));
      return;
    }
    set((s) => {
      const d = e.dados;
      const anterior = s.sessoes[e.sessao];
      const nomeReserva = T.ilha.claude.nomes[e.ferramenta ?? "claude"] ?? "Claude Code";
      const base: SessaoClaude = anterior ?? {
        id: e.sessao,
        ferramenta: e.ferramenta ?? "claude",
        projeto: nomeDoProjeto(e.cwd, nomeReserva),
        cwd: e.cwd,
        estado: "ociosa",
        passos: [],
        ferramentasUsadas: 0,
        iniciadaEm: e.recebidoEm,
        atualizadaEm: e.recebidoEm,
      };
      const sessao: SessaoClaude = { ...base, cwd: e.cwd || base.cwd, projeto: e.cwd ? nomeDoProjeto(e.cwd, nomeReserva) : base.projeto, atualizadaEm: e.recebidoEm, modo: texto(d.permission_mode) || base.modo, modelo: texto(d.model) || base.modelo };
      const passos = [...sessao.passos];
      let pedidos = s.pedidos;
      switch (e.evento) {
        case "SessionStart":
          if (!anterior) sessao.estado = "ociosa";
          break;
        case "NikoPensando":
          sessao.estado = "pensando";
          break;
        case "UserPromptSubmit": {
          const pedido = texto(d.prompt_text) || texto(d.prompt);
          sessao.estado = "pensando";
          sessao.pedido = pedido;
          sessao.resposta = undefined;
          sessao.erro = undefined;
          passos.push(novoPasso(e, "pedido", T.ilha.claude.pedido, pedido.slice(0, 400)));
          break;
        }
        case "PreToolUse": {
          const ferramenta = texto(d.tool_name) || "Tool";
          const entrada = (d.tool_input ?? {}) as Record<string, unknown>;
          sessao.estado = "trabalhando";
          sessao.ferramentasUsadas += 1;
          const passo = novoPasso(e, "ferramenta", rotuloDaFerramenta(ferramenta), encurtarCaminho(alvoDaFerramenta(entrada)).slice(0, 300), ferramenta);
          passo.alteracao = alteracaoDaFerramenta(ferramenta, entrada);
          passos.push(passo);
          break;
        }
        case "PostToolUseFailure": {
          const ferramenta = texto(d.tool_name) || "Tool";
          passos.push(novoPasso(e, "falha", `${T.ilha.claude.falhaFerramenta}: ${rotuloDaFerramenta(ferramenta)}`, texto(d.error).slice(0, 300), ferramenta));
          break;
        }
        case "PermissionRequest": {
          if (!e.pedidoId) break;
          const ferramenta = texto(d.tool_name) || "Tool";
          const entrada = (d.tool_input ?? {}) as Record<string, unknown>;
          sessao.estado = "aprovacao";
          pedidos = [...pedidos.filter((p) => p.pedidoId !== e.pedidoId), { pedidoId: e.pedidoId, ferramentaDeCodigo: sessao.ferramenta, sessao: e.sessao, projeto: sessao.projeto, ferramenta, alvo: alvoDaFerramenta(entrada), entrada: formatarEntrada(entrada), recebidoEm: e.recebidoEm, alteracao: alteracaoDaFerramenta(ferramenta, entrada), sugestoes: sugestoesDoEvento(d) }];
          break;
        }
        case "Notification": {
          const tipo = texto(d.notification_type);
          const mensagem = texto(d.message);
          if (/rate limit|limite de uso|usage limit/i.test(mensagem)) {
            sessao.estado = "limite";
            passos.push(novoPasso(e, "aviso", mensagem.slice(0, 200)));
          } else if (["idle_prompt", "agent_needs_input", "elicitation_dialog", "elicitation_url_dialog"].includes(tipo)) {
            sessao.estado = "esperando";
            if (mensagem) passos.push(novoPasso(e, "aviso", mensagem.slice(0, 200)));
          }
          break;
        }
        case "Stop":
          sessao.estado = "terminou";
          sessao.resposta = texto(d.last_assistant_message) || sessao.resposta;
          passos.push(novoPasso(e, "fim", T.ilha.claude.estados.terminou));
          break;
        case "StopFailure":
          sessao.estado = "erro";
          sessao.erro = texto(d.error_message) || texto(d.error_type);
          passos.push(novoPasso(e, "erro", T.ilha.claude.estados.erro, sessao.erro.slice(0, 300)));
          break;
        case "SubagentStart":
          passos.push(novoPasso(e, "subagente", T.ilha.claude.subagenteComecou(texto(d.agent_type) || "")));
          break;
        case "SubagentStop":
          passos.push(novoPasso(e, "subagente", T.ilha.claude.subagenteTerminou(texto(d.agent_type) || "")));
          break;
        default:
          return {};
      }
      sessao.passos = passos.slice(-MAXIMO_PASSOS);
      const ordem = [e.sessao, ...s.ordem.filter((x) => x !== e.sessao)].slice(0, MAXIMO_SESSOES);
      const sessoes = Object.fromEntries(ordem.map((id) => [id, id === e.sessao ? sessao : s.sessoes[id]]).filter(([, v]) => v)) as Record<string, SessaoClaude>;
      return { sessoes, ordem, pedidos, focada: s.focada && sessoes[s.focada] ? s.focada : e.sessao };
    });
  },
}));

export function sessaoAtiva(s: EstadoClaude): SessaoClaude | undefined {
  return s.ordem.map((id) => s.sessoes[id]).find((x) => x && (x.estado === "trabalhando" || x.estado === "pensando" || x.estado === "aprovacao"));
}
