import { BookOpen, CalendarDays, GraduationCap, Target, Wallet, type LucideIcon } from "lucide-react";
import { Alternador, Botao, Modal } from "../../componentes/basicos";
import { useConfig } from "../../estado/configuracoes";
import { FUNCOES, type Funcao } from "../../utilitarios/funcoes";
import { tocarSom } from "../../ponte/sons";
import { T } from "../../textos/textos";

const ICONE_FUNCAO: Record<Funcao, LucideIcon> = {
  journal: BookOpen,
  estudos: GraduationCap,
  financas: Wallet,
  metas: Target,
  calendario: CalendarDays,
};

export function PainelFuncoes({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const definir = useConfig((s) => s.definir);

  const alternar = (funcao: Funcao, ligar: boolean) => {
    definir({ funcoesDesligadas: ligar ? desligadas.filter((f) => f !== funcao) : [...desligadas, funcao] });
    void tocarSom(ligar ? "approve" : "close", "interface");
  };

  return (
    <Modal aberto={aberto} titulo={T.funcoes.titulo} aoFechar={aoFechar}>
      <p className="inicio-modal-dica">{T.funcoes.dica}</p>
      <div className="inicio-opcoes">
        {FUNCOES.map((f) => {
          const Icone = ICONE_FUNCAO[f];
          const ligada = !desligadas.includes(f);
          return (
            <div key={f} className="inicio-opcao inicio-opcao-funcao" data-desligada={!ligada || undefined}>
              <span className="inicio-opcao-icone"><Icone size={16} /></span>
              <span className="inicio-opcao-texto">
                <span className="inicio-opcao-titulo">
                  {T.funcoes.nomes[f]}
                  {!ligada && <span className="inicio-opcao-selo">{T.funcoes.desligada}</span>}
                </span>
                <span className="inicio-opcao-descricao">{T.funcoes.descricoes[f]}</span>
              </span>
              <Alternador ligado={ligada} rotulo={T.funcoes.nomes[f]} aoMudar={(v) => alternar(f, v)} />
            </div>
          );
        })}
      </div>
      <div className="formulario-acoes">
        <Botao variante="primario" onClick={aoFechar}>{T.inicio.pronto}</Botao>
      </div>
    </Modal>
  );
}
