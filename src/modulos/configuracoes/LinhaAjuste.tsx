import type { CSSProperties, ReactNode } from "react";
import { Alternador } from "../../componentes/basicos";

interface PropsLinhaAjuste {
  rotulo: ReactNode;
  dica?: ReactNode;
  para?: string;
  inicio?: ReactNode;
  bloco?: boolean;
  esticar?: boolean;
  children?: ReactNode;
}

export function LinhaAjuste({ rotulo, dica, para, inicio, bloco, esticar, children }: PropsLinhaAjuste) {
  return (
    <div className="ajuste-linha" data-bloco={bloco ? "sim" : undefined} data-esticar={esticar ? "sim" : undefined}>
      <div className="ajuste-texto">
        {inicio}
        <span className="ajuste-texto-coluna">
          {para ? (
            <label className="ajuste-rotulo" htmlFor={para}>{rotulo}</label>
          ) : (
            <span className="ajuste-rotulo">{rotulo}</span>
          )}
          {dica && <span className="ajuste-dica">{dica}</span>}
        </span>
      </div>
      {children && <div className="ajuste-controle">{children}</div>}
    </div>
  );
}

export function AlternadorAjuste({ rotulo, dica, ligado, aoMudar, desativado }: { rotulo: string; dica?: ReactNode; ligado: boolean; aoMudar: (v: boolean) => void; desativado?: boolean }) {
  return (
    <LinhaAjuste rotulo={rotulo} dica={dica}>
      <Alternador ligado={ligado} aoMudar={aoMudar} rotulo={rotulo} desativado={desativado} />
    </LinhaAjuste>
  );
}

export function GrupoAjuste({ titulo, dica, acoes }: { titulo: string; dica?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="ajuste-grupo">
      <div className="ajuste-grupo-cabecalho">
        <span className="ajuste-grupo-titulo">{titulo}</span>
        <span className="tracejado" aria-hidden="true" />
        {acoes}
      </div>
      {dica && <span className="ajuste-dica">{dica}</span>}
    </div>
  );
}

export function NotaAjuste({ children }: { children: ReactNode }) {
  return <div className="ajuste-nota">{children}</div>;
}

interface PropsFaixaAjuste {
  id?: string;
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  texto: string;
  aoMudar: (v: number) => void;
  aoSoltar?: () => void;
}

export function FaixaAjuste({ id, rotulo, valor, min, max, passo, texto, aoMudar, aoSoltar }: PropsFaixaAjuste) {
  const preenchido = max > min ? ((valor - min) / (max - min)) * 100 : 0;
  return (
    <span className="ajuste-faixa-caixa">
      <input
        id={id}
        type="range"
        className="ajuste-faixa"
        min={min}
        max={max}
        step={passo}
        value={valor}
        aria-label={rotulo}
        style={{ "--preenchido": `${Math.max(0, Math.min(100, preenchido))}%` } as CSSProperties}
        onChange={(e) => aoMudar(Number(e.target.value))}
        onPointerUp={aoSoltar}
      />
      <output className="ajuste-faixa-valor" htmlFor={id}>{texto}</output>
    </span>
  );
}

export function Teclas({ teclas, className = "" }: { teclas: string; className?: string }) {
  return (
    <span className={`ajuste-teclas ${className}`}>
      {teclas.split(" + ").map((t, i) => (
        <kbd key={`${t}-${i}`} className="tecla tecla-alta">{t}</kbd>
      ))}
    </span>
  );
}
