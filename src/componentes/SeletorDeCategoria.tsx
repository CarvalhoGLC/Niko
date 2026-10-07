import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useFinancas } from "../estado/financas";
import { normalizarTexto } from "../utilitarios/basicos";
import { T } from "../textos/textos";
import type { Categoria } from "../tipos";

const CRIAR = "__criar";
const NOVA = "__nova";

interface Props {
  id?: string;
  tipo: Categoria["tipo"];
  categoriaId: string;
  novaCategoria?: string;
  aoMudar: (categoriaId: string, novaCategoria: string) => void;
  invalido?: boolean;
  className?: string;
}

/** Escolhe uma categoria existente ou digita o nome de uma nova, criada só quando o lançamento é salvo. */
export function SeletorDeCategoria({ id, tipo, categoriaId, novaCategoria = "", aoMudar, invalido, className = "seletor" }: Props) {
  const categorias = useFinancas((s) => s.categorias).filter((c) => c.tipo === tipo);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");

  useEffect(() => {
    if (!categoriaId && !novaCategoria && categorias.length === 0) setCriando(true);
  }, [categoriaId, novaCategoria, categorias.length]);

  const confirmarNome = () => {
    const limpo = nome.trim().slice(0, 40);
    if (!limpo) return;
    const existente = categorias.find((c) => normalizarTexto(c.nome) === normalizarTexto(limpo));
    aoMudar(existente?.id ?? "", existente ? "" : limpo);
    setCriando(false);
  };

  if (criando)
    return (
      <span className="seletor-categoria-nova">
        <input
          id={id}
          className={className === "seletor" ? "campo" : className}
          autoFocus
          maxLength={40}
          value={nome}
          placeholder={T.financas.nomeCategoria}
          aria-label={T.financas.nomeCategoria}
          aria-invalid={invalido}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              confirmarNome();
            }
            if (e.key === "Escape" && categorias.length > 0) {
              e.stopPropagation();
              setCriando(false);
            }
          }}
        />
        <button type="button" className="botao botao-fantasma botao-pequeno" aria-label={T.geral.confirmar} disabled={!nome.trim()} onClick={confirmarNome}>
          <Check size={13} />
        </button>
        {categorias.length > 0 && (
          <button type="button" className="botao botao-fantasma botao-pequeno" aria-label={T.geral.cancelar} onClick={() => setCriando(false)}>
            <X size={13} />
          </button>
        )}
      </span>
    );

  const valor = categorias.some((c) => c.id === categoriaId) ? categoriaId : novaCategoria ? NOVA : "";
  return (
    <select
      id={id}
      className={className}
      value={valor}
      aria-label={T.financas.categoria}
      aria-invalid={invalido}
      onChange={(e) => {
        const v = e.target.value;
        if (v === CRIAR) {
          setNome(novaCategoria);
          setCriando(true);
        } else if (v !== NOVA) aoMudar(v, "");
      }}
    >
      <option value="" disabled>{T.financas.escolhaCategoria}</option>
      {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      {novaCategoria && <option value={NOVA}>{T.chat.respostas.categoriaNova(novaCategoria)}</option>}
      <option value={CRIAR}>{T.financas.criarCategoriaOpcao}</option>
    </select>
  );
}
