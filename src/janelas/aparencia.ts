import { useMemo } from "react";
import { useConfig } from "../estado/configuracoes";
import { aparenciaDeBorda, hexValido, type AparenciaDeBorda } from "../utilitarios/cores";
import { DESTAQUE_PADRAO } from "./area-de-trabalho/usarTema";

export function usarAparenciaDeBorda(fundo: string, opacidade: number): AparenciaDeBorda {
  const destaque = useConfig((s) => s.destaque);
  return useMemo(() => aparenciaDeBorda(fundo, opacidade, destaque && hexValido(destaque) ? destaque : DESTAQUE_PADRAO.escuro), [fundo, opacidade, destaque]);
}

export function atributosDoFundo(a: AparenciaDeBorda) {
  return { "data-fundo-claro": a.claro || undefined, "data-fundo-escuro": !a.claro || undefined };
}

export function variaveisDaBorda(a: AparenciaDeBorda): Record<string, string> {
  return {
    "--borda-fundo": a.fundo,
    "--borda-fundo-solido": a.fundoSolido,
    "--borda-fundo-elevado": a.fundoElevado,
    "--borda-rgb": a.rgbDaTinta,
  };
}
