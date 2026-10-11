import { Trophy, Lock } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { AvisoFaixa } from "../../componentes/basicos";
import { MapaDeCalor } from "../../componentes/MapaDeCalor";
import { Personagem } from "../../personagens/Personagem";
import { useConquistas, CONQUISTAS } from "../../estado/conquistas";
import { useConfig } from "../../estado/configuracoes";
import { T } from "../../textos/textos";
import { formatar, diaDoMomento } from "../../utilitarios/datas";
import { conquistaLigada } from "../../utilitarios/funcoes";

export default function Conquistas() {
  const alcancadas = useConquistas((s) => s.alcancadas);
  const ativas = useConfig((s) => s.conquistasAtivas);
  const nomes = useConfig((s) => s.agentes.nomes);
  const desligadas = useConfig((s) => s.funcoesDesligadas);

  const ligadas = CONQUISTAS.filter((c) => conquistaLigada(c.codigo, desligadas));
  const comAlcance = ligadas.map((c) => ({ c, a: alcancadas.find((x) => x.codigo === c.codigo) }));
  const feitas = comAlcance.filter((x) => x.a);
  const bloqueadas = comAlcance.filter((x) => !x.a);

  return (
    <>
      <CabecalhoAba titulo={T.conquistas.titulo} subtitulo={T.conquistas.subtitulo} />
      {!ativas && <AvisoFaixa tipo="alerta">{T.conquistas.desligadas}</AvisoFaixa>}
      <section className="conquistas-mapa" aria-label={T.conquistas.mapa}>
        <span className="secao-titulo conquistas-mapa-titulo">{T.conquistas.mapa}</span>
        <MapaDeCalor />
      </section>
      {feitas.length > 0 && (
        <section className="conquistas-secao">
          <h2 className="secao-titulo">{T.conquistas.alcancadas}</h2>
          <div className="conquistas-grade">
            {feitas.map(({ c, a }) => {
              const item = T.conquistas.itens[c.codigo];
              const alcancado = a!.nivel;
              const nivelAtual = c.niveis.filter((n) => n <= alcancado).length;
              const proximo = c.niveis.find((n) => n > alcancado);
              return (
                <article key={c.codigo} className="conquistas-cartao" data-alcancada="sim">
                  <span className="conquistas-icone"><Trophy size={18} /></span>
                  <span className="conquistas-texto">
                    <span className="conquistas-topo">
                      <b className="conquistas-nome cortar">{item.nome}</b>
                      <span className="conquistas-nivel">{c.niveis.length > 1 ? T.conquistas.nivel(nivelAtual) : T.conquistas.unico}</span>
                    </span>
                    <span className="conquistas-regra">{item.regra}</span>
                    {c.niveis.length > 1 && (
                      <span className="conquistas-niveis" aria-hidden="true">
                        {c.niveis.map((n) => <span key={n} data-feito={n <= alcancado || undefined} />)}
                      </span>
                    )}
                    <span className="conquistas-detalhe">
                      {[nomes[c.agente], formatar(diaDoMomento(a!.data), "dd/MM/yyyy"), proximo ? T.conquistas.proximoNivel(proximo) : ""].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="conquistas-personagem">
                    <Personagem agente={c.agente} tamanho={32} estado="sucesso" halo={false} />
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {bloqueadas.length > 0 && (
        <section className="conquistas-secao">
          <h2 className="secao-titulo conquistas-titulo-apagado">{T.conquistas.bloqueadas}</h2>
          <div className="conquistas-grade">
            {bloqueadas.map(({ c }) => {
              const item = T.conquistas.itens[c.codigo];
              return (
                <article key={c.codigo} className="conquistas-cartao" data-alcancada="nao">
                  <span className="conquistas-icone"><Lock size={16} /></span>
                  <span className="conquistas-texto">
                    <b className="conquistas-nome">{item.nome}</b>
                    <span className="conquistas-regra">{item.regra}</span>
                    <span className="conquistas-detalhe">{nomes[c.agente]}</span>
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
