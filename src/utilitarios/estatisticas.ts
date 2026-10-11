import { addDays, eachDayOfInterval, startOfYear, endOfYear } from "date-fns";
import type { Habito, SessaoPomodoro, Tarefa, RegistroRevisao, Conexao } from "../tipos";
import { paraISO, hojeISO, deISO, diaDoMomento } from "./datas";
import { habitoCumprido } from "../estado/rotina";
import { lerChave, gravarChave } from "../ponte/armazenamento";

export type FonteMapa = "tudo" | "estudo" | "habitos" | "tarefas" | "commits";

export interface DadosMapa {
  sessoes: SessaoPomodoro[];
  registroRevisoes: RegistroRevisao[];
  habitos: Habito[];
  registros: Record<string, Record<string, number>>;
  tarefas: Tarefa[];
  conexoes: Conexao[];
}


const CHAVE_COMMITS = "niko:commits";
let commitsEmMemoria: Record<string, number> | null = null;

export function guardarCommits(novos: Record<string, number>) {
  const atuais = commitsDoGithub();
  commitsEmMemoria = { ...atuais, ...novos };
  gravarChave(CHAVE_COMMITS, JSON.stringify(commitsEmMemoria));
}

function commitsDoGithub(): Record<string, number> {
  if (commitsEmMemoria) return commitsEmMemoria;
  try {
    commitsEmMemoria = JSON.parse(lerChave(CHAVE_COMMITS) ?? "{}") as Record<string, number>;
  } catch {
    commitsEmMemoria = {};
  }
  return commitsEmMemoria;
}

export function commitsDoDia(data: string, conexoes: Conexao[]): number {
  const github = conexoes.find((c) => c.id === "github");
  if (!github?.chaveSalva) return 0;
  return commitsDoGithub()[data] ?? 0;
}
export function minutosEstudoPorDia(sessoes: SessaoPomodoro[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const s of sessoes) {
    if (s.etapa !== "foco" || s.situacao !== "concluida") continue;
    const d = diaDoMomento(s.inicio);
    mapa.set(d, (mapa.get(d) ?? 0) + s.minutos);
  }
  return mapa;
}

export function valoresDoMapa(dados: DadosMapa, fonte: FonteMapa, ano = new Date().getFullYear()) {
  const dias = eachDayOfInterval({ start: startOfYear(new Date(ano, 0, 1)), end: endOfYear(new Date(ano, 0, 1)) }).map(paraISO);
  const estudo = minutosEstudoPorDia(dados.sessoes);
  const revisoes = new Map(dados.registroRevisoes.map((r) => [r.data, r.quantidade]));
  const concluidas = new Map<string, number>();
  for (const t of dados.tarefas) {
    if (t.status !== "concluida" || !t.concluidaEm) continue;
    const d = diaDoMomento(t.concluidaEm);
    concluidas.set(d, (concluidas.get(d) ?? 0) + 1);
  }
  const ativos = dados.habitos.filter((h) => !h.arquivado);

  return dias.map((data) => {
    const minutos = estudo.get(data) ?? 0;
    const cartoes = revisoes.get(data) ?? 0;
    const tarefas = concluidas.get(data) ?? 0;
    const registro = dados.registros[data] ?? {};
    const pctHabitos = ativos.length ? ativos.filter((h) => habitoCumprido(h, registro[h.id])).length / ativos.length : 0;
    const commits = commitsDoDia(data, dados.conexoes);

    const nivelEstudo = minutos + cartoes === 0 ? 0 : minutos >= 120 ? 4 : minutos >= 60 ? 3 : minutos >= 25 || cartoes >= 20 ? 2 : 1;
    const nivelHabitos = pctHabitos === 0 ? 0 : pctHabitos >= 1 ? 4 : pctHabitos >= 0.66 ? 3 : pctHabitos >= 0.33 ? 2 : 1;
    const nivelTarefas = tarefas === 0 ? 0 : tarefas >= 6 ? 4 : tarefas >= 4 ? 3 : tarefas >= 2 ? 2 : 1;
    const nivelCommits = commits === 0 ? 0 : commits >= 8 ? 4 : commits >= 5 ? 3 : commits >= 2 ? 2 : 1;

    const niveis = { estudo: nivelEstudo, habitos: nivelHabitos, tarefas: nivelTarefas, commits: nivelCommits };
    const nivel =
      fonte === "tudo"
        ? Math.min(4, Math.round((nivelEstudo + nivelHabitos + nivelTarefas + nivelCommits) / 2))
        : niveis[fonte];
    return { data, nivel, minutos, cartoes, tarefas, pctHabitos, commits };
  });
}

export function sequenciaHabito(habito: Habito, registros: Record<string, Record<string, number>>): number {
  let dia = deISO(hojeISO());
  if (!habitoCumprido(habito, registros[paraISO(dia)]?.[habito.id])) dia = addDays(dia, -1);
  let n = 0;
  while (habitoCumprido(habito, registros[paraISO(dia)]?.[habito.id]) && n < 3650) {
    n++;
    dia = addDays(dia, -1);
  }
  return n;
}

export function sequenciaDias(datas: Set<string>): number {
  let dia = deISO(hojeISO());
  if (!datas.has(paraISO(dia))) dia = addDays(dia, -1);
  let n = 0;
  while (datas.has(paraISO(dia)) && n < 3650) {
    n++;
    dia = addDays(dia, -1);
  }
  return n;
}
