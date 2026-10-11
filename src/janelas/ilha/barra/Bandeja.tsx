import { useState } from "react";
import { motion } from "motion/react";
import { AppWindow, FolderOpen, Power } from "lucide-react";
import { useIlha } from "../../../estado/ilha";
import { useControleRapido, usarBandeja } from "../../../estado/controleRapido";
import { controle, type ItemDaBandeja } from "../../../ponte/ponteLocal";
import { tocarSom } from "../../../ponte/sons";
import { T } from "../../../textos/textos";

const B = T.ilha.barra;
const INTERVALO_DA_BANDEJA_MS = 5000;

type Menu = { item: ItemDaBandeja; confirmando: boolean } | null;

export function Bandeja({ topo, direita, aoFechar }: { topo: number; direita: number; aoFechar: () => void }) {
  const itens = useControleRapido((s) => s.bandeja);
  const lida = useControleRapido((s) => s.bandejaLida);
  const sincronizar = useControleRapido((s) => s.lerBandeja);
  const [menu, setMenu] = useState<Menu>(null);
  usarBandeja(true, INTERVALO_DA_BANDEJA_MS);

  const falhar = (item: ItemDaBandeja) => (e: Error) => useIlha.getState().avisarFalha(e.message === "sem_janela" ? B.bandejaSemJanela(item.nome) : e.message === "app_do_windows" ? B.bandejaDoWindows : B.bandejaIndisponivel);

  const abrir = (item: ItemDaBandeja) => {
    void tocarSom("blip");
    aoFechar();
    void controle.abrirDaBandeja(item.caminho).catch(falhar(item));
  };

  const mostrarNaPasta = (item: ItemDaBandeja) => {
    void tocarSom("blip");
    aoFechar();
    void controle.pastaDaBandeja(item.caminho).catch(falhar(item));
  };

  const encerrar = (item: ItemDaBandeja) => {
    void tocarSom("close");
    setMenu(null);
    void controle.encerrarDaBandeja(item.caminho).then(() => window.setTimeout(() => void sincronizar(), 600), falhar(item));
  };

  return (
    <motion.div
      className="ilha-pop ilha-bandeja"
      style={{ top: topo, right: direita }}
      role="dialog"
      aria-label={B.bandeja}
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.1 } }}
      transition={{ type: "spring", visualDuration: 0.24, bounce: 0.15 }}
    >
      {itens.length > 0 ? (
        <div className="ilha-bandeja-grade">
          {itens.map((item) => (
            <button
              key={item.caminho}
              type="button"
              className="ilha-bandeja-item"
              data-ativo={menu?.item.caminho === item.caminho || undefined}
              aria-label={B.abrirDaBandeja(item.nome)}
              aria-haspopup="menu"
              title={item.dica && item.dica !== item.nome ? `${item.nome}\n${item.dica}` : item.nome}
              onClick={() => abrir(item)}
              onContextMenu={(e) => {
                e.preventDefault();
                void tocarSom("open");
                setMenu({ item, confirmando: false });
              }}
              onKeyDown={(e) => {
                if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                  e.preventDefault();
                  setMenu({ item, confirmando: false });
                }
              }}
            >
              {item.icone ? <img src={item.icone} alt="" width={16} height={16} draggable={false} /> : <span className="ilha-bandeja-letra">{item.nome.trim()[0]?.toUpperCase() ?? "?"}</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="ilha-rapido-vazio">{lida ? B.bandejaVazia : B.lendoBandeja}</p>
      )}
      {menu && (
        <div className="ilha-bandeja-menu" role="menu" aria-label={menu.item.nome} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setMenu(null))}>
          <span className="ilha-bandeja-menu-nome cortar">{menu.item.nome}</span>
          {menu.confirmando ? (
            <>
              <p className="ilha-bandeja-menu-aviso">{B.bandejaConfirmarEncerrar(menu.item.nome)}</p>
              <div className="ilha-bandeja-menu-botoes">
                <button type="button" className="ilha-rapido-texto" autoFocus onClick={() => setMenu({ ...menu, confirmando: false })}>{T.geral.cancelar}</button>
                <button type="button" className="ilha-rapido-texto ilha-bandeja-perigo" onClick={() => encerrar(menu.item)}>{B.bandejaEncerrar}</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" className="ilha-rapido-texto" autoFocus onClick={() => abrir(menu.item)}><AppWindow size={14} />{B.bandejaAbrir}</button>
              <button type="button" role="menuitem" className="ilha-rapido-texto" onClick={() => mostrarNaPasta(menu.item)}><FolderOpen size={14} />{B.bandejaPasta}</button>
              <button type="button" role="menuitem" className="ilha-rapido-texto ilha-bandeja-perigo" onClick={() => setMenu({ ...menu, confirmando: true })}><Power size={14} />{B.bandejaEncerrar}</button>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
