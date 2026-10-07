import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { usarMovimentoReduzido } from "./usarMovimentoReduzido";
import { Personagem } from "../../../personagens/Personagem";
import { AGENTES } from "../../../estado/agentes";
import { useConfig } from "../../../estado/configuracoes";
import { tocarSom } from "../../../ponte/sons";
import { liberarSistemaInicial } from "../../../desktop/desktop";
import { saudacao } from "../../../utilitarios/datas";
import { T } from "../../../textos/textos";
import type { AgenteId } from "../../../tipos";
import "./saudacao.css";

const BRILHO: Record<AgenteId, string> = { organizador: "#ff5a5a", tutor: "#b26be0", operador: "#ffc20e", java: "#5b8def" };
const TAMANHO = 56;
const INICIO_DA_QUEDA = 0.32;
const INTERVALO_DA_QUEDA = 0.09;
const DURACAO_DA_QUEDA = 0.42;
const INICIO_DO_TITULO = 1.0;
const INTERVALO_DAS_LETRAS = 0.03;
const INICIO_DA_ONDA = 1.95;
const INTERVALO_DA_ONDA = 0.11;
const SAIDA_MS = 4600;
const FIM_MS = 5350;
const FAISCAS = 7;

type Fase = "entrada" | "saida";

function Faiscas({ cor, indice, pouso }: { cor: string; indice: number; pouso: number }) {
  return (
    <>
      {Array.from({ length: FAISCAS }, (_, i) => {
        const angulo = ((i / FAISCAS) * 360 + indice * 23) * (Math.PI / 180);
        const distancia = 30 + ((i * 7 + indice * 5) % 16);
        return (
          <motion.span
            key={i}
            className="saudacao-faisca"
            style={{ background: i % 2 === 0 ? cor : "#ffffff" }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{ x: Math.cos(angulo) * distancia, y: Math.sin(angulo) * distancia * 0.7, opacity: [0, 1, 0], scale: [0.3, 1, 0.2] }}
            transition={{ delay: pouso, duration: 0.85, ease: [0.15, 0.7, 0.3, 1] }}
          />
        );
      })}
    </>
  );
}

function Integrante({ agente, indice, fase, reduzido }: { agente: AgenteId; indice: number; fase: Fase; reduzido: boolean }) {
  const atraso = INICIO_DA_QUEDA + indice * INTERVALO_DA_QUEDA;
  const pouso = atraso + DURACAO_DA_QUEDA;
  const cor = BRILHO[agente];
  const saindo = fase === "saida";
  return (
    <motion.div
      className="saudacao-integrante"
      initial={{ y: reduzido ? 0 : -130, opacity: 0, scale: reduzido ? 1 : 0.7 }}
      animate={
        saindo
          ? { y: reduzido ? 0 : -140, opacity: 0, scale: 0.85, transition: { delay: (AGENTES.length - 1 - indice) * 0.06, duration: 0.42, ease: [0.5, 0, 0.75, 0] } }
          : { y: 0, opacity: 1, scale: 1, transition: reduzido ? { delay: atraso, duration: 0.3 } : { delay: atraso, type: "spring", visualDuration: 0.5, bounce: 0.42 } }
      }
    >
      <motion.span
        className="saudacao-sombra"
        style={{ background: cor }}
        initial={{ opacity: 0, scaleX: 0.3 }}
        animate={saindo ? { opacity: 0, scaleX: 0.3, transition: { duration: 0.25 } } : { opacity: 0.6, scaleX: 1, transition: { delay: pouso - 0.1, duration: 0.5 } }}
      />
      {!reduzido && <Faiscas cor={cor} indice={indice} pouso={pouso} />}
      <motion.div
        className="saudacao-onda"
        animate={reduzido ? undefined : { y: [0, -11, 0], rotate: [0, indice % 2 === 0 ? -6 : 6, 0] }}
        transition={{ delay: INICIO_DA_ONDA + indice * INTERVALO_DA_ONDA, duration: 0.5, ease: "easeInOut" }}
      >
        <motion.div
          className="saudacao-amasso"
          animate={reduzido ? undefined : { scaleX: [1, 1.18, 0.94, 1.02, 1], scaleY: [1, 0.8, 1.07, 0.99, 1] }}
          transition={{ delay: pouso - 0.04, duration: 0.5, times: [0, 0.2, 0.5, 0.75, 1], ease: "easeOut" }}
        >
          <Personagem agente={agente} estado="sucesso" tamanho={TAMANHO} interativo={false} halo={false} olhar={false} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function Saudacao({ versaoNova, aoTerminar }: { versaoNova?: string; aoTerminar: () => void }) {
  const nome = useConfig((s) => s.nome.trim().split(/\s+/)[0] ?? "");
  const reduzido = usarMovimentoReduzido();
  const [fase, setFase] = useState<Fase>("entrada");
  const [titulo] = useState(() => T.ilha.saudacao.titulo(saudacao(), nome));
  const saindo = fase === "saida";
  const subtitulo = versaoNova ? T.ilha.saudacao.atualizado(versaoNova) : T.ilha.saudacao.equipe;

  useEffect(() => {
    const som = window.setTimeout(() => void tocarSom("greet", "personagens"), INICIO_DA_QUEDA * 1000);
    const onda = window.setTimeout(() => void tocarSom("proud", "personagens"), INICIO_DA_ONDA * 1000);
    const saida = window.setTimeout(() => {
      setFase("saida");
      void liberarSistemaInicial();
    }, SAIDA_MS);
    const fim = window.setTimeout(aoTerminar, FIM_MS);
    return () => [som, onda, saida, fim].forEach((t) => window.clearTimeout(t));
  }, [aoTerminar]);

  return (
    <motion.div className="saudacao" role="status" aria-label={`${titulo}. ${subtitulo}`} initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      <div className="saudacao-fundo" aria-hidden="true">
        {!reduzido && (
          <>
            <motion.span
              className="saudacao-aurora"
              style={{ background: "radial-gradient(closest-side, #8b5cf6, transparent)", left: "8%" }}
              initial={{ opacity: 0, x: -30, scale: 0.6 }}
              animate={saindo ? { opacity: 0, transition: { duration: 0.5 } } : { opacity: [0, 0.55, 0.38], x: [-30, 40, 10], scale: [0.6, 1.1, 1], transition: { duration: 4.2, ease: "easeInOut" } }}
            />
            <motion.span
              className="saudacao-aurora"
              style={{ background: "radial-gradient(closest-side, #f472b6, transparent)", right: "6%" }}
              initial={{ opacity: 0, x: 30, scale: 0.6 }}
              animate={saindo ? { opacity: 0, transition: { duration: 0.5 } } : { opacity: [0, 0.4, 0.3], x: [30, -50, -10], scale: [0.6, 1.15, 1], transition: { duration: 4.4, ease: "easeInOut", delay: 0.15 } }}
            />
            <motion.span
              className="saudacao-anel"
              initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
              animate={saindo ? { opacity: 0, transition: { duration: 0.4 } } : { opacity: [0, 0.5, 0.22], scale: [0.4, 1.25, 1.4], rotate: 140, transition: { duration: 4.4, ease: [0.2, 0.7, 0.3, 1] } }}
            />
          </>
        )}
      </div>
      <div className="saudacao-equipe">
        {AGENTES.map((a, i) => (
          <Integrante key={a} agente={a} indice={i} fase={fase} reduzido={reduzido} />
        ))}
      </div>
      <h2 className="saudacao-titulo" aria-hidden="true">
        {Array.from(titulo).map((letra, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: reduzido ? 0 : 9, filter: reduzido ? "blur(0px)" : "blur(8px)" }}
            animate={
              saindo
                ? { opacity: 0, y: -6, filter: "blur(6px)", transition: { delay: i * 0.008, duration: 0.28 } }
                : { opacity: 1, y: 0, filter: "blur(0px)", transition: { delay: INICIO_DO_TITULO + i * INTERVALO_DAS_LETRAS, duration: 0.55, ease: [0.2, 0.8, 0.2, 1] } }
            }
          >
            {letra === " " ? " " : letra}
          </motion.span>
        ))}
      </h2>
      <motion.p
        className="saudacao-equipe-texto"
        aria-hidden="true"
        initial={{ opacity: 0, y: 6 }}
        animate={saindo ? { opacity: 0, transition: { duration: 0.2 } } : { opacity: 1, y: 0, transition: { delay: INICIO_DO_TITULO + titulo.length * INTERVALO_DAS_LETRAS + 0.15, duration: 0.5 } }}
      >
        {subtitulo}
      </motion.p>
    </motion.div>
  );
}
