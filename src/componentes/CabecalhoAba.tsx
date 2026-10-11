import type { ReactNode } from "react";
import { useInterface } from "../estado/interface";
import { GRUPO_DA_ROTA } from "../estado/configuracoes";
import { T } from "../textos/textos";
import type { Rota } from "../tipos";

export const ORDEM_DAS_ROTAS = Object.keys(T.rotas) as Rota[];

export function numeroDaRota(rota: Rota) {
  return String(ORDEM_DAS_ROTAS.indexOf(rota) + 1).padStart(2, "0");
}

interface Props {
  rotulo?: string;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
}

export function CabecalhoAba({ rotulo, titulo, subtitulo, acoes }: Props) {
  const rota = useInterface((s) => s.rota);
  return (
    <header className="cabecalho-aba">
      <div className="cabecalho-aba-texto">
        <span className="rotulo-pequeno cabecalho-aba-rotulo">
          {numeroDaRota(rota)}
          <span className="cabecalho-aba-traco" aria-hidden="true" />
          {rotulo ?? T.gruposBarra[GRUPO_DA_ROTA[rota]]}
        </span>
        <h1 className="titulo-pagina">{titulo}</h1>
        {subtitulo && <p className="cabecalho-aba-sub">{subtitulo}</p>}
      </div>
      {acoes && <div className="cabecalho-aba-acoes">{acoes}</div>}
    </header>
  );
}
