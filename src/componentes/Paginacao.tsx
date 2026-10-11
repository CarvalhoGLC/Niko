import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { T } from "../textos/textos";

export function usarPaginacao<I>(itens: I[], porPagina: number, reiniciarQuando: unknown = null) {
  const [pagina, setPagina] = useState(1);
  const total = Math.max(1, Math.ceil(itens.length / porPagina));

  useEffect(() => {
    setPagina(1);
  }, [reiniciarQuando]);

  const atual = Math.min(pagina, total);
  const visiveis = useMemo(() => itens.slice((atual - 1) * porPagina, atual * porPagina), [itens, atual, porPagina]);

  return { visiveis, pagina: atual, totalDePaginas: total, totalDeItens: itens.length, porPagina, irPara: setPagina };
}

function numerosVisiveis(atual: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const lista: (number | "...")[] = [1];
  const inicio = Math.max(2, atual - 1);
  const fim = Math.min(total - 1, atual + 1);
  if (inicio > 2) lista.push("...");
  for (let n = inicio; n <= fim; n++) lista.push(n);
  if (fim < total - 1) lista.push("...");
  lista.push(total);
  return lista;
}

interface Props {
  pagina: number;
  totalDePaginas: number;
  totalDeItens: number;
  porPagina: number;
  irPara: (pagina: number) => void;
}

export function Paginacao({ pagina, totalDePaginas, totalDeItens, porPagina, irPara }: Props) {
  if (totalDePaginas <= 1) return null;
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(totalDeItens, pagina * porPagina);
  return (
    <nav className="paginacao" aria-label={T.paginacao.rotulo}>
      <span className="paginacao-resumo">{T.paginacao.resumo(de, ate, totalDeItens)}</span>
      <div className="paginacao-botoes">
        <button type="button" className="paginacao-botao" aria-label={T.paginacao.anterior} title={T.paginacao.anterior} disabled={pagina === 1} onClick={() => irPara(pagina - 1)}>
          <ChevronLeft size={14} />
        </button>
        {numerosVisiveis(pagina, totalDePaginas).map((n, i) =>
          n === "..." ? (
            <span key={`r${i}`} className="paginacao-reticencias" aria-hidden="true">...</span>
          ) : (
            <button key={n} type="button" className="paginacao-botao" aria-label={T.paginacao.pagina(n)} aria-current={n === pagina ? "page" : undefined} onClick={() => irPara(n)}>
              {n}
            </button>
          ),
        )}
        <button type="button" className="paginacao-botao" aria-label={T.paginacao.proxima} title={T.paginacao.proxima} disabled={pagina === totalDePaginas} onClick={() => irPara(pagina + 1)}>
          <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  );
}
