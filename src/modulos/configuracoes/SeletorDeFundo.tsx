import { FUNDO_PADRAO_DAS_BORDAS, useConfig } from "../../estado/configuracoes";
import { DESTAQUE_PADRAO } from "../../janelas/area-de-trabalho/usarTema";
import { FUNDO_DESTAQUE, hexValido, misturar } from "../../utilitarios/cores";
import { T } from "../../textos/textos";
import { FaixaAjuste, LinhaAjuste } from "./LinhaAjuste";

export const FUNDOS_PRONTOS = [
  { valor: FUNDO_PADRAO_DAS_BORDAS, rotulo: T.configuracoes.fundosProntos.grafite },
  { valor: "#000000", rotulo: T.configuracoes.fundosProntos.preto },
  { valor: "#1d2738", rotulo: T.configuracoes.fundosProntos.noite },
  { valor: "#f4f5f7", rotulo: T.configuracoes.fundosProntos.branco },
];

interface PropsSeletorDeFundo {
  id: string;
  fundo: string;
  opacidade: number;
  aoMudar: (mudanca: { fundo?: string; opacidade?: number }) => void;
}

export function SeletorDeFundo({ id, fundo, opacidade, aoMudar }: PropsSeletorDeFundo) {
  const destaque = useConfig((s) => s.destaque);
  const corDoDestaque = destaque && hexValido(destaque) ? destaque : DESTAQUE_PADRAO.escuro;
  const amostra = (valor: string) => (valor === FUNDO_DESTAQUE ? misturar(corDoDestaque, "#000000", 0.82) : valor);
  const pronto = FUNDOS_PRONTOS.some((f) => f.valor === fundo);
  const percentual = Math.round(opacidade * 100);

  return (
    <>
      <LinhaAjuste rotulo={T.configuracoes.corDeFundo} dica={T.configuracoes.textoAutomatico}>
        <div className="pilulas" role="group" aria-label={T.configuracoes.corDeFundo}>
          {FUNDOS_PRONTOS.map((f) => (
            <button key={f.valor} type="button" className="pilula" aria-pressed={fundo === f.valor} onClick={() => aoMudar({ fundo: f.valor })}>
              <span className="ajuste-ponto-cor" style={{ background: amostra(f.valor) }} />
              {f.rotulo}
            </button>
          ))}
          <label className="pilula" aria-pressed={!pronto} htmlFor={`${id}-cor`}>
            <input
              id={`${id}-cor`}
              type="color"
              className="ajuste-cor-mini"
              value={hexValido(fundo) ? fundo : amostra(fundo)}
              aria-label={T.configuracoes.outraCor}
              onChange={(e) => aoMudar({ fundo: e.target.value })}
            />
            {T.configuracoes.outraCor}
          </label>
        </div>
      </LinhaAjuste>
      <LinhaAjuste rotulo={T.configuracoes.opacidade} para={`${id}-opacidade`} esticar>
        <FaixaAjuste
          id={`${id}-opacidade`}
          rotulo={T.configuracoes.opacidade}
          valor={percentual}
          min={30}
          max={100}
          passo={5}
          texto={T.configuracoes.opacidadeValor(percentual)}
          aoMudar={(v) => aoMudar({ opacidade: v / 100 })}
        />
      </LinhaAjuste>
    </>
  );
}
