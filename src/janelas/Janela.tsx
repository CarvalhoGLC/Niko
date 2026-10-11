import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { Minus, Square, Copy, X } from "lucide-react";
import type { Geometria } from "../estado/interface";
import { T } from "../textos/textos";
import { limitar } from "../utilitarios/basicos";
import { janelaAtual } from "../desktop/desktop";

import { areaUtil } from "./geometria";

export { areaUtil, ALTURA_BARRA_TAREFAS } from "./geometria";

interface Props {
  titulo: ReactNode;
  rotuloAcessivel: string;
  geometria: Geometria;
  maximizada: boolean;
  z: number;
  minimo: { w: number; h: number };
  inicioBarra?: ReactNode;
  acoesBarra?: ReactNode;
  aoFocar: () => void;
  aoFechar: () => void;
  aoMinimizar: () => void;
  aoMaximizar: () => void;
  aoMudarGeometria: (g: Geometria) => void;
  children: ReactNode;
  idCamada?: string;
  nativa?: boolean;
  className?: string;
}

const DIRECAO_NATIVA = { n: "North", s: "South", l: "East", o: "West", nl: "NorthEast", no: "NorthWest", sl: "SouthEast", so: "SouthWest" } as const;

type Direcao = "n" | "s" | "l" | "o" | "nl" | "no" | "sl" | "so";

export function ajustarGeometria(g: Geometria, minimo: { w: number; h: number }): Geometria {
  const area = areaUtil();
  const w = limitar(g.w, Math.min(minimo.w, area.w), area.w);
  const h = limitar(g.h, Math.min(minimo.h, area.h), area.h);
  return { w, h, x: limitar(g.x, -w + 120, area.w - 120), y: limitar(g.y, 0, area.h - 40) };
}

export function Janela({
  titulo,
  rotuloAcessivel,
  geometria,
  maximizada,
  z,
  minimo,
  inicioBarra,
  acoesBarra,
  aoFocar,
  aoFechar,
  aoMinimizar,
  aoMaximizar,
  aoMudarGeometria,
  children,
  idCamada,
  nativa = false,
  className = "",
}: Props) {
  const arraste = useRef<{ x: number; y: number; g: Geometria; direcao?: Direcao } | null>(null);
  const elemento = useRef<HTMLDivElement>(null);
  const geometriaViva = useRef(geometria);
  geometriaViva.current = geometria;

  useEffect(() => {
    const aoRedimensionar = () => aoMudarGeometria(ajustarGeometria(geometriaViva.current, minimo));
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, [aoMudarGeometria, minimo]);

  const area = areaUtil();
  const g = maximizada ? { x: 0, y: 0, w: area.w, h: area.h } : geometria;

  const iniciar = (e: React.PointerEvent, direcao?: Direcao) => {
    if (e.button !== 0) return;
    if (nativa) {
      if (!direcao && (e.target as HTMLElement).closest("button, input, select, a")) return;
      e.preventDefault();
      void janelaAtual().then((j) => (direcao ? j.startResizeDragging(DIRECAO_NATIVA[direcao]) : j.startDragging()));
      return;
    }
    if (maximizada && direcao) return;
    aoFocar();
    if (!direcao && (e.target as HTMLElement).closest("button, input, select, a")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arraste.current = { x: e.clientX, y: e.clientY, g: { ...g }, direcao };
  };

  const mover = (e: React.PointerEvent) => {
    const a = arraste.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.direcao) {
      if (maximizada) {
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        const largura = geometria.w;
        const proporcao = (a.x - g.x) / g.w;
        aoMaximizar();
        arraste.current = { x: e.clientX, y: e.clientY, g: { ...geometria, x: e.clientX - largura * proporcao, y: 0 } };
        return;
      }
      aoMudarGeometria(ajustarGeometria({ ...a.g, x: a.g.x + dx, y: a.g.y + dy }, minimo));
      return;
    }
    let { x, y, w, h } = a.g;
    if (a.direcao.includes("l")) w = a.g.w + dx;
    if (a.direcao.includes("s")) h = a.g.h + dy;
    if (a.direcao.includes("o")) {
      w = a.g.w - dx;
      x = a.g.x + dx;
    }
    if (a.direcao.includes("n")) {
      h = a.g.h - dy;
      y = a.g.y + dy;
    }
    const mw = Math.min(minimo.w, area.w);
    const mh = Math.min(minimo.h, area.h);
    if (w < mw) {
      if (a.direcao.includes("o")) x -= mw - w;
      w = mw;
    }
    if (h < mh) {
      if (a.direcao.includes("n")) y -= mh - h;
      h = mh;
    }
    aoMudarGeometria(ajustarGeometria({ x, y, w, h }, minimo));
  };

  const terminar = (e: React.PointerEvent) => {
    if (!arraste.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!arraste.current.direcao && e.clientY <= 2 && !maximizada) aoMaximizar();
    arraste.current = null;
  };

  const alcas: Direcao[] = ["n", "s", "l", "o", "nl", "no", "sl", "so"];

  return (
    <motion.div
      ref={elemento}
      className={`janela ${maximizada ? "janela-maximizada" : ""} ${nativa ? "janela-nativa" : ""} ${className}`}
      role="dialog"
      aria-label={rotuloAcessivel}
      style={nativa ? { zIndex: z } : { left: g.x, top: g.y, width: g.w, height: g.h, zIndex: z }}
      initial={nativa ? false : { opacity: 0, scale: 0.96, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 24, transition: { duration: 0.2, ease: [0.45, 0, 0.2, 1] } }}
      transition={{ duration: 0.28, ease: [0.3, 0.9, 0.3, 1] }}
      onPointerDownCapture={aoFocar}
    >
      <div
        className="janela-barra"
        onPointerDown={(e) => iniciar(e)}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, select, a")) return;
          if (nativa) void janelaAtual().then((j) => j.toggleMaximize());
          else aoMaximizar();
        }}
      >
        {inicioBarra}
        <div className="janela-titulo cortar">{titulo}</div>
        <div className="janela-acoes-barra">{acoesBarra}</div>
        <div className="janela-controles">
          <button type="button" className="janela-controle" aria-label={T.janela.minimizar} title={T.janela.minimizar} onClick={nativa ? () => void janelaAtual().then((j) => j.minimize()) : aoMinimizar}>
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="janela-controle"
            aria-label={maximizada ? T.janela.restaurar : T.janela.maximizar}
            title={maximizada ? T.janela.restaurar : T.janela.maximizar}
            onClick={nativa ? () => void janelaAtual().then((j) => j.toggleMaximize()) : aoMaximizar}
          >
            {maximizada ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button type="button" className="janela-controle janela-fechar" aria-label={T.janela.fechar} title={T.janela.fechar} onClick={aoFechar}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="janela-corpo" id={idCamada}>
        {children}
      </div>
      {(nativa || !maximizada) &&
        alcas.map((d) => (
          <div
            key={d}
            className={`janela-alca janela-alca-${d}`}
            onPointerDown={(e) => iniciar(e, d)}
            onPointerMove={mover}
            onPointerUp={terminar}
            onPointerCancel={terminar}
          />
        ))}
    </motion.div>
  );
}
