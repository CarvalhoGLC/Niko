import { ArrowDown, ArrowUp, RotateCcw, X } from "lucide-react";
import { Botao, Segmentado } from "../../componentes/basicos";
import { useConfig } from "../../estado/configuracoes";
import { ASSISTIVE_PADRAO, moverAtalho } from "../../janelas/assistive/regras";
import { T } from "../../textos/textos";
import { AlternadorAjuste, FaixaAjuste, GrupoAjuste, LinhaAjuste, NotaAjuste } from "./LinhaAjuste";

export function SecaoAssistive() {
  const cfg = useConfig((s) => s.assistive);
  const definir = useConfig((s) => s.definirAssistive);
  const C = T.assistive;
  const percentual = Math.round(cfg.opacidade * 100);
  return (
    <>
      <NotaAjuste>
        <p className="ajuste-nota-texto">{C.dicaConfiguracao}</p>
      </NotaAjuste>
      <AlternadorAjuste rotulo={C.ativar} ligado={cfg.ativo} aoMudar={(ativo) => definir({ ativo })} />
      <AlternadorAjuste rotulo={C.fixar} ligado={cfg.fixado} aoMudar={(fixado) => definir({ fixado })} />
      <LinhaAjuste rotulo={C.origemCor}>
        <Segmentado<"ilha" | "dock">
          rotulo={C.origemCor}
          valor={cfg.origemCor}
          aoMudar={(origemCor) => definir({ origemCor })}
          opcoes={[
            { valor: "ilha", rotulo: C.ilha },
            { valor: "dock", rotulo: C.dock },
          ]}
        />
      </LinhaAjuste>
      <LinhaAjuste rotulo={C.opacidade} para="assistive-opacidade" esticar>
        <FaixaAjuste id="assistive-opacidade" rotulo={C.opacidade} valor={cfg.opacidade} min={0.3} max={1} passo={0.05} texto={`${percentual}%`} aoMudar={(opacidade) => definir({ opacidade })} />
      </LinhaAjuste>
      <LinhaAjuste rotulo={T.configuracoes.posicao}>
        <Botao icone={<RotateCcw size={13} />} onClick={() => definir({ posicao: { ...ASSISTIVE_PADRAO.posicao } })}>
          {C.restaurarPosicao}
        </Botao>
      </LinhaAjuste>
      {cfg.apps.length > 0 && (
        <>
          <GrupoAjuste titulo={C.editar} />
          {cfg.apps.map((app, i) => (
            <LinhaAjuste key={app.id} rotulo={app.nome}>
              <Botao pequeno variante="fantasma" soIcone icone={<ArrowUp size={14} />} aria-label={C.anterior(app.nome)} disabled={i === 0} onClick={() => definir({ apps: moverAtalho(useConfig.getState().assistive.apps, app.id, -1) })} />
              <Botao pequeno variante="fantasma" soIcone icone={<ArrowDown size={14} />} aria-label={C.proximo(app.nome)} disabled={i === cfg.apps.length - 1} onClick={() => definir({ apps: moverAtalho(useConfig.getState().assistive.apps, app.id, 1) })} />
              <Botao pequeno variante="fantasma" soIcone icone={<X size={14} />} aria-label={C.remover(app.nome)} onClick={() => definir({ apps: useConfig.getState().assistive.apps.filter((a) => a.id !== app.id) })} />
            </LinhaAjuste>
          ))}
        </>
      )}
    </>
  );
}
