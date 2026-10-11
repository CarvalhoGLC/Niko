import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Minus, Check, Settings2 } from "lucide-react";
import { Botao, Campo } from "../../componentes/basicos";
import { useRotina, DIA_VAZIO } from "../../estado/rotina";
import { useConfig } from "../../estado/configuracoes";
import { tocarSom } from "../../ponte/sons";
import { T } from "../../textos/textos";

const BASE = 113;
const TOPO = 4;
const MEIO = 43;
const CORPO = "M2 0 L2 96 Q2 114 20 114 L66 114 Q84 114 84 96 L84 0";
const INTERIOR = "M3 0 L83 0 L83 96 Q83 113 66 113 L20 113 Q3 113 3 96 Z";

export function litros(ml: number) {
  return (ml / 1000).toLocaleString("pt-BR", { minimumFractionDigits: ml % 1000 === 0 ? 0 : 1, maximumFractionDigits: 2 });
}

export function CopoAgua({ data }: { data: string }) {
  const dia = useRotina((s) => s.dias[data] ?? DIA_VAZIO);
  const atualizarDia = useRotina((s) => s.atualizarDia);
  const agua = useConfig((s) => s.agua);
  const definir = useConfig((s) => s.definir);
  const [despejando, setDespejando] = useState(0);
  const [ajustando, setAjustando] = useState(false);
  const [meta, setMeta] = useState(String(agua.meta));
  const [copo, setCopo] = useState(String(agua.copo));
  const temporizador = useRef<number | undefined>(undefined);
  const ml = dia.agua ?? 0;
  const p = Math.min(1, ml / Math.max(1, agua.meta));
  const nivel = BASE - (BASE - TOPO) * p;
  const completo = ml >= agua.meta;

  const pendente = useRef(0);

  const gravarPendente = () => {
    window.clearTimeout(temporizador.current);
    if (!pendente.current) return;
    const atual = useRotina.getState().dias[data]?.agua ?? 0;
    const novo = Math.min(10000, atual + pendente.current);
    pendente.current = 0;
    atualizarDia(data, { agua: novo });
    if (novo >= useConfig.getState().agua.meta && atual < useConfig.getState().agua.meta) void tocarSom("proud", "personagens");
  };

  useEffect(() => () => gravarPendente(), [data]);

  const adicionar = (quantidade: number) => {
    if (quantidade > 0) {
      setDespejando((n) => n + 1);
      void tocarSom("gulp", "interface");
      pendente.current += quantidade;
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(gravarPendente, 520);
      return;
    }
    gravarPendente();
    const atual = useRotina.getState().dias[data]?.agua ?? 0;
    atualizarDia(data, { agua: Math.max(0, atual + quantidade) });
  };

  const salvarAjuste = (e: React.FormEvent) => {
    e.preventDefault();
    const m = Math.round(Number(meta));
    const c = Math.round(Number(copo));
    if (!(m >= 250 && m <= 10000) || !(c >= 50 && c <= 2000)) return;
    definir({ agua: { meta: m, copo: c } });
    setAjustando(false);
  };

  return (
    <section className="cartao jn-agua" data-completo={completo ? "sim" : "nao"}>
      <svg className="jn-agua-copo" viewBox="0 0 86 116" role="img" aria-label={T.journal.aguaRotulo(litros(ml), litros(agua.meta))}>
        <defs>
          <clipPath id="jn-agua-interior">
            <path d={INTERIOR} />
          </clipPath>
          <linearGradient id="jn-agua-liquido" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" className="jn-agua-cor-topo" />
            <stop offset="1" className="jn-agua-cor-fundo" />
          </linearGradient>
        </defs>
        <path d={INTERIOR} className="jn-agua-fundo" />
        <AnimatePresence>
          {despejando > 0 && (
            <motion.g key={despejando} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 1.2, times: [0, 0.08, 0.78, 1] }} onAnimationComplete={() => setDespejando(0)}>
              <motion.rect
                x={MEIO - 2.5}
                width={5}
                rx={2.5}
                fill="url(#jn-agua-liquido)"
                initial={{ y: -6, height: 0 }}
                animate={{ y: [-6, -6, -6, nivel - 4], height: [0, nivel + 4, nivel + 4, 3] }}
                transition={{ duration: 1.2, times: [0, 0.28, 0.7, 1], ease: "easeIn" }}
              />
              {[0, 1, 2].map((i) => (
                <motion.circle
                  key={i}
                  cx={MEIO - 4 + i * 4}
                  r={1.6}
                  className="jn-agua-gota"
                  initial={{ cy: -6, opacity: 0 }}
                  animate={{ cy: [-6, nivel - 3], opacity: [0, 1, 0] }}
                  transition={{ duration: 0.55, delay: 0.15 + i * 0.18, ease: "easeIn" }}
                />
              ))}
              {[0, 1].map((i) => (
                <motion.ellipse
                  key={`o-${i}`}
                  cx={MEIO}
                  cy={nivel - 1}
                  fill="none"
                  className="jn-agua-onda-circulo"
                  strokeWidth={1.5}
                  initial={{ rx: 2, ry: 0.8, opacity: 0 }}
                  animate={{ rx: [2, 24], ry: [0.8, 3.5], opacity: [0.9, 0] }}
                  transition={{ duration: 0.7, delay: 0.3 + i * 0.3, ease: "easeOut" }}
                />
              ))}
            </motion.g>
          )}
        </AnimatePresence>
        <g clipPath="url(#jn-agua-interior)">
          <motion.g initial={false} animate={{ y: nivel - TOPO }} transition={{ type: "spring", visualDuration: 0.9, bounce: 0.25 }}>
            <g className="jn-agua-onda">
              <path d={`M-80 ${TOPO} q 10 -3 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 V 300 H -80 Z`} fill="url(#jn-agua-liquido)" />
            </g>
            <g className="jn-agua-onda jn-agua-onda-2">
              <path d={`M-80 ${TOPO + 2} q 10 -2.5 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 V 300 H -80 Z`} fill="url(#jn-agua-liquido)" opacity="0.5" />
            </g>
            {p > 0.08 && [0, 1, 2].map((i) => <circle key={i} className="jn-agua-bolha" cx={24 + i * 18} cy={TOPO + 40 + i * 12} r={1.4 + i * 0.5} style={{ animationDelay: `${i * 0.9}s` }} />)}
          </motion.g>
        </g>
        <path d={CORPO} className="jn-agua-vidro" />
      </svg>

      <div className="jn-agua-info">
        <div className="jn-agua-topo">
          <span className="secao-titulo">{T.journal.agua}</span>
          <Botao pequeno soIcone variante="fantasma" icone={<Settings2 size={13} />} aria-label={T.journal.aguaAjustar} title={T.journal.aguaAjustar} aria-expanded={ajustando} onClick={() => setAjustando((a) => !a)} />
        </div>
        <div className="jn-agua-total">
          <span className="jn-agua-numero">{litros(ml)}</span>
          <span className="jn-agua-meta">{T.journal.aguaDe(litros(agua.meta))}</span>
        </div>
        {completo ? (
          <span className="jn-agua-completa"><Check size={12} />{T.journal.aguaCompleta}</span>
        ) : (
          <span className="jn-agua-falta">{T.journal.aguaFalta(litros(agua.meta - ml))}</span>
        )}
        <div className="jn-agua-botoes">
          <button type="button" className="jn-agua-botao" data-principal="sim" onClick={() => adicionar(agua.copo)}>{T.journal.aguaCopo(agua.copo)}</button>
          <button type="button" className="jn-agua-botao" onClick={() => adicionar(500)}>{T.journal.aguaGarrafa}</button>
          <button type="button" className="jn-agua-botao jn-agua-tirar" aria-label={T.journal.aguaTirar} title={T.journal.aguaTirar} disabled={ml === 0} onClick={() => adicionar(-agua.copo)}>
            <Minus size={13} />
          </button>
        </div>
      </div>
      {ajustando && (
        <form className="jn-agua-ajuste" onSubmit={salvarAjuste} noValidate>
          <Campo id="ag-meta" rotulo={T.journal.aguaMeta} dica={T.journal.aguaMetaDica}>
            <input id="ag-meta" className="campo" inputMode="numeric" value={meta} onChange={(e) => setMeta(e.target.value.replace(/\D/g, ""))} />
          </Campo>
          <Campo id="ag-copo" rotulo={T.journal.aguaTamanhoCopo}>
            <input id="ag-copo" className="campo" inputMode="numeric" value={copo} onChange={(e) => setCopo(e.target.value.replace(/\D/g, ""))} />
          </Campo>
          <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
        </form>
      )}
    </section>
  );
}
