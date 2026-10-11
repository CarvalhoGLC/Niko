import { alteracaoDaFerramenta, contarMudancas } from "./diff";
import { paraISO } from "./datas";

const DIA_MS = 86_400_000;
const SEMANAS_GUARDADAS = 12;
const TURNO_MAXIMO_MS = 6 * 3_600_000;
const LIMITE_DE_ARQUIVOS = 300;
const FERRAMENTAS_DE_COMANDO = new Set(["Bash", "PowerShell", "BashOutput", "shell", "run_shell_command"]);

export interface EventoDeCodigo {
  evento: string;
  sessao: string;
  ferramenta?: string;
  cwd: string;
  recebidoEm: string;
  dados: Record<string, unknown>;
}

export interface DiaDeSessao {
  ms: number;
  mais: number;
  menos: number;
  comandos: number;
  pedidos: number;
  perguntas: number;
  arquivos: string[];
}

export interface RegistroDeSessao {
  id: string;
  ferramenta: string;
  projeto: string;
  inicio: number;
  fim: number;
  trabalhoMs: number;
  turnoDesde: number | null;
  dias: Record<string, DiaDeSessao>;
  turnos: number;
}

const DIA_VAZIO: DiaDeSessao = { ms: 0, mais: 0, menos: 0, comandos: 0, pedidos: 0, perguntas: 0, arquivos: [] };

export interface HistoricoDeCodigo {
  sessoes: Record<string, RegistroDeSessao>;
  ultimoEvento: number;
}

export interface ResumoDaSemana {
  inicio: string;
  tempoMs: number;
  sessoes: number;
  arquivos: number;
  mais: number;
  menos: number;
  comandos: number;
  pedidos: number;
  perguntas: number;
  agente: { ferramenta: string; tempoMs: number } | null;
  projeto: { nome: string; tempoMs: number } | null;
  diaMaisCheio: { dia: string; tempoMs: number } | null;
  maisLonga: { projeto: string; tempoMs: number } | null;
}

export const HISTORICO_VAZIO: HistoricoDeCodigo = { sessoes: {}, ultimoEvento: 0 };

function nomeDaPasta(cwd: string): string {
  const limpo = cwd.replace(/[\\/]+$/, "");
  return limpo.slice(Math.max(limpo.lastIndexOf("\\"), limpo.lastIndexOf("/")) + 1) || "";
}

function diaDe(r: RegistroDeSessao, momento: number): DiaDeSessao {
  const chave = paraISO(new Date(momento));
  const dia = { ...DIA_VAZIO, ...r.dias[chave] };
  dia.arquivos = [...dia.arquivos];
  r.dias = { ...r.dias, [chave]: dia };
  return dia;
}

function fecharTurno(r: RegistroDeSessao, ate: number) {
  if (r.turnoDesde === null) return;
  const duracao = Math.max(0, Math.min(ate - r.turnoDesde, TURNO_MAXIMO_MS));
  r.trabalhoMs += duracao;
  diaDe(r, r.turnoDesde).ms += duracao;
  r.turnoDesde = null;
}

export function acumular(h: HistoricoDeCodigo, e: EventoDeCodigo): HistoricoDeCodigo {
  const quando = Date.parse(e.recebidoEm);
  if (!e.sessao || !Number.isFinite(quando) || quando <= h.ultimoEvento || e.evento.startsWith("Niko")) return h;
  const anterior = h.sessoes[e.sessao];
  const r: RegistroDeSessao = anterior
    ? { ...anterior, dias: anterior.dias ?? {} }
    : { id: e.sessao, ferramenta: e.ferramenta ?? "claude", projeto: nomeDaPasta(e.cwd), inicio: quando, fim: quando, trabalhoMs: 0, turnoDesde: null, dias: {}, turnos: 0 };
  const ultimaAtividade = r.fim;
  if (e.cwd && !r.projeto) r.projeto = nomeDaPasta(e.cwd);
  r.fim = Math.max(r.fim, quando);
  const nome = typeof e.dados.tool_name === "string" ? e.dados.tool_name : "";
  const entrada = (e.dados.tool_input && typeof e.dados.tool_input === "object" ? e.dados.tool_input : {}) as Record<string, unknown>;
  switch (e.evento) {
    case "UserPromptSubmit":
      fecharTurno(r, ultimaAtividade);
      r.turnos += 1;
      r.turnoDesde = quando;
      break;
    case "PreToolUse": {
      if (r.turnoDesde === null) r.turnoDesde = quando;
      const dia = diaDe(r, quando);
      if (FERRAMENTAS_DE_COMANDO.has(nome)) dia.comandos += 1;
      const alteracao = alteracaoDaFerramenta(nome, entrada);
      if (alteracao) {
        const { mais, menos } = contarMudancas(alteracao);
        dia.mais += mais;
        dia.menos += menos;
        if (!dia.arquivos.includes(alteracao.arquivo) && dia.arquivos.length < LIMITE_DE_ARQUIVOS) dia.arquivos.push(alteracao.arquivo);
      }
      break;
    }
    case "PermissionRequest":
      if (nome === "AskUserQuestion") diaDe(r, quando).perguntas += 1;
      else diaDe(r, quando).pedidos += 1;
      break;
    case "Stop":
    case "StopFailure":
      fecharTurno(r, quando);
      break;
    case "SessionEnd":
      fecharTurno(r, ultimaAtividade);
      break;
    default:
      break;
  }
  const limite = quando - SEMANAS_GUARDADAS * 7 * DIA_MS;
  const sessoes = Object.fromEntries(Object.entries({ ...h.sessoes, [r.id]: r }).filter(([, s]) => s.fim >= limite));
  return { sessoes, ultimoEvento: quando };
}

export function inicioDaSemana(data: Date): Date {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const desdeSegunda = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - desdeSegunda);
  return d;
}

export function semanaPassada(hoje: Date): Date {
  const inicio = inicioDaSemana(hoje);
  inicio.setDate(inicio.getDate() - 7);
  return inicio;
}

function maior<T>(mapa: Map<T, number>): { chave: T; valor: number } | null {
  let melhor: { chave: T; valor: number } | null = null;
  for (const [chave, valor] of mapa) if (valor > 0 && (!melhor || valor > melhor.valor)) melhor = { chave, valor };
  return melhor;
}

export function resumoDaSemana(h: HistoricoDeCodigo, inicio: Date): ResumoDaSemana {
  const dias = Array.from({ length: 7 }, (_, i) => paraISO(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)));
  const porAgente = new Map<string, number>();
  const porProjeto = new Map<string, number>();
  const porDia = new Map<string, number>();
  const arquivos = new Set<string>();
  const resumo: ResumoDaSemana = { inicio: dias[0], tempoMs: 0, sessoes: 0, arquivos: 0, mais: 0, menos: 0, comandos: 0, pedidos: 0, perguntas: 0, agente: null, projeto: null, diaMaisCheio: null, maisLonga: null };
  for (const s of Object.values(h.sessoes)) {
    const daSemana = dias.map((d) => [d, s.dias?.[d]] as const).filter((x): x is readonly [string, DiaDeSessao] => Boolean(x[1]));
    const tempo = daSemana.reduce((soma, [, d]) => soma + d.ms, 0);
    if (tempo <= 0) continue;
    resumo.tempoMs += tempo;
    resumo.sessoes += 1;
    for (const [chave, d] of daSemana) {
      resumo.mais += d.mais;
      resumo.menos += d.menos;
      resumo.comandos += d.comandos;
      resumo.pedidos += d.pedidos;
      resumo.perguntas += d.perguntas;
      for (const a of d.arquivos) arquivos.add(a);
      if (d.ms) porDia.set(chave, (porDia.get(chave) ?? 0) + d.ms);
    }
    porAgente.set(s.ferramenta, (porAgente.get(s.ferramenta) ?? 0) + tempo);
    if (s.projeto) porProjeto.set(s.projeto, (porProjeto.get(s.projeto) ?? 0) + tempo);
    if (!resumo.maisLonga || tempo > resumo.maisLonga.tempoMs) resumo.maisLonga = { projeto: s.projeto, tempoMs: tempo };
  }
  resumo.arquivos = arquivos.size;
  const agente = maior(porAgente);
  const projeto = maior(porProjeto);
  const dia = maior(porDia);
  resumo.agente = agente && { ferramenta: agente.chave, tempoMs: agente.valor };
  resumo.projeto = projeto && { nome: projeto.chave, tempoMs: projeto.valor };
  resumo.diaMaisCheio = dia && { dia: dia.chave, tempoMs: dia.valor };
  return resumo;
}
