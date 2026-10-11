import { useMemo } from "react";
import { Code2 } from "lucide-react";
import { claudeCode } from "../../../ponte/claudeCode";
import { useIlha } from "../../../estado/ilha";
import { linhasDoDiff, type AlteracaoDeArquivo, type LinhaDoDiff } from "../../../utilitarios/diff";
import { T } from "../../../textos/textos";

const C = T.ilha.claude;

function nomeCurto(caminho: string) {
  const partes = caminho.split(/[\\/]+/).filter(Boolean);
  return partes.slice(-2).join("/");
}

function abrirArquivo(cwd: string, arquivo: string) {
  claudeCode.abrirArquivo(cwd, arquivo).catch((e: Error) => {
    useIlha.getState().revelar({ texto: C.abrirFalhou[e.message] ?? C.abrirFalhou.outro, tipo: "alerta", marca: "claudecode", aba: "claude" }, 4500);
  });
}

export function DiffCompacto({ alteracao, maximo = 60, cwd }: { alteracao: AlteracaoDeArquivo; maximo?: number; cwd?: string }) {
  const { linhas, mais, menos } = useMemo(() => {
    const todas: (LinhaDoDiff | { tipo: "separador"; texto: string })[] = [];
    let somaMais = 0;
    let somaMenos = 0;
    alteracao.trechos.forEach((t, i) => {
      if (i > 0) todas.push({ tipo: "separador", texto: "" });
      for (const l of linhasDoDiff(t.antes, t.depois)) {
        if (l.tipo === "mais") somaMais++;
        if (l.tipo === "menos") somaMenos++;
        todas.push(l);
      }
    });
    return { linhas: todas, mais: somaMais, menos: somaMenos };
  }, [alteracao]);
  const visiveis = linhas.slice(0, maximo);

  return (
    <div className="vsc-diff">
      <div className="vsc-diff-topo">
        <span className="vsc-diff-arquivo" title={alteracao.arquivo}>{nomeCurto(alteracao.arquivo)}</span>
        {alteracao.novo && <span className="vsc-chip">{C.arquivoNovo}</span>}
        <span className="vsc-diff-mais">+{mais}</span>
        <span className="vsc-diff-menos">-{menos}</span>
        {cwd && (
          <button type="button" className="vsc-icone-botao vsc-diff-abrir" aria-label={C.abrirArquivo} title={C.abrirArquivo} onClick={() => abrirArquivo(cwd, alteracao.arquivo)}>
            <Code2 size={12} />
          </button>
        )}
      </div>
      <div className="vsc-diff-corpo">
        {visiveis.map((l, i) =>
          l.tipo === "separador" ? (
            <div key={i} className="vsc-diff-separador" />
          ) : (
            <div key={i} className="vsc-diff-linha" data-tipo={l.tipo}>
              <span className="vsc-diff-sinal">{l.tipo === "mais" ? "+" : l.tipo === "menos" ? "-" : " "}</span>
              <span className="vsc-diff-texto">{l.texto || " "}</span>
            </div>
          ),
        )}
        {linhas.length > maximo && <div className="vsc-diff-mais-linhas">{C.maisLinhas(linhas.length - maximo)}</div>}
      </div>
    </div>
  );
}
