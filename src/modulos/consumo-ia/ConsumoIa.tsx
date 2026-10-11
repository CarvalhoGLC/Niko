import { useCallback, useEffect, useState } from "react";
import { addDays } from "date-fns";
import { Gauge, TriangleAlert, RefreshCw, Clock, FolderOpen, Activity } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Botao, Vazio, AvisoFaixa } from "../../componentes/basicos";
import { Marca } from "../../marcas/Marca";
import { useComunicacao } from "../../estado/comunicacao";
import { useConfig } from "../../estado/configuracoes";
import { AGENTES } from "../../estado/agentes";
import { COR_AGENTE } from "../../personagens/cores";
import { T } from "../../textos/textos";
import { hojeISO, paraISO, horarioRelativo, formatar } from "../../utilitarios/datas";
import { somar } from "../../utilitarios/basicos";
import { lerConsumo, type Consumo } from "../../ponte/ponteLocal";
import { faltaPara, nivelDoUso, rotuloJanela } from "../../utilitarios/consumo";

const numero = new Intl.NumberFormat("pt-BR");
const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const dolar = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

function TituloParte({ numero: n, nome, children }: { numero: number; nome: string; children?: React.ReactNode }) {
  return (
    <div className="cons-parte">
      <h2 className="cons-parte-titulo">{T.consumo.parte(n, nome)}</h2>
      {children && <div className="cons-parte-acoes">{children}</div>}
    </div>
  );
}

function BarraHorizontal({ rotulo, valor, maximo, cor, texto }: { rotulo: string; valor: number; maximo: number; cor: string; texto: string }) {
  return (
    <div className="cons-barra-linha" title={`${rotulo}: ${numero.format(valor)}`}>
      <span className="cortar">{rotulo}</span>
      <span className="cons-barra-trilho"><span style={{ width: `${maximo > 0 ? (valor / maximo) * 100 : 0}%`, background: cor }} /></span>
      <span className="cons-barra-valor">{texto}</span>
    </div>
  );
}

function PlanosEsessao() {
  const cfg = useConfig((s) => s.consumo);
  const definir = useConfig((s) => s.definir);
  const [dados, setDados] = useState<Consumo | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const atualizar = useCallback(async (forcar = false) => {
    setCarregando(true);
    try {
      setDados(await lerConsumo(forcar));
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!cfg.lerPlanos) return;
    void atualizar();
    const t = window.setInterval(() => !document.hidden && void atualizar(), 5 * 60000);
    return () => window.clearInterval(t);
  }, [cfg.lerPlanos, atualizar]);

  const titulo = (
    <TituloParte numero={2} nome={T.consumo.parte2}>
      {dados && (
        <>
          <span className="cons-atualizado">{T.conexoes.atualizado(horarioRelativo(dados.atualizadoEm))}</span>
          <Botao pequeno icone={<RefreshCw size={12} className={carregando ? "girando" : ""} />} disabled={carregando} onClick={() => void atualizar(true)}>{T.janelaConexao.atualizar}</Botao>
        </>
      )}
    </TituloParte>
  );

  if (!cfg.lerPlanos)
    return (
      <>
        {titulo}
        <section className="cons-cartao cons-ligar">
          <AvisoFaixa tipo="alerta">
            <ul className="cons-aviso-lista">{T.consumo.parte2Aviso.map((a) => <li key={a}>{a}</li>)}</ul>
          </AvisoFaixa>
          <Botao variante="primario" onClick={() => definir({ consumo: { ...cfg, lerPlanos: true } })}>{T.consumo.ligarParte2}</Botao>
        </section>
      </>
    );

  if (erro && !dados)
    return (
      <>
        {titulo}
        <AvisoFaixa tipo="alerta">{T.consumo.ponteFora}</AvisoFaixa>
      </>
    );

  if (!dados)
    return (
      <>
        {titulo}
        <section className="cons-cartao"><p className="texto-3">{T.geral.carregando}</p></section>
      </>
    );

  const sessao = dados.sessao;
  return (
    <>
      {titulo}
      <section className="cons-planos">
        {dados.ferramentas.map((f) => (
          <div key={f.id} className="cons-cartao cons-plano">
            <div className="cons-plano-topo">
              <span className="cons-plano-nome">
                <Marca marca={f.id === "claude" ? "claudecode" : "codex"} tamanho={20} />
                <b>{f.nome}</b>
              </span>
              {f.plano && <span className="cons-chip">{f.plano}</span>}
            </div>
            {f.situacao === "ok" ? (
              <>
                {f.janelas.length === 0 && <p className="cons-dica">{T.consumo.semJanelas}</p>}
                {f.janelas.map((j) => (
                  <div key={j.id} className="cons-janela" data-nivel={nivelDoUso(j.usado)}>
                    <div className="cons-janela-topo">
                      <span>{rotuloJanela(j.rotulo)}</span>
                      <b>{T.consumo.usado(Math.round(j.usado))}</b>
                    </div>
                    <div className="cons-janela-trilho" role="progressbar" aria-label={rotuloJanela(j.rotulo)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(j.usado)}>
                      <span style={{ width: `${Math.min(100, Math.max(0, j.usado))}%` }} />
                    </div>
                    {j.reiniciaEm && <span className="cons-dica">{faltaPara(j.reiniciaEm)}</span>}
                  </div>
                ))}
              </>
            ) : (
              <p className="cons-dica">{T.consumo.situacoes[f.situacao]}{f.nota ? ` (${f.nota})` : ""}</p>
            )}
          </div>
        ))}
        {sessao && (
          <div className="cons-cartao cons-sessao">
            <div className="cons-plano-topo">
              <span className="cons-plano-nome">
                <Activity size={16} />
                <b>{T.consumo.sessaoClaude}</b>
              </span>
              <span className="cons-chip cons-chip-sucesso">{T.consumo.ativaHa(horarioRelativo(sessao.ultimaAtividade))}</span>
            </div>
            <div className="cons-sessao-info">
              <span className="cons-sessao-projeto"><FolderOpen size={13} /><span className="cortar">{sessao.projeto}</span></span>
              {sessao.modelo && <code>{sessao.modelo}</code>}
              {sessao.inicio && <span className="cons-sessao-projeto"><Clock size={12} />{T.consumo.iniciada(horarioRelativo(sessao.inicio))}</span>}
            </div>
            <div className="cons-sessao-numeros">
              {([
                [T.consumo.mensagens, sessao.mensagens],
                [T.consumo.entrada, sessao.entrada],
                [T.consumo.saida, sessao.saida],
                [T.consumo.cacheLido, sessao.cacheLido],
                [T.consumo.cacheCriado, sessao.cacheCriado],
              ] as const).map(([rotulo, valor]) => (
                <div key={rotulo} className="cons-sessao-numero" title={numero.format(valor)}>
                  <span className="cons-numero-medio">{compacto.format(valor)}</span>
                  <span className="cons-legenda">{rotulo}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

export default function ConsumoIa() {
  const uso = useComunicacao((s) => s.usoIa);
  const definirUso = useComunicacao((s) => s.definirUsoIa);
  const consumo = useConfig((s) => s.consumo);
  const nomes = useConfig((s) => s.agentes.nomes);
  const mes = hojeISO().slice(0, 7);
  const doMes = uso.filter((u) => u.data.startsWith(mes));
  const temPreco = consumo.precoEntrada + consumo.precoSaida > 0;
  const custo = somar(doMes, (u) => (u.entrada * consumo.precoEntrada + u.saida * consumo.precoSaida) / 1e6);
  const p = consumo.limiteMensal > 0 ? custo / consumo.limiteMensal : 0;
  const totalTokens = (l: typeof uso) => somar(l, (u) => u.entrada + u.saida);
  const porModelo = new Map<string, typeof uso>();
  for (const u of doMes) porModelo.set(`${u.provedor} · ${u.modelo}`, [...(porModelo.get(`${u.provedor} · ${u.modelo}`) ?? []), u]);
  const modelos = [...porModelo].map(([rotulo, l]) => ({ rotulo, valor: totalTokens(l) })).sort((a, b) => b.valor - a.valor);
  const agentes = AGENTES.map((a) => ({ id: a, rotulo: nomes[a], valor: totalTokens(doMes.filter((u) => u.agenteId === a)) }));
  const maiorModelo = Math.max(0, ...modelos.map((m) => m.valor));
  const maiorAgente = Math.max(0, ...agentes.map((a) => a.valor));
  const dias = Array.from({ length: 30 }, (_, i) => paraISO(addDays(new Date(), i - 29))).map((d) => ({ dia: d, valor: totalTokens(uso.filter((u) => u.data === d)) }));
  const maiorDia = Math.max(1, ...dias.map((d) => d.valor));
  const entrada = somar(doMes, (u) => u.entrada);
  const saida = somar(doMes, (u) => u.saida);
  const nivelLimite = p >= 1 ? "erro" : p >= 0.8 ? "alerta" : "sucesso";

  return (
    <>
      <CabecalhoAba titulo={T.rotas.consumo} subtitulo={T.consumo.subtitulo} />
      <TituloParte numero={1} nome={T.consumo.parte1}>
        {uso.length > 0 && <Botao pequeno variante="fantasma" onClick={() => definirUso([])}>{T.consumo.limparDemo}</Botao>}
      </TituloParte>
      {uso.length === 0 ? (
        <section className="cons-cartao">
          <Vazio icone={<Gauge size={28} />} titulo={T.consumo.semUso} texto={T.consumo.semUsoDica} />
        </section>
      ) : (
        <>
          <section className="bento cons-numeros">
            <div className="cons-numero" title={numero.format(entrada)}><span className="cons-numero-grande">{compacto.format(entrada)}</span><span className="cons-legenda">{T.consumo.entrada}</span></div>
            <div className="cons-numero" title={numero.format(saida)}><span className="cons-numero-grande">{compacto.format(saida)}</span><span className="cons-legenda">{T.consumo.saida}</span></div>
            <div className="cons-numero"><span className="cons-numero-grande">{numero.format(doMes.length)}</span><span className="cons-legenda">{T.consumo.mensagens}</span></div>
            <div className="cons-numero"><span className="cons-numero-grande cons-numero-destaque">{temPreco ? dolar.format(custo) : "--"}</span><span className="cons-legenda">{T.consumo.custo}</span></div>
          </section>
          <section className="bento cons-detalhes">
            <div className="cons-bloco cons-bloco-largo">
              <div className="cons-bloco-cabecalho">
                <span className="cons-bloco-titulo">{T.consumo.porDia}</span>
                <span className="tracejado" />
              </div>
              <div className="cons-colunas" role="img" aria-label={T.consumo.porDia}>
                {dias.map((d, i) => (
                  <span key={d.dia} className="cons-coluna" data-hoje={i === dias.length - 1 ? "sim" : "nao"} title={T.consumo.diaTokens(formatar(d.dia, "d/MM"), numero.format(d.valor))} style={{ height: `${Math.max(3, (d.valor / maiorDia) * 100)}%` }} />
                ))}
              </div>
            </div>
            <div className="cons-bloco">
              <span className="cons-bloco-titulo">{T.consumo.porAgente}</span>
              {agentes.map((a) => <BarraHorizontal key={a.id} rotulo={a.rotulo} valor={a.valor} maximo={maiorAgente} cor={COR_AGENTE[a.id]} texto={compacto.format(a.valor)} />)}
            </div>
            <div className="cons-bloco">
              <span className="cons-bloco-titulo">{T.consumo.porModelo}</span>
              {modelos.length === 0 ? <p className="cons-dica">{T.consumo.semUso}</p> : modelos.map((m) => <BarraHorizontal key={m.rotulo} rotulo={m.rotulo} valor={m.valor} maximo={maiorModelo} cor="var(--texto-2)" texto={compacto.format(m.valor)} />)}
            </div>
            <div className="cons-bloco cons-limite" data-nivel={nivelLimite}>
              <span className="cons-bloco-titulo">{T.consumo.limite}</span>
              {!temPreco ? (
                <p className="cons-dica">{T.consumo.semPreco}</p>
              ) : (
                <>
                  <div className="cons-limite-valor">
                    <span className="cons-numero-medio">{T.consumo.usado(Math.round(p * 100))}</span>
                    <span className="cons-dica">{T.consumo.limiteDe(dolar.format(consumo.limiteMensal))}</span>
                  </div>
                  <div className="cons-limite-trilho" role="progressbar" aria-label={T.consumo.limite} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
                    <span className="cons-limite-cheio" style={{ width: `${Math.min(100, p * 100)}%` }} />
                    <span className="cons-limite-marca" />
                  </div>
                  <span className="cons-dica">{T.consumo.limiteDica}</span>
                  {p >= 0.8 && <AvisoFaixa tipo={p >= 1 ? "erro" : "alerta"}><span className="linha"><TriangleAlert size={13} />{T.consumo.pertoLimite(Math.round(p * 100))}</span></AvisoFaixa>}
                </>
              )}
            </div>
          </section>
        </>
      )}
      <PlanosEsessao />
    </>
  );
}
