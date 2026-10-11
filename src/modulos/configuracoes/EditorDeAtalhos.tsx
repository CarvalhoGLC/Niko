import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Botao } from "../../componentes/basicos";
import { useConfig } from "../../estado/configuracoes";
import { pausarAtalhosGlobais, useSituacaoDosAtalhos } from "../../desktop/usarAtalhosGlobais";
import { ACOES_GLOBAIS, ATALHOS_PADRAO, formatarTeclas, teclasDoEvento, type AcaoGlobal } from "../../utilitarios/atalhos";
import { T } from "../../textos/textos";
import { GrupoAjuste, LinhaAjuste, Teclas } from "./LinhaAjuste";

const A = T.configuracoes.atalhosGlobais;
const SO_MODIFICADORES = new Set(["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"]);

export function EditorDeAtalhos() {
  const atalhos = useConfig((s) => s.atalhosGlobais);
  const definir = useConfig((s) => s.definir);
  const situacoes = useSituacaoDosAtalhos((s) => s.situacoes);
  const [gravando, setGravando] = useState<AcaoGlobal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const mudar = (acao: AcaoGlobal, teclas: string) => definir({ atalhosGlobais: { ...useConfig.getState().atalhosGlobais, [acao]: teclas } });

  useEffect(() => {
    if (!gravando) return;
    void pausarAtalhosGlobais(true);
    return () => void pausarAtalhosGlobais(false);
  }, [gravando]);

  useEffect(() => {
    if (!gravando) return;
    const aoTeclar = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setGravando(null);
        setAviso(null);
        return;
      }
      if (SO_MODIFICADORES.has(e.code)) return;
      const teclas = teclasDoEvento(e);
      if (!teclas) {
        setAviso(A.precisaModificador);
        return;
      }
      setAviso(null);
      setGravando(null);
      mudar(gravando, teclas);
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [gravando]);

  return (
    <>
      <GrupoAjuste
        titulo={A.titulo}
        acoes={
          <Botao pequeno variante="fantasma" icone={<RotateCcw size={12} />} onClick={() => definir({ atalhosGlobais: ATALHOS_PADRAO })}>
            {A.restaurar}
          </Botao>
        }
      />
      <div role="list" aria-label={A.titulo}>
        {ACOES_GLOBAIS.map((acao) => {
          const teclas = atalhos[acao];
          const situacao = situacoes[acao];
          const problema = situacao ? A.situacoes[situacao] : "";
          const emGravacao = gravando === acao;
          const dica = emGravacao && aviso ? aviso : !emGravacao && problema ? <span className="ajuste-dica-erro" role="alert">{problema}</span> : undefined;
          return (
            <div key={acao} role="listitem">
              <LinhaAjuste rotulo={A.acoes[acao]} dica={dica}>
                {emGravacao ? (
                  <kbd className="tecla tecla-alta ajuste-gravando">{A.gravando}</kbd>
                ) : teclas ? (
                  <Teclas teclas={formatarTeclas(teclas)} />
                ) : (
                  <span className="ajuste-desligado">{A.desligado}</span>
                )}
                {emGravacao ? (
                  <Botao pequeno variante="fantasma" onClick={() => setGravando(null)}>
                    {A.cancelar}
                  </Botao>
                ) : (
                  <>
                    <Botao pequeno variante="fantasma" onClick={() => setGravando(acao)}>
                      {A.mudar}
                    </Botao>
                    {teclas && (
                      <Botao pequeno variante="fantasma" onClick={() => mudar(acao, "")}>
                        {A.desligar}
                      </Botao>
                    )}
                  </>
                )}
              </LinhaAjuste>
            </div>
          );
        })}
      </div>
    </>
  );
}
