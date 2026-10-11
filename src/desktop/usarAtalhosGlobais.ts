import { useEffect } from "react";
import { create } from "zustand";
import { useConfig } from "../estado/configuracoes";
import { usePomodoro } from "../estado/pomodoro";
import { useMidia } from "../estado/midia";
import { useIlha } from "../estado/ilha";
import { tocarSom } from "../ponte/sons";
import { claudeCode } from "../ponte/claudeCode";
import { sessaoAtiva, useClaudeCode } from "../estado/claudeCode";
import { T } from "../textos/textos";
import { ACOES_GLOBAIS, type AcaoGlobal, type SituacaoDoAtalho } from "../utilitarios/atalhos";
import { NATIVO, definirAtalhosGlobais, ouvirAtalho } from "./desktop";

export const useSituacaoDosAtalhos = create<{ situacoes: Partial<Record<AcaoGlobal, SituacaoDoAtalho>> }>(() => ({ situacoes: {} }));

function executarNoSistema(acao: string) {
  const cfg = useConfig.getState();
  if (acao === "pomodoro") {
    usePomodoro.getState().alternar();
    void tocarSom("blip");
  } else if (acao === "midia") useMidia.getState().alternar();
  else if (acao === "privacidade") cfg.definir({ privacidade: !cfg.privacidade });
  else if (acao === "naoPerturbe") cfg.definir({ naoPerturbe: !cfg.naoPerturbe });
}

let pausados = false;

export async function sincronizarAtalhosGlobais() {
  if (!NATIVO || pausados) return;
  const atalhos = useConfig.getState().atalhosGlobais;
  const resultado = await definirAtalhosGlobais(ACOES_GLOBAIS.map((acao) => ({ acao, teclas: atalhos[acao] ?? "" })));
  if (!resultado || pausados) return;
  useSituacaoDosAtalhos.setState({ situacoes: Object.fromEntries(resultado.map((r) => [r.acao, r.situacao])) as Partial<Record<AcaoGlobal, SituacaoDoAtalho>> });
}

export async function pausarAtalhosGlobais(pausar: boolean) {
  if (!NATIVO) return;
  pausados = pausar;
  if (pausar) await definirAtalhosGlobais([]);
  else await sincronizarAtalhosGlobais();
}

export function usarAtalhosGlobais() {
  const chave = useConfig((s) => JSON.stringify(s.atalhosGlobais));

  useEffect(() => {
    void sincronizarAtalhosGlobais();
  }, [chave]);

  useEffect(() => {
    let vivo = true;
    let desligar: () => void = () => undefined;
    void ouvirAtalho(executarNoSistema).then((f) => {
      if (vivo) desligar = f;
      else f();
    });
    return () => {
      vivo = false;
      desligar();
    };
  }, []);
}

export function trazerTerminalDaSessao(id?: string) {
  const claude = useClaudeCode.getState();
  const sessao = id ?? claude.pedidos[0]?.sessao ?? sessaoAtiva(claude)?.id ?? claude.focada ?? claude.ordem[0];
  if (!sessao) {
    useIlha.getState().avisarFalha(T.ilha.claude.terminal.semSessao);
    return;
  }
  claudeCode.terminal(sessao).catch((e: Error) => useIlha.getState().avisarFalha(e.message === "sem_processo" ? T.ilha.claude.terminal.semProcesso : T.ilha.claude.terminal.falhou));
}

export function usarAtalhosDaIlha() {
  useEffect(() => {
    let vivo = true;
    let desligar: () => void = () => undefined;
    void ouvirAtalho((acao) => {
      if (acao === "pedido") useIlha.getState().abrir("claude");
      if (acao === "terminal") trazerTerminalDaSessao();
    }).then((f) => {
      if (vivo) desligar = f;
      else f();
    });
    return () => {
      vivo = false;
      desligar();
    };
  }, []);
}
