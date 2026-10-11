import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { T } from "../../textos/textos";
import { limitarMenu } from "./acoesDoMenu";

export interface ItemMenuDock {
  id: string;
  texto: string;
  icone?: LucideIcon;
  acao?: () => void | Promise<unknown>;
  itens?: ItemMenuDock[];
  marcado?: boolean;
  perigo?: boolean;
  desativado?: boolean;
  confirmar?: boolean;
}
export interface AlvoMenuDock {
  x: number;
  y: number;
  origem: HTMLElement;
  titulo: string;
  itens: ItemMenuDock[];
}

export function MenuDock({ alvo, aoFechar }: { alvo: AlvoMenuDock; aoFechar: (devolver?: boolean) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const trava = useRef(false);
  const [pilha, setPilha] = useState<{ titulo: string; itens: ItemMenuDock[] }[]>([]);
  const [confirmacao, setConfirmacao] = useState<ItemMenuDock | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [posicao, setPosicao] = useState({ left: 0, top: 0 });
  const reduzir = useReducedMotion();
  const pagina = pilha.at(-1) ?? alvo;
  const lista = confirmacao ? [
    { ...confirmacao, id: "confirmar", texto: T.dock.menu.confirmar, confirmar: false },
    { id: "cancelar", texto: T.dock.menu.cancelar, acao: () => setConfirmacao(null) },
  ] : pagina.itens;
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      const pai = el.parentElement!.getBoundingClientRect();
      const p = limitarMenu(alvo.x, alvo.y, r.width, r.height, window.innerWidth, window.innerHeight);
      setPosicao({ left: p.x - pai.left, top: p.y - pai.top });
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    window.addEventListener("resize", medir);
    return () => { observador.disconnect(); window.removeEventListener("resize", medir); };
  }, [alvo]);
  useEffect(() => {
    caixa.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [pilha, confirmacao]);
  useEffect(() => {
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) aoFechar(); };
    const blur = () => aoFechar();
    document.addEventListener("pointerdown", fora, true);
    window.addEventListener("blur", blur);
    return () => { document.removeEventListener("pointerdown", fora, true); window.removeEventListener("blur", blur); };
  }, [aoFechar]);
  const acionar = async (item: ItemMenuDock) => {
    if (trava.current || item.desativado) return;
    setErro("");
    if (item.itens) { setPilha((p) => [...p, { titulo: item.texto, itens: item.itens! }]); return; }
    if (item.confirmar) { setConfirmacao(item); return; }
    if (item.id === "cancelar") { setConfirmacao(null); return; }
    trava.current = true; setOcupado(true);
    try { await item.acao?.(); aoFechar(); }
    catch (e) { setErro(e instanceof Error ? e.message : T.dock.menu.falhou); }
    finally { trava.current = false; setOcupado(false); }
  };
  return <motion.div ref={caixa} className="dock-menu" style={posicao}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduzir ? 0 : 0.12 }}
    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }} onPointerMove={(e) => e.stopPropagation()}
    onKeyDown={(e) => {
      if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); aoFechar(true); return; }
      if (e.key === "ArrowLeft" && (confirmacao || pilha.length)) { e.preventDefault(); setConfirmacao(null); setPilha((p) => p.slice(0, -1)); return; }
      const botoes = [...caixa.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
      const atual = botoes.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const indice = e.key === "Home" ? 0 : e.key === "End" ? botoes.length - 1 : (atual + (e.key === "ArrowDown" ? 1 : -1) + botoes.length) % botoes.length;
        botoes[indice]?.focus();
      }
      if (e.key === "ArrowRight") { const item = lista.find((i) => i.id === (document.activeElement as HTMLElement)?.dataset.item); if (item?.itens) { e.preventDefault(); void acionar(item); } }
    }}>
    <div className="dock-menu-titulo">{confirmacao ? T.dock.menu.confirmarFechar : pagina.titulo}</div>
    <div role="menu" aria-label={pagina.titulo} aria-busy={ocupado}>
      {(pilha.length > 0 || confirmacao) && <button type="button" role="menuitem" disabled={ocupado} onClick={() => { if (confirmacao) setConfirmacao(null); else setPilha((p) => p.slice(0, -1)); setErro(""); }}>{T.janela.voltar}</button>}
      {lista.map((item) => <button key={item.id} data-item={item.id} type="button" role="menuitem" disabled={ocupado || item.desativado}
        data-perigo={item.perigo || undefined} title={item.texto} aria-haspopup={item.itens ? "menu" : undefined} onClick={() => void acionar(item)}>
        {item.icone ? <item.icone size={16} /> : <span className="dock-menu-espaco" />}
        <span className="dock-menu-texto">{item.texto}</span>
        {item.marcado && <Check size={14} aria-hidden="true" />}{item.itens && <ChevronRight size={14} aria-hidden="true" />}
      </button>)}
    </div>
    {erro && <p role="alert" className="dock-menu-erro">{erro}</p>}
  </motion.div>;
}
