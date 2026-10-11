import { useEffect } from "react";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { usePomodoro } from "../../estado/pomodoro";
import { useMidia } from "../../estado/midia";
import { useRotina } from "../../estado/rotina";
import { tocarSom } from "../../ponte/sons";
import { T } from "../../textos/textos";
import { rotaLigada } from "../../utilitarios/funcoes";
import { ACOES_GLOBAIS, combinaCom, type AcaoGlobal } from "../../utilitarios/atalhos";

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export const EVENTO_NOVO = "niko:novo";

export function usarAtalhos() {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const ui = useInterface.getState();
      const cfg = useConfig.getState();
      const tecla = e.key.toLowerCase();

      const acao = ACOES_GLOBAIS.find((a) => cfg.atalhosGlobais[a] && combinaCom(e, cfg.atalhosGlobais[a]));
      if (acao) {
        const executar: Partial<Record<AcaoGlobal, () => void>> = {
          captura: () => ui.abrirCaptura(true),
          pomodoro: () => {
            usePomodoro.getState().alternar();
            void tocarSom("blip");
          },
          midia: () => useMidia.getState().alternar(),
          privacidade: () => cfg.definir({ privacidade: !cfg.privacidade }),
          naoPerturbe: () => cfg.definir({ naoPerturbe: !cfg.naoPerturbe }),
          sistema: () => {
            const visivel = ui.sistemaAberto && !ui.sistemaMinimizado;
            ui.definirSistema(visivel ? { sistemaMinimizado: true } : { sistemaAberto: true, sistemaMinimizado: false });
            if (!visivel) ui.focarSistema();
          },
        };
        const fn = executar[acao];
        if (fn) {
          e.preventDefault();
          fn();
          return;
        }
      }

      if (!e.ctrlKey || e.altKey) return;

      if (tecla === "k") {
        e.preventDefault();
        ui.abrirBusca(!ui.buscaAberta);
        return;
      }
      if (tecla === "s") {
        e.preventDefault();
        ui.avisar(T.geral.salvoAgora);
        return;
      }
      if (tecla === "b") {
        e.preventDefault();
        cfg.definir({ barraRecolhida: !cfg.barraRecolhida });
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const visiveis = cfg.barraLateral.filter((i) => i.visivel && rotaLigada(i.rota, cfg.funcoesDesligadas));
        const alvo = visiveis[Number(e.key) - 1];
        if (alvo) {
          e.preventDefault();
          ui.irPara(alvo.rota);
        }
        return;
      }
      if (tecla === "n" && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(EVENTO_NOVO, { detail: ui.rota }));
        return;
      }
      if (tecla === "z" && !emCampoDeTexto(e.target) && ui.rota === "journal") {
        e.preventDefault();
        if (e.shiftKey) useRotina.getState().refazer();
        else useRotina.getState().desfazer();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);
}
