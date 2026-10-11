import { useState } from "react";

interface Barra {
  rotulo: string;
  valor: number;
  cor?: string;
  detalhe?: string;
}

export function BarrasHorizontais({ barras, formatar }: { barras: Barra[]; formatar: (v: number) => string }) {
  const maximo = Math.max(1, ...barras.map((b) => b.valor));
  return (
    <div className="barras-h">
      {barras.map((b) => (
        <div key={b.rotulo} className="barras-h-linha">
          <span className="barras-h-rotulo cortar">{b.rotulo}</span>
          <div className="barras-h-trilho">
            <span style={{ width: `${(b.valor / maximo) * 100}%`, background: b.cor ?? "var(--destaque)" }} />
          </div>
          <span className="barras-h-valor numero privado">{formatar(b.valor)}</span>
        </div>
      ))}
    </div>
  );
}

export function BarrasVerticais({ barras, formatar, altura = 140, aoEscolher, selecionada }: { barras: Barra[]; formatar: (v: number) => string; altura?: number | string; aoEscolher?: (i: number) => void; selecionada?: number }) {
  const [ativa, setAtiva] = useState<number | null>(null);
  const maximo = Math.max(1, ...barras.map((b) => b.valor));
  return (
    <div className="barras-v" style={{ height: altura }}>
      {barras.map((b, i) => (
        <div
          key={`${b.rotulo}-${i}`}
          className="barras-v-coluna"
          data-selecionada={selecionada === i ? "sim" : "nao"}
          data-clicavel={aoEscolher ? "sim" : "nao"}
          role={aoEscolher ? "button" : undefined}
          onClick={() => aoEscolher?.(i)}
          onKeyDown={(e) => aoEscolher && (e.key === "Enter" || e.key === " ") && aoEscolher(i)}
          onPointerEnter={() => setAtiva(i)}
          onPointerLeave={() => setAtiva(null)}
          tabIndex={0}
          onFocus={() => setAtiva(i)}
          onBlur={() => setAtiva(null)}
          aria-label={`${b.rotulo}: ${formatar(b.valor)}`}
        >
          {ativa === i && <span className="barras-v-dica numero">{b.detalhe ?? formatar(b.valor)}</span>}
          <div className="barras-v-trilho">
            <span style={{ height: `${Math.max(b.valor > 0 ? 3 : 0, (b.valor / maximo) * 100)}%`, background: b.cor ?? "var(--destaque)" }} />
          </div>
          <span className="barras-v-rotulo">{b.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

export function Anel({ progresso, tamanho = 40, espessura = 4, cor = "currentColor", fundo = "rgba(127,127,127,0.25)" }: { progresso: number; tamanho?: number; espessura?: number; cor?: string; fundo?: string }) {
  const raio = (tamanho - espessura) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const p = Math.max(0, Math.min(1, progresso));
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} aria-hidden="true" style={{ transform: "rotate(-90deg)", flex: "0 0 auto" }}>
      <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke={fundo} strokeWidth={espessura} />
      <circle
        cx={tamanho / 2}
        cy={tamanho / 2}
        r={raio}
        fill="none"
        stroke={cor}
        strokeWidth={espessura}
        strokeLinecap="round"
        strokeDasharray={circunferencia}
        strokeDashoffset={circunferencia * (1 - p)}
        style={{ transition: "stroke-dashoffset 0.5s linear" }}
      />
    </svg>
  );
}
