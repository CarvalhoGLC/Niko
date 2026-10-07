import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths, format, setDate, getDaysInMonth } from "date-fns";
import {
  Plus, Trash2, Pencil, Upload, Download, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Wallet, CreditCard, PiggyBank, Banknote, Landmark, Repeat,
  Target, Users, ShoppingCart, BarChart3, LayoutDashboard, Sparkles, X, Check, Scale, ListFilter, Tags,
} from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Campo, Modal, Segmentado, Vazio, ConfirmarModal, Progresso, AvisoFaixa, CaixaMarcar, LinhaAlternador } from "../../componentes/basicos";
import { BarrasHorizontais, BarrasVerticais } from "../../componentes/Graficos";
import {
  useFinancas, saldoDaConta, gastoPorCategoria, receitasDoMes, gastosDoMes, parteDoUsuario, saldosComPessoas, simplificarDividas, dataDeCaixa, EU, CORES_CATEGORIA, geradoAteInicial,
} from "../../estado/financas";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { useAgentes } from "../../estado/agentes";
import { T } from "../../textos/textos";
import { formatarDinheiro, lerValorEmCentavos, centavosParaCampo } from "../../utilitarios/dinheiro";
import { dataValida, formatar, hojeISO, paraISO, deISO, formatarData } from "../../utilitarios/datas";
import { baixarArquivo, contem, lerArquivoTexto, normalizarTexto, somar } from "../../utilitarios/basicos";
import { detectarAssinaturas, assinaturasComValorNovo, lerCsv, lerOfx } from "../../utilitarios/assinaturas";
import { tocarSom } from "../../ponte/sons";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import { SeletorDeCategoria } from "../../componentes/SeletorDeCategoria";
import { categoriaPelaDescricao } from "../../utilitarios/comandos";
import type { Conta, TipoConta, TipoTransacao, Transacao } from "../../tipos";

type Aba = keyof typeof T.financas.abas;
type Modo = "competencia" | "caixa";

const GRUPOS_ABA: { nome: string; abas: Aba[] }[] = [
  { nome: T.financas.grupos.visao, abas: ["visao", "relatorios"] },
  { nome: T.financas.grupos.movimento, abas: ["transacoes", "contas", "cartoes"] },
  { nome: T.financas.grupos.planejamento, abas: ["orcamento", "recorrentes", "economia"] },
  { nome: T.financas.grupos.pessoas, abas: ["divisao", "compras"] },
];

const ICONE_ABA: Record<Aba, React.ReactNode> = {
  visao: <LayoutDashboard size={14} />,
  transacoes: <ListFilter size={14} />,
  contas: <Landmark size={14} />,
  cartoes: <CreditCard size={14} />,
  orcamento: <Scale size={14} />,
  recorrentes: <Repeat size={14} />,
  economia: <PiggyBank size={14} />,
  divisao: <Users size={14} />,
  compras: <ShoppingCart size={14} />,
  relatorios: <BarChart3 size={14} />,
};

const ICONE_CONTA: Record<TipoConta, React.ReactNode> = {
  corrente: <Landmark size={16} />,
  poupanca: <PiggyBank size={16} />,
  carteira: <Banknote size={16} />,
  cartao: <CreditCard size={16} />,
  investimento: <BarChart3 size={16} />,
};

const CORES = ["#3b6fe0", "#2f9e6b", "#d9922b", "#8a05be", "#e05a8a", "#0ea5a4", "#64748b"];

function CampoDinheiro({ id, rotulo, valor, aoMudar, erro, obrigatorio, dica }: { id: string; rotulo: string; valor: string; aoMudar: (v: string) => void; erro?: string; obrigatorio?: boolean; dica?: string }) {
  return (
    <Campo id={id} rotulo={rotulo} erro={erro} obrigatorio={obrigatorio} dica={dica}>
      <div className="campo-prefixo">
        <span>R$</span>
        <input id={id} className="campo" inputMode="decimal" value={valor} placeholder="0,00" aria-invalid={!!erro} onChange={(e) => aoMudar(e.target.value.replace(/[^\d.,]/g, ""))} />
      </div>
    </Campo>
  );
}

function validarValor(texto: string, permitirZero = false): { valor: number | null; erro?: string } {
  const v = lerValorEmCentavos(texto);
  if (v == null) return { valor: null, erro: texto.trim() ? T.validacao.valorInvalido : T.validacao.obrigatorio };
  if (v < 0 || (!permitirZero && v === 0)) return { valor: null, erro: T.validacao.valorPositivo };
  if (v > 100000000000) return { valor: null, erro: T.validacao.valorInvalido };
  return { valor: v };
}

function FormTransacao({ aberto, aoFechar, editando }: { aberto: boolean; aoFechar: () => void; editando?: Transacao | null }) {
  const fin = useFinancas();
  const contas = fin.contas.filter((c) => !c.arquivada);
  const [tipo, setTipo] = useState<TipoTransacao>("despesa");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [contaId, setContaId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [data, setData] = useState(hojeISO());
  const [parcelas, setParcelas] = useState("1");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setNovaCategoria("");
    if (editando) {
      setTipo(editando.tipo);
      setValor(centavosParaCampo(editando.valor));
      setDescricao(editando.descricao);
      setCategoriaId(editando.categoriaId ?? "");
      setContaId(editando.contaId);
      setDestinoId(editando.contaDestinoId ?? "");
      setData(editando.data);
      setParcelas("1");
    } else {
      setTipo("despesa");
      setValor("");
      setDescricao("");
      setCategoriaId("");
      setContaId(contas[0]?.id ?? "");
      setDestinoId(contas[1]?.id ?? "");
      setData(hojeISO());
      setParcelas("1");
    }
  }, [aberto, editando]);

  const tipoCategoria = tipo === "receita" ? "receita" : "despesa";
  const sugerida = !categoriaId && !novaCategoria && descricao ? fin.categorias.find((c) => c.id === fin.categorizar(descricao) && c.tipo === tipoCategoria)?.id : undefined;
  const precisaCategoria = tipo !== "transferencia" && !editando?.ajuste;

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    const v = validarValor(valor);
    if (v.erro) novos.valor = v.erro;
    if (!descricao.trim()) novos.descricao = T.validacao.obrigatorio;
    if (!contaId) novos.conta = T.validacao.contaObrigatoria;
    if (tipo === "transferencia" && (!destinoId || destinoId === contaId)) novos.destino = T.validacao.contasIguais;
    if (!dataValida(data)) novos.data = T.validacao.dataInvalida;
    const n = Number(parcelas);
    if (!Number.isInteger(n) || n < 1 || n > 48) novos.parcelas = T.validacao.entre(1, 48);
    const categoriaValida = fin.categorias.some((c) => c.id === (categoriaId || sugerida) && c.tipo === tipoCategoria);
    if (precisaCategoria && !categoriaValida && !novaCategoria.trim()) novos.categoria = T.financas.categoriaObrigatoria;
    setErros(novos);
    if (Object.keys(novos).length || v.valor == null) return;
    const categoriaFinal = !precisaCategoria ? undefined : categoriaValida ? categoriaId || sugerida : fin.obterOuCriarCategoria(novaCategoria, tipoCategoria).id;
    const dados = {
      tipo,
      valor: v.valor,
      descricao: descricao.trim(),
      categoriaId: categoriaFinal,
      contaId,
      contaDestinoId: tipo === "transferencia" ? destinoId : undefined,
      data,
    };
    if (editando) fin.atualizarTransacao(editando.id, dados);
    else {
      fin.lancar({ ...dados, parcelas: tipo === "despesa" ? n : 1 });
      void useAgentes.getState().trabalhar("operador", `${T.financas.tipos[tipo]}: ${dados.descricao}`, 400);
    }
    aoFechar();
  };

  if (contas.length === 0)
    return (
      <Modal aberto={aberto} titulo={T.financas.novaTransacao} aoFechar={aoFechar}>
        <Vazio icone={<Landmark size={28} />} titulo={T.financas.semContas} texto={T.financas.crieContaAntes} />
      </Modal>
    );

  return (
    <Modal aberto={aberto} titulo={editando ? T.geral.editar : T.financas.novaTransacao} aoFechar={aoFechar}>
      <form className="formulario" onSubmit={salvar} noValidate>
        <Segmentado<TipoTransacao>
          rotulo={T.financas.tipoConta}
          valor={tipo}
          aoMudar={(t) => { setTipo(t); setCategoriaId(""); setNovaCategoria(""); }}
          opcoes={[
            { valor: "despesa", rotulo: T.financas.tipos.despesa, icone: <ArrowUpRight size={13} /> },
            { valor: "receita", rotulo: T.financas.tipos.receita, icone: <ArrowDownLeft size={13} /> },
            { valor: "transferencia", rotulo: T.financas.tipos.transferencia, icone: <ArrowLeftRight size={13} /> },
          ]}
        />
        <div className="formulario-linha">
          <CampoDinheiro id="t-valor" rotulo={T.financas.valor} valor={valor} aoMudar={setValor} erro={erros.valor} obrigatorio />
          <Campo id="t-data" rotulo={T.financas.data} obrigatorio erro={erros.data}>
            <input id="t-data" type="date" className="campo" value={data} aria-invalid={!!erros.data} onChange={(e) => setData(e.target.value)} />
          </Campo>
        </div>
        <Campo id="t-desc" rotulo={T.financas.descricao} obrigatorio erro={erros.descricao}>
          <input id="t-desc" className="campo" value={descricao} maxLength={120} aria-invalid={!!erros.descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <div className="formulario-linha">
          <Campo id="t-conta" rotulo={tipo === "transferencia" ? T.financas.contaOrigem : T.financas.conta} obrigatorio erro={erros.conta}>
            <select id="t-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          {tipo === "transferencia" ? (
            <Campo id="t-destino" rotulo={T.financas.contaDestino} obrigatorio erro={erros.destino}>
              <select id="t-destino" className="seletor" value={destinoId} aria-invalid={!!erros.destino} onChange={(e) => setDestinoId(e.target.value)}>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          ) : (
            <Campo id="t-cat" rotulo={T.financas.categoria} obrigatorio={precisaCategoria} erro={erros.categoria} dica={sugerida ? T.financas.sugerida(fin.categorias.find((c) => c.id === sugerida)?.nome ?? "") : undefined}>
              <SeletorDeCategoria
                id="t-cat"
                tipo={tipoCategoria}
                categoriaId={categoriaId || sugerida || ""}
                novaCategoria={novaCategoria}
                invalido={!!erros.categoria}
                aoMudar={(id, nova) => { setCategoriaId(id); setNovaCategoria(nova); setErros((e) => ({ ...e, categoria: "" })); }}
              />
            </Campo>
          )}
        </div>
        {tipo === "despesa" && !editando && (
          <Campo id="t-parc" rotulo={T.financas.parcelas} erro={erros.parcelas} dica={T.financas.parcelasDica}>
            <input id="t-parc" className="campo" inputMode="numeric" value={parcelas} aria-invalid={!!erros.parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, ""))} />
          </Campo>
        )}
        {tipo === "transferencia" && <AvisoFaixa>{T.financas.cartaoSemDobro}</AvisoFaixa>}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function nomeCategoria(id: string | undefined, categorias: { id: string; nome: string }[]) {
  return categorias.find((c) => c.id === id)?.nome ?? T.financas.semCategoria;
}

function LinhaTransacao({ t, aoEditar }: { t: Transacao; aoEditar: () => void }) {
  const fin = useFinancas();
  const avisar = useInterface((s) => s.avisar);
  const categoria = fin.categorias.find((c) => c.id === t.categoriaId);
  const conta = fin.contas.find((c) => c.id === t.contaId);
  const sinal = t.tipo === "receita" ? "+" : t.tipo === "despesa" ? "-" : "";
  return (
    <div className="lista-item">
      <span className="ponto-cor" style={{ background: t.tipo === "transferencia" ? "var(--texto-3)" : categoria?.cor ?? "var(--borda-forte)", width: 10, height: 10 }} />
      <div className="lista-item-principal">
        <span className="lista-item-titulo">
          {t.descricao}
          {t.parcela && <span className="texto-3"> ({t.parcela.numero}/{t.parcela.total})</span>}
        </span>
        <span className="lista-item-sub">
          {t.tipo === "transferencia" ? `${conta?.nome} > ${fin.contas.find((c) => c.id === t.contaDestinoId)?.nome}` : `${nomeCategoria(t.categoriaId, fin.categorias)} . ${conta?.nome ?? ""}`}
          {t.divisaoId && ` . ${T.financas.dividida}`}
        </span>
      </div>
      <span className="numero privado" style={{ color: t.tipo === "receita" ? "var(--sucesso)" : undefined, fontWeight: 500 }}>
        {sinal}
        {formatarDinheiro(t.valor)}
      </span>
      <div className="lista-item-acoes">
        <Botao pequeno soIcone variante="fantasma" icone={<Pencil size={13} />} aria-label={T.geral.editar} onClick={aoEditar} />
        <Botao
          pequeno
          soIcone
          variante="fantasma"
          icone={<Trash2 size={13} />}
          aria-label={T.geral.excluir}
          onClick={() => {
            const removidas = fin.excluirTransacao(t.id);
            if (removidas.length) avisar(removidas.length > 1 ? T.financas.parcelasExcluidas(removidas.length) : T.geral.excluido, () => fin.restaurarTransacoes(removidas));
          }}
        />
      </div>
    </div>
  );
}

function Importar({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const fin = useFinancas();
  const avisar = useInterface((s) => s.avisar);
  const [contaId, setContaId] = useState("");
  const [previa, setPrevia] = useState<{ linhas: { data: string; descricao: string; valor: number }[]; invalidas: number } | null>(null);
  const [erro, setErro] = useState("");
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const [padrao, setPadrao] = useState<Record<"despesa" | "receita", { id: string; nova: string }>>({ despesa: { id: "", nova: "" }, receita: { id: "", nova: "" } });
  const arquivo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (aberto) {
      fin.garantirCategorias();
      setPrevia(null);
      setErro("");
      setEscolhas({});
      setPadrao({ despesa: { id: "", nova: "" }, receita: { id: "", nova: "" } });
      setContaId(fin.contas[0]?.id ?? "");
    }
  }, [aberto]);

  const tipoDaLinha = (valor: number) => (valor < 0 ? "despesa" : "receita") as "despesa" | "receita";
  const sugestoes = useMemo(
    () =>
      (previa?.linhas ?? []).map((l) => {
        const tipo = tipoDaLinha(l.valor);
        const doTipo = fin.categorias.filter((c) => c.tipo === tipo);
        const pelaRegra = doTipo.find((c) => c.id === fin.categorizar(l.descricao));
        return (pelaRegra ?? categoriaPelaDescricao(doTipo, l.descricao))?.id ?? "";
      }),
    [previa, fin.categorias, fin.regras],
  );
  const categoriaDaLinha = (i: number) => (fin.categorias.some((c) => c.id === escolhas[i]) ? escolhas[i] : sugestoes[i]) ?? "";
  const tiposSemCategoria = (["despesa", "receita"] as const).filter((tipo) => previa?.linhas.some((l, i) => tipoDaLinha(l.valor) === tipo && !categoriaDaLinha(i)));
  const padraoValido = (tipo: "despesa" | "receita") => fin.categorias.some((c) => c.id === padrao[tipo].id && c.tipo === tipo) || !!padrao[tipo].nova.trim();
  const faltaPadrao = tiposSemCategoria.some((tipo) => !padraoValido(tipo));

  return (
    <Modal aberto={aberto} titulo={T.financas.importarExtrato} aoFechar={aoFechar} largo>
      <div className="formulario">
        <p className="campo-dica">{T.financas.importarDica}</p>
        <div className="formulario-linha">
          <Campo id="i-conta" rotulo={T.financas.conta} obrigatorio>
            <select id="i-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
              {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo id="i-arquivo" rotulo={T.financas.arquivo} erro={erro}>
            <input
              id="i-arquivo"
              ref={arquivo}
              type="file"
              accept=".ofx,.csv,.txt"
              className="campo"
              style={{ paddingTop: 6 }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const texto = await lerArquivoTexto(f, 3 * 1024 * 1024);
                  const resultado = /<OFX>|<STMTTRN>/i.test(texto) ? lerOfx(texto) : lerCsv(texto);
                  if (resultado.linhas.length === 0) {
                    setErro(T.validacao.arquivoInvalido);
                    setPrevia(null);
                    return;
                  }
                  setErro("");
                  setPrevia(resultado);
                } catch (x) {
                  setErro((x as Error).message === "arquivo_grande" ? T.validacao.arquivoGrande : T.validacao.arquivoInvalido);
                }
              }}
            />
          </Campo>
        </div>
        {previa && (
          <>
            <span className="texto-2">{T.financas.previaImportacao(previa.linhas.length, previa.invalidas)}</span>
            <div className="tabela-rolagem" style={{ maxHeight: 220 }}>
              <table className="tabela">
                <tbody>
                  {previa.linhas.slice(0, 50).map((l, i) => (
                    <tr key={i}>
                      <td>{formatar(l.data, "dd/MM/yyyy")}</td>
                      <td>{l.descricao}</td>
                      <td>
                        <select className="seletor" style={{ height: 28, minWidth: 140 }} aria-label={T.financas.categoria} value={categoriaDaLinha(i)} onChange={(e) => setEscolhas((x) => ({ ...x, [i]: e.target.value }))}>
                          <option value="">{T.financas.categoriaPadraoOpcao}</option>
                          {fin.categorias.filter((c) => c.tipo === tipoDaLinha(l.valor)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </td>
                      <td className="direita numero">{formatarDinheiro(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tiposSemCategoria.length > 0 && (
              <div className="formulario-linha">
                {tiposSemCategoria.map((tipo) => (
                  <Campo key={tipo} id={`i-padrao-${tipo}`} rotulo={T.financas.categoriaPadrao(tipo === "despesa" ? T.financas.tipos.despesa : T.financas.tipos.receita)} obrigatorio dica={T.financas.categoriaPadraoDica}>
                    <SeletorDeCategoria
                      id={`i-padrao-${tipo}`}
                      tipo={tipo}
                      categoriaId={padrao[tipo].id}
                      novaCategoria={padrao[tipo].nova}
                      invalido={!padraoValido(tipo)}
                      aoMudar={(id, nova) => setPadrao((p) => ({ ...p, [tipo]: { id, nova } }))}
                    />
                  </Campo>
                ))}
              </div>
            )}
          </>
        )}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao
            variante="primario"
            disabled={!previa || !contaId || faltaPadrao}
            title={faltaPadrao ? T.financas.categoriaObrigatoria : undefined}
            onClick={() => {
              if (!previa || faltaPadrao) return;
              const padraoFinal = (tipo: "despesa" | "receita") =>
                fin.categorias.some((c) => c.id === padrao[tipo].id && c.tipo === tipo) ? padrao[tipo].id : fin.obterOuCriarCategoria(padrao[tipo].nova, tipo).id;
              const finais = Object.fromEntries(tiposSemCategoria.map((tipo) => [tipo, padraoFinal(tipo)]));
              const r = fin.importar(
                previa.linhas.map((l, i) => {
                  const tipo = tipoDaLinha(l.valor);
                  return { tipo, valor: Math.abs(l.valor), descricao: l.descricao, contaId, data: l.data, categoriaId: categoriaDaLinha(i) || finais[tipo] };
                }),
              );
              avisar(T.financas.importados(r.importados, r.duplicados));
              aoFechar();
            }}
          >
            {T.geral.importar}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function VisaoGeral({ modo, mes }: { modo: Modo; mes: string }) {
  const fin = useFinancas();
  const gastos = gastoPorCategoria(fin, mes, modo);
  const entradas = somar(receitasDoMes(fin, mes), (t) => t.valor);
  const saidas = somar([...gastos.values()], (v) => v);
  const saldoTotal = somar(fin.contas.filter((c) => !c.arquivada), (c) => saldoDaConta(fin, c.id));
  const aReceber = somar([...saldosComPessoas(fin).values()].filter((v) => v > 0), (v) => v);
  const meses = Array.from({ length: 6 }, (_, i) => format(addMonths(deISO(`${mes}-01`), i - 5), "yyyy-MM"));
  const hojeDia = new Date().getDate();
  const proximas = fin.recorrentes.filter((r) => r.ativa).map((r) => ({ ...r, falta: (r.dia - hojeDia + 31) % 31 })).sort((a, b) => a.falta - b.falta).slice(0, 5);

  return (
    <div className="grade">
      <Cartao className="col-3"><span className="rotulo-secao">{T.financas.saldoTotal}</span><div className="numero-grande privado">{formatarDinheiro(saldoTotal)}</div></Cartao>
      <Cartao className="col-3"><span className="rotulo-secao">{T.financas.entradas}</span><div className="numero-grande privado" style={{ color: "var(--sucesso)" }}>{formatarDinheiro(entradas)}</div></Cartao>
      <Cartao className="col-3"><span className="rotulo-secao">{T.financas.saidas}</span><div className="numero-grande privado">{formatarDinheiro(saidas)}</div></Cartao>
      <Cartao className="col-3"><span className="rotulo-secao">{T.financas.aReceber}</span><div className="numero-grande privado">{formatarDinheiro(aReceber)}</div></Cartao>
      <Cartao className="col-6" titulo={T.financas.porCategoria}>
        {gastos.size === 0 ? <p className="texto-3">{T.financas.semTransacoes}</p> : (
          <BarrasHorizontais formatar={formatarDinheiro} barras={[...gastos].map(([id, v]) => { const c = fin.categorias.find((x) => x.id === id); return { rotulo: c?.nome ?? T.financas.semCategoria, valor: v, cor: c?.cor }; }).sort((a, b) => b.valor - a.valor)} />
        )}
      </Cartao>
      <Cartao className="col-6" titulo={T.financas.evolucao}>
        <BarrasVerticais
          formatar={formatarDinheiro}
          barras={meses.map((m) => ({ rotulo: formatar(`${m}-01`, "MMM"), valor: somar([...gastoPorCategoria(fin, m, modo).values()], (v) => v), detalhe: `${formatar(`${m}-01`, "MMM yyyy")}: ${formatarDinheiro(somar([...gastoPorCategoria(fin, m, modo).values()], (v) => v))}` }))}
        />
      </Cartao>
      <Cartao className="col-12" titulo={T.financas.proximasContas}>
        {proximas.length === 0 ? <p className="texto-3">{T.financas.semRecorrentes}</p> : (
          <div className="lista">
            {proximas.map((r) => (
              <div key={r.id} className="lista-item">
                <Repeat size={14} />
                <span className="lista-item-principal">{r.descricao}</span>
                <span className="etiqueta">{r.falta === 0 ? T.datas.hoje : T.datas.emDias(r.falta)}</span>
                <span className="numero privado">{formatarDinheiro(r.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </Cartao>
    </div>
  );
}

function Transacoes({ mes, buscaInicial }: { mes: string; buscaInicial?: string }) {
  const fin = useFinancas();
  const [busca, setBusca] = useState(buscaInicial ?? "");
  const [conta, setConta] = useState("");
  const [categoria, setCategoria] = useState("");
  const [tipo, setTipo] = useState<TipoTransacao | "">("");
  const [editando, setEditando] = useState<Transacao | null>(null);
  const [limite, setLimite] = useState(80);

  const lista = fin.transacoes
    .filter((t) => (busca ? contem(t.descricao, busca) : t.data.startsWith(mes)))
    .filter((t) => !conta || t.contaId === conta || t.contaDestinoId === conta)
    .filter((t) => !categoria || t.categoriaId === categoria)
    .filter((t) => !tipo || t.tipo === tipo)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadaEm.localeCompare(a.criadaEm));
  const visiveis = lista.slice(0, limite);
  const porDia = visiveis.reduce<Record<string, Transacao[]>>((acc, t) => ((acc[t.data] ??= []).push(t), acc), {});

  return (
    <div className="coluna">
      <div className="barra-acoes">
        <label className="campo-busca">
          <ListFilter size={14} />
          <input className="campo" value={busca} maxLength={80} placeholder={T.financas.buscarTransacao} aria-label={T.financas.buscarTransacao} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <select className="seletor" style={{ width: 160, height: 32 }} value={conta} aria-label={T.financas.conta} onChange={(e) => setConta(e.target.value)}>
          <option value="">{T.financas.todasContas}</option>
          {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="seletor" style={{ width: 170, height: 32 }} value={categoria} aria-label={T.financas.categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">{T.financas.todasCategorias}</option>
          {fin.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="seletor" style={{ width: 150, height: 32 }} value={tipo} aria-label={T.financas.tipoConta} onChange={(e) => setTipo(e.target.value as TipoTransacao | "")}>
          <option value="">{T.geral.todos}</option>
          {(["despesa", "receita", "transferencia"] as const).map((t) => <option key={t} value={t}>{T.financas.tipos[t]}</option>)}
        </select>
        {(busca || conta || categoria || tipo) && <Botao pequeno variante="fantasma" icone={<X size={13} />} onClick={() => { setBusca(""); setConta(""); setCategoria(""); setTipo(""); }}>{T.geral.limpar}</Botao>}
      </div>
      {lista.length === 0 ? (
        <Vazio icone={<Wallet size={28} />} titulo={T.financas.semTransacoes} />
      ) : (
        <>
          {Object.entries(porDia).map(([dia, itens]) => (
            <div key={dia}>
              <div className="linha-entre rotulo-secao" style={{ padding: "8px 0 0" }}>
                <span style={{ textTransform: "capitalize" }}>{formatar(dia, "EEEE, d 'de' MMM")}</span>
              </div>
              <div className="lista">{itens.map((t) => <LinhaTransacao key={t.id} t={t} aoEditar={() => setEditando(t)} />)}</div>
            </div>
          ))}
          {lista.length > limite && <Botao onClick={() => setLimite((l) => l + 80)}>{T.financas.carregarMais(lista.length - limite)}</Botao>}
        </>
      )}
      <FormTransacao aberto={!!editando} editando={editando} aoFechar={() => setEditando(null)} />
    </div>
  );
}

function FormConta({ aberto, aoFechar, aoCriar, aviso }: { aberto: boolean; aoFechar: () => void; aoCriar?: (conta: Conta) => void; aviso?: string }) {
  const fin = useFinancas();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoConta>("corrente");
  const [saldo, setSaldo] = useState("0,00");
  const [fechamento, setFechamento] = useState("3");
  const [vencimento, setVencimento] = useState("10");
  const [limite, setLimite] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setNome("");
    setTipo("corrente");
    setSaldo("0,00");
    setLimite("");
    setErros({});
  }, [aberto]);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    if (!nome.trim()) novos.nome = T.validacao.obrigatorio;
    else if (fin.contas.some((c) => normalizarTexto(c.nome) === normalizarTexto(nome))) novos.nome = T.validacao.duplicado;
    const s = lerValorEmCentavos(saldo || "0");
    if (s == null) novos.saldo = T.validacao.valorInvalido;
    const f = Number(fechamento);
    const v = Number(vencimento);
    if (tipo === "cartao") {
      if (!Number.isInteger(f) || f < 1 || f > 28) novos.fechamento = T.validacao.entre(1, 28);
      if (!Number.isInteger(v) || v < 1 || v > 28) novos.vencimento = T.validacao.entre(1, 28);
    }
    const l = limite ? lerValorEmCentavos(limite) : 0;
    if (l == null) novos.limite = T.validacao.valorInvalido;
    setErros(novos);
    if (Object.keys(novos).length) return;
    const conta = fin.criarConta({ nome, tipo, saldoInicial: tipo === "cartao" ? 0 : s ?? 0, cor: CORES[fin.contas.length % CORES.length], fechamentoDia: tipo === "cartao" ? f : undefined, vencimentoDia: tipo === "cartao" ? v : undefined, limite: tipo === "cartao" ? l ?? 0 : undefined });
    void tocarSom("pop");
    aoFechar();
    aoCriar?.(conta);
  };

  return (
    <Modal aberto={aberto} titulo={T.financas.novaConta} aoFechar={aoFechar}>
      <form className="formulario" onSubmit={salvar} noValidate>
        {aviso && <AvisoFaixa>{aviso}</AvisoFaixa>}
        <Campo id="c-nome" rotulo={T.financas.nomeConta} obrigatorio erro={erros.nome} dica={T.financas.nomeContaDica}>
          <input id="c-nome" className="campo" autoFocus value={nome} maxLength={60} aria-invalid={!!erros.nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo id="c-tipo" rotulo={T.financas.tipoConta}>
          <select id="c-tipo" className="seletor" value={tipo} onChange={(e) => setTipo(e.target.value as TipoConta)}>
            {(Object.keys(T.financas.tiposConta) as TipoConta[]).map((t) => <option key={t} value={t}>{T.financas.tiposConta[t]}</option>)}
          </select>
        </Campo>
        {tipo === "cartao" ? (
          <div className="formulario-linha">
            <Campo id="c-fech" rotulo={T.financas.fechamento} obrigatorio erro={erros.fechamento}>
              <input id="c-fech" className="campo" inputMode="numeric" value={fechamento} onChange={(e) => setFechamento(e.target.value.replace(/\D/g, ""))} />
            </Campo>
            <Campo id="c-venc" rotulo={T.financas.vencimento} obrigatorio erro={erros.vencimento}>
              <input id="c-venc" className="campo" inputMode="numeric" value={vencimento} onChange={(e) => setVencimento(e.target.value.replace(/\D/g, ""))} />
            </Campo>
            <CampoDinheiro id="c-lim" rotulo={T.financas.limite} valor={limite} aoMudar={setLimite} erro={erros.limite} />
          </div>
        ) : (
          <CampoDinheiro id="c-saldo" rotulo={T.financas.saldoInicial} valor={saldo} aoMudar={setSaldo} erro={erros.saldo} dica={T.financas.saldoInicialDica} />
        )}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function Contas() {
  const fin = useFinancas();
  const [nova, setNova] = useState(false);
  const [ajuste, setAjuste] = useState<Conta | null>(null);
  const [excluir, setExcluir] = useState<Conta | null>(null);
  const [saldoReal, setSaldoReal] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const abrirNova = () => setNova(true);

  return (
    <>
      <div className="linha-entre">
        <span className="texto-2">{T.financas.contasDica}</span>
        <Botao variante="primario" pequeno icone={<Plus size={13} />} onClick={abrirNova}>{T.financas.novaConta}</Botao>
      </div>
      {fin.contas.length === 0 ? (
        <Vazio icone={<Landmark size={28} />} titulo={T.financas.semContas} acao={<Botao variante="primario" onClick={abrirNova}>{T.financas.novaConta}</Botao>} />
      ) : (
        <div className="grade">
          {fin.contas.map((c) => {
            const s = saldoDaConta(fin, c.id);
            return (
              <Cartao key={c.id} className="col-4">
                <div className="linha" style={{ marginBottom: 8 }}>
                  <span style={{ color: c.cor, display: "grid" }}>{ICONE_CONTA[c.tipo]}</span>
                  <b className="cortar">{c.nome}</b>
                  <span className="etiqueta empurrar">{T.financas.tiposConta[c.tipo]}</span>
                </div>
                <div className="numero-grande privado" style={{ color: s < 0 ? "var(--erro)" : undefined }}>{formatarDinheiro(s)}</div>
                <div className="linha" style={{ marginTop: 12 }}>
                  <Botao pequeno icone={<Scale size={13} />} onClick={() => { setAjuste(c); setSaldoReal(centavosParaCampo(s)); setErros({}); }}>{T.financas.ajustarSaldo}</Botao>
                  <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => setExcluir(c)} />
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
      <FormConta aberto={nova} aoFechar={() => setNova(false)} />
      <Modal aberto={!!ajuste} titulo={T.financas.ajustarSaldo} aoFechar={() => setAjuste(null)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = lerValorEmCentavos(saldoReal.replace(/^-/, ""));
            if (v == null || !ajuste) return setErros({ real: T.validacao.valorInvalido });
            fin.ajustarSaldo(ajuste.id, saldoReal.trim().startsWith("-") ? -v : v);
            setAjuste(null);
          }}
        >
          <p className="campo-dica">{T.financas.ajusteDica}</p>
          <CampoDinheiro id="c-real" rotulo={T.financas.saldoReal} valor={saldoReal} aoMudar={setSaldoReal} erro={erros.real} />
          <div className="formulario-acoes">
            <Botao onClick={() => setAjuste(null)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
          </div>
        </form>
      </Modal>
      <ConfirmarModal aberto={!!excluir} titulo={T.geral.confirmarExclusao} texto={T.financas.excluirConta} aoFechar={() => setExcluir(null)} aoConfirmar={() => excluir && fin.excluirConta(excluir.id)} />
    </>
  );
}

function Cartoes() {
  const fin = useFinancas();
  const cartoes = fin.contas.filter((c) => c.tipo === "cartao");
  const [pagando, setPagando] = useState<{ cartao: Conta; valor: number } | null>(null);
  const [contaPagamento, setContaPagamento] = useState("");
  const [deslocamento, setDeslocamento] = useState(0);
  if (cartoes.length === 0) return <Vazio icone={<CreditCard size={28} />} titulo={T.financas.semCartoes} />;

  return (
    <div className="coluna">
      <div className="linha">
        <Botao pequeno onClick={() => setDeslocamento((d) => d - 1)}>{T.geral.anterior}</Botao>
        <Botao pequeno onClick={() => setDeslocamento(0)} disabled={deslocamento === 0}>{T.financas.faturaAtual}</Botao>
        <Botao pequeno onClick={() => setDeslocamento((d) => d + 1)}>{T.geral.proximo}</Botao>
      </div>
      {cartoes.map((c) => {
        const base = addMonths(new Date(), deslocamento);
        const venc = setDate(base, Math.min(c.vencimentoDia ?? 10, getDaysInMonth(base)));
        const vencISO = paraISO(venc);
        const compras = fin.transacoes.filter((t) => t.contaId === c.id && t.tipo === "despesa" && dataDeCaixa(t, fin.contas) === vencISO);
        const total = somar(compras, (t) => t.valor);
        const usado = Math.max(0, -saldoDaConta(fin, c.id));
        return (
          <Cartao key={c.id} titulo={`${c.nome} . ${T.financas.faturaDe(formatarData(venc, "MMMM"))}`} icone={<CreditCard size={16} />} acoes={<Botao pequeno variante="primario" disabled={total === 0} onClick={() => { setPagando({ cartao: c, valor: total }); setContaPagamento(fin.contas.find((x) => x.tipo !== "cartao")?.id ?? ""); }}>{T.financas.pagarFatura}</Botao>}>
            <div className="linha" style={{ gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
              <div><span className="rotulo-secao">{T.financas.fatura}</span><div className="numero-grande privado">{formatarDinheiro(total)}</div></div>
              <div><span className="rotulo-secao">{T.financas.vencimento}</span><div>{formatar(vencISO, "d 'de' MMM")}</div></div>
              {c.limite ? (
                <div style={{ flex: 1, minWidth: 180 }}>
                  <span className="rotulo-secao">{T.financas.limiteUsado}</span>
                  <Progresso valor={usado / c.limite} nivel={usado / c.limite > 0.9 ? "erro" : usado / c.limite > 0.7 ? "alerta" : undefined} />
                  <span className="texto-3 numero privado" style={{ fontSize: 11 }}>{formatarDinheiro(usado)} / {formatarDinheiro(c.limite)}</span>
                </div>
              ) : null}
            </div>
            {compras.length === 0 ? <p className="texto-3">{T.financas.semTransacoes}</p> : <div className="lista">{compras.map((t) => <LinhaTransacao key={t.id} t={t} aoEditar={() => undefined} />)}</div>}
          </Cartao>
        );
      })}
      <AvisoFaixa>{T.financas.cartaoSemDobro}</AvisoFaixa>
      <Modal aberto={!!pagando} titulo={T.financas.pagarFatura} aoFechar={() => setPagando(null)}>
        {pagando && (
          <div className="formulario">
            <p>{T.financas.pagarResumo(formatarDinheiro(pagando.valor), pagando.cartao.nome)}</p>
            <Campo id="pf-conta" rotulo={T.financas.pagarCom}>
              <select id="pf-conta" className="seletor" value={contaPagamento} onChange={(e) => setContaPagamento(e.target.value)}>
                {fin.contas.filter((x) => x.tipo !== "cartao").map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </Campo>
            <div className="formulario-acoes">
              <Botao onClick={() => setPagando(null)}>{T.geral.cancelar}</Botao>
              <Botao
                variante="primario"
                disabled={!contaPagamento}
                onClick={() => {
                  fin.lancar({ tipo: "transferencia", valor: pagando.valor, descricao: T.financas.pagamentoFatura(pagando.cartao.nome), contaId: contaPagamento, contaDestinoId: pagando.cartao.id, data: hojeISO() });
                  setPagando(null);
                  void tocarSom("approve");
                }}
              >
                {T.geral.confirmar}
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Orcamento({ mes, modo }: { mes: string; modo: Modo }) {
  const fin = useFinancas();
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState("");
  const gastos = gastoPorCategoria(fin, mes, modo);
  const despesas = fin.categorias.filter((c) => c.tipo === "despesa");

  return (
    <div className="lista">
      {despesas.map((c) => {
        const gasto = gastos.get(c.id) ?? 0;
        const p = c.orcamento > 0 ? gasto / c.orcamento : 0;
        return (
          <div key={c.id} className="lista-item" style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
            <span className="ponto-cor" style={{ background: c.cor, marginTop: 5 }} />
            <div className="lista-item-principal" style={{ gap: 6 }}>
              <div className="linha-entre">
                <span>{c.nome}</span>
                <span className="numero privado texto-2" style={{ fontSize: 12 }}>{formatarDinheiro(gasto)} {c.orcamento > 0 && `/ ${formatarDinheiro(c.orcamento)}`}</span>
              </div>
              {c.orcamento > 0 ? <Progresso valor={p} nivel={p >= 1 ? "erro" : p >= 0.8 ? "alerta" : "sucesso"} rotulo={c.nome} /> : <span className="texto-3" style={{ fontSize: 12 }}>{T.financas.semOrcamento}</span>}
              {editando === c.id && (
                <form
                  className="linha"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = validarValor(valor || "0", true);
                    if (v.erro || v.valor == null) return setErro(v.erro ?? T.validacao.valorInvalido);
                    fin.atualizarCategoria(c.id, { orcamento: v.valor });
                    setEditando(null);
                  }}
                >
                  <div className="campo-prefixo" style={{ maxWidth: 180 }}>
                    <span>R$</span>
                    <input className="campo" autoFocus inputMode="decimal" value={valor} aria-label={T.financas.orcamentoDe} aria-invalid={!!erro} onChange={(e) => { setValor(e.target.value.replace(/[^\d.,]/g, "")); setErro(""); }} />
                  </div>
                  <Botao pequeno type="submit" variante="primario" icone={<Check size={13} />}>{T.geral.salvar}</Botao>
                  <Botao pequeno onClick={() => setEditando(null)}>{T.geral.cancelar}</Botao>
                  {erro && <span className="campo-erro">{erro}</span>}
                </form>
              )}
            </div>
            {editando !== c.id && <Botao pequeno icone={<Pencil size={12} />} onClick={() => { setEditando(c.id); setValor(c.orcamento ? centavosParaCampo(c.orcamento) : ""); setErro(""); }}>{T.financas.orcamentoDe}</Botao>}
          </div>
        );
      })}
    </div>
  );
}

function GerenciarCategorias() {
  const fin = useFinancas();
  const [editando, setEditando] = useState<{ id: string | null; tipo: "despesa" | "receita"; nome: string; cor: string } | null>(null);
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState<{ id: string; destinoId: string } | null>(null);
  const alvoExclusao = fin.categorias.find((c) => c.id === excluindo?.id);
  const usos = (id: string) => fin.transacoes.filter((t) => t.categoriaId === id).length + fin.recorrentes.filter((r) => r.categoriaId === id).length;

  useEffect(() => fin.garantirCategorias(), []);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const nome = editando.nome.trim().slice(0, 40);
    if (!nome) return setErro(T.validacao.obrigatorio);
    const repetida = fin.categorias.some((c) => c.id !== editando.id && c.tipo === editando.tipo && normalizarTexto(c.nome) === normalizarTexto(nome));
    if (repetida) return setErro(T.validacao.duplicado);
    if (editando.id) fin.atualizarCategoria(editando.id, { nome, cor: editando.cor });
    else fin.criarCategoria({ nome, cor: editando.cor, orcamento: 0, tipo: editando.tipo });
    setEditando(null);
  };

  const formulario = (
    <form className="linha" style={{ flexWrap: "wrap" }} noValidate onSubmit={salvar}>
      {editando && !editando.id && (
        <Segmentado<"despesa" | "receita">
          rotulo={T.financas.tipoConta}
          valor={editando.tipo}
          aoMudar={(tipo) => setEditando({ ...editando, tipo })}
          opcoes={[{ valor: "despesa", rotulo: T.financas.tipos.despesa }, { valor: "receita", rotulo: T.financas.tipos.receita }]}
        />
      )}
      <input className="campo" style={{ maxWidth: 220 }} autoFocus maxLength={40} value={editando?.nome ?? ""} placeholder={T.financas.nomeCategoria} aria-label={T.financas.nomeCategoria} aria-invalid={!!erro} onChange={(e) => { setEditando((x) => x && { ...x, nome: e.target.value }); setErro(""); }} />
      <span className="linha" style={{ gap: 4 }}>
        {CORES_CATEGORIA.map((cor) => (
          <button key={cor} type="button" className="ponto-cor" aria-label={cor} aria-pressed={editando?.cor === cor} style={{ background: cor, width: 18, height: 18, outline: editando?.cor === cor ? "2px solid var(--texto)" : undefined, outlineOffset: 2 }} onClick={() => setEditando((x) => x && { ...x, cor })} />
        ))}
      </span>
      <Botao pequeno type="submit" variante="primario" icone={<Check size={13} />}>{T.geral.salvar}</Botao>
      <Botao pequeno onClick={() => setEditando(null)}>{T.geral.cancelar}</Botao>
      {erro && <span className="campo-erro">{erro}</span>}
    </form>
  );

  return (
    <Cartao
      titulo={T.financas.categorias}
      icone={<Tags size={16} />}
      acoes={!editando || editando.id ? <Botao pequeno variante="primario" icone={<Plus size={13} />} onClick={() => { setEditando({ id: null, tipo: "despesa", nome: "", cor: CORES_CATEGORIA[fin.categorias.length % CORES_CATEGORIA.length] }); setErro(""); }}>{T.financas.novaCategoria}</Botao> : undefined}
    >
      <p className="campo-dica" style={{ marginBottom: 8 }}>{T.financas.categoriasDica}</p>
      {editando && !editando.id && formulario}
      {(["despesa", "receita"] as const).map((tipo) => (
        <div key={tipo} className="lista" style={{ marginTop: 8 }}>
          <span className="texto-3" style={{ fontSize: 12 }}>{tipo === "despesa" ? T.financas.tipos.despesa : T.financas.tipos.receita}</span>
          {fin.categorias.filter((c) => c.tipo === tipo).map((c) => (
            <div key={c.id} className="lista-item">
              <span className="ponto-cor" style={{ background: c.cor }} />
              {editando?.id === c.id ? formulario : (
                <>
                  <span className="lista-item-principal">{c.nome}</span>
                  <div className="lista-item-acoes">
                    <Botao pequeno soIcone variante="fantasma" icone={<Pencil size={13} />} aria-label={T.geral.editar} onClick={() => { setEditando({ id: c.id, tipo: c.tipo, nome: c.nome, cor: c.cor }); setErro(""); }} />
                    <Botao
                      pequeno
                      soIcone
                      variante="fantasma"
                      icone={<Trash2 size={13} />}
                      aria-label={T.financas.excluirCategoria(c.nome)}
                      title={fin.categorias.filter((x) => x.tipo === tipo).length <= 1 ? T.financas.ultimaCategoria : undefined}
                      disabled={fin.categorias.filter((x) => x.tipo === tipo).length <= 1}
                      onClick={() => setExcluindo({ id: c.id, destinoId: fin.categorias.find((x) => x.tipo === tipo && x.id !== c.id)?.id ?? "" })}
                    />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      <Modal aberto={!!alvoExclusao} titulo={alvoExclusao ? T.financas.excluirCategoria(alvoExclusao.nome) : ""} aoFechar={() => setExcluindo(null)}>
        {alvoExclusao && excluindo && (
          <div className="formulario">
            <Campo id="cat-destino" rotulo={T.financas.moverPara} dica={T.financas.excluirCategoriaDica(usos(alvoExclusao.id))}>
              <select id="cat-destino" className="seletor" value={excluindo.destinoId} onChange={(e) => setExcluindo({ ...excluindo, destinoId: e.target.value })}>
                {fin.categorias.filter((c) => c.tipo === alvoExclusao.tipo && c.id !== alvoExclusao.id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <div className="formulario-acoes">
              <Botao onClick={() => setExcluindo(null)}>{T.geral.cancelar}</Botao>
              <Botao variante="perigo" disabled={!excluindo.destinoId} onClick={() => { fin.excluirCategoria(excluindo.id, excluindo.destinoId); setExcluindo(null); }}>{T.geral.excluir}</Botao>
            </div>
          </div>
        )}
      </Modal>
    </Cartao>
  );
}

function Recorrentes() {
  const fin = useFinancas();
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState("5");
  const [frequencia, setFrequencia] = useState<"mensal" | "anual">("mensal");
  const [mesAnual, setMesAnual] = useState(String(new Date().getMonth() + 1));
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const candidatas = useMemo(() => detectarAssinaturas(fin.transacoes, fin.recorrentes, fin.assinaturasIgnoradas), [fin.transacoes, fin.recorrentes, fin.assinaturasIgnoradas]);
  const mudaram = useMemo(() => assinaturasComValorNovo(fin.transacoes, fin.recorrentes), [fin.transacoes, fin.recorrentes]);

  const abrir = (pre?: { descricao: string; valor: number; dia: number; frequencia: "mensal" | "anual"; contaId: string; categoriaId?: string }) => {
    setDescricao(pre?.descricao ?? "");
    setValor(pre ? centavosParaCampo(pre.valor) : "");
    setDia(String(pre?.dia ?? 5));
    setFrequencia(pre?.frequencia ?? "mensal");
    setContaId(pre?.contaId ?? fin.contas[0]?.id ?? "");
    setCategoriaId(pre?.categoriaId ?? (pre ? fin.categorizar(pre.descricao) ?? "" : ""));
    setNovaCategoria("");
    setErros({});
    setAberto(true);
  };

  return (
    <div className="coluna" style={{ gap: 20 }}>
      <Cartao titulo={T.financas.detector} icone={<Sparkles size={16} />}>
        <p className="campo-dica" style={{ marginBottom: 8 }}>{T.financas.detectorDica}</p>
        {mudaram.map((r) => <AvisoFaixa key={r.id} tipo="alerta">{T.financas.mudouValor(r.descricao)}</AvisoFaixa>)}
        {candidatas.length === 0 ? <p className="texto-3">{T.financas.semCandidatas}</p> : (
          <div className="lista">
            {candidatas.map((c) => (
              <div key={c.chave} className="lista-item">
                <Repeat size={14} />
                <div className="lista-item-principal">
                  <span className="lista-item-titulo">{c.descricao}</span>
                  <span className="lista-item-sub">{T.financas.ocorrencias(c.ocorrencias.length)} . {c.frequencia === "mensal" ? T.financas.mensal : T.financas.anual} . {T.financas.proximaPrevista(formatar(c.proxima, "d 'de' MMM"))}</span>
                </div>
                <span className="numero privado">{formatarDinheiro(c.valor)}</span>
                <Botao pequeno variante="primario" onClick={() => abrir(c)}>{T.financas.cadastrarRecorrente}</Botao>
                <Botao pequeno variante="fantasma" onClick={() => fin.ignorarAssinatura(c.chave)}>{T.financas.ignorarSempre}</Botao>
              </div>
            ))}
          </div>
        )}
      </Cartao>
      <Cartao titulo={T.financas.abas.recorrentes} icone={<Repeat size={16} />} acoes={<Botao pequeno variante="primario" icone={<Plus size={13} />} disabled={fin.contas.length === 0} onClick={() => abrir()}>{T.financas.novaRecorrente}</Botao>}>
        {fin.recorrentes.length === 0 ? <Vazio titulo={T.financas.semRecorrentes} /> : (
          <div className="lista">
            {fin.recorrentes.map((r) => (
              <div key={r.id} className="lista-item">
                <CaixaMarcar marcada={r.ativa} rotulo={r.ativa ? T.financas.ativa : T.financas.pausada} aoMudar={(v) => fin.atualizarRecorrente(r.id, { ativa: v })} />
                <div className="lista-item-principal">
                  <span className={`lista-item-titulo ${r.ativa ? "" : "texto-3"}`}>{r.descricao}</span>
                  <span className="lista-item-sub">{r.frequencia === "mensal" ? T.financas.mensal : T.financas.anual} . {T.financas.dia} {r.dia} . {nomeCategoria(r.categoriaId, fin.categorias)}</span>
                </div>
                <span className="numero privado">{formatarDinheiro(r.valor)}</span>
                <div className="lista-item-acoes"><Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.excluirRecorrente(r.id)} /></div>
              </div>
            ))}
          </div>
        )}
      </Cartao>
      <Modal aberto={aberto} titulo={T.financas.novaRecorrente} aoFechar={() => setAberto(false)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const novos: Record<string, string> = {};
            if (!descricao.trim()) novos.descricao = T.validacao.obrigatorio;
            const v = validarValor(valor);
            if (v.erro) novos.valor = v.erro;
            const d = Number(dia);
            if (!Number.isInteger(d) || d < 1 || d > 31) novos.dia = T.validacao.entre(1, 31);
            if (!contaId) novos.conta = T.validacao.contaObrigatoria;
            const categoriaValida = fin.categorias.some((c) => c.id === categoriaId && c.tipo === "despesa");
            if (!categoriaValida && !novaCategoria.trim()) novos.categoria = T.financas.categoriaObrigatoria;
            setErros(novos);
            if (Object.keys(novos).length || v.valor == null) return;
            const categoriaFinal = categoriaValida ? categoriaId : fin.obterOuCriarCategoria(novaCategoria, "despesa").id;
            const hoje = new Date();
            fin.criarRecorrente({
              descricao: descricao.trim(),
              valor: v.valor,
              dia: d,
              frequencia,
              mesAnual: frequencia === "anual" ? Number(mesAnual) : undefined,
              contaId,
              categoriaId: categoriaFinal,
              ativa: true,
              geradoAte: geradoAteInicial({ dia: d, frequencia, mesAnual: frequencia === "anual" ? Number(mesAnual) : undefined }, hoje),
            });
            setAberto(false);
          }}
        >
          <Campo id="r-desc" rotulo={T.financas.descricao} obrigatorio erro={erros.descricao}>
            <input id="r-desc" className="campo" value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} />
          </Campo>
          <div className="formulario-linha">
            <CampoDinheiro id="r-valor" rotulo={T.financas.valor} valor={valor} aoMudar={setValor} erro={erros.valor} obrigatorio />
            <Campo id="r-dia" rotulo={T.financas.dia} obrigatorio erro={erros.dia}>
              <input id="r-dia" className="campo" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, ""))} />
            </Campo>
          </div>
          <div className="formulario-linha">
            <Campo id="r-freq" rotulo={T.financas.frequencia}>
              <select id="r-freq" className="seletor" value={frequencia} onChange={(e) => setFrequencia(e.target.value as "mensal" | "anual")}>
                <option value="mensal">{T.financas.mensal}</option>
                <option value="anual">{T.financas.anual}</option>
              </select>
            </Campo>
            {frequencia === "anual" && (
              <Campo id="r-mes" rotulo={T.financas.mesAnual}>
                <select id="r-mes" className="seletor" value={mesAnual} onChange={(e) => setMesAnual(e.target.value)}>
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{formatarData(new Date(2026, i, 1), "MMMM")}</option>)}
                </select>
              </Campo>
            )}
          </div>
          <div className="formulario-linha">
            <Campo id="r-conta" rotulo={T.financas.conta} obrigatorio erro={erros.conta}>
              <select id="r-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
                {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <Campo id="r-cat" rotulo={T.financas.categoria} obrigatorio erro={erros.categoria}>
              <SeletorDeCategoria
                id="r-cat"
                tipo="despesa"
                categoriaId={categoriaId}
                novaCategoria={novaCategoria}
                invalido={!!erros.categoria}
                aoMudar={(id, nova) => { setCategoriaId(id); setNovaCategoria(nova); setErros((e) => ({ ...e, categoria: "" })); }}
              />
            </Campo>
          </div>
          <div className="formulario-acoes">
            <Botao onClick={() => setAberto(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Economia() {
  const fin = useFinancas();
  const [nova, setNova] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [alvo, setAlvo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [valor, setValor] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});

  return (
    <>
      <div className="linha-entre">
        <span />
        <Botao pequeno variante="primario" icone={<Plus size={13} />} onClick={() => { setNome(""); setAlvo(""); setPrazo(""); setErros({}); setNova(true); }}>{T.financas.novaMetaEconomia}</Botao>
      </div>
      {fin.metasEconomia.length === 0 ? <Vazio icone={<PiggyBank size={28} />} titulo={T.financas.semMetasEconomia} /> : (
        <div className="grade">
          {fin.metasEconomia.map((m) => {
            const p = m.alvo ? m.guardado / m.alvo : 0;
            const meses = m.prazo ? Math.max(1, Math.ceil((deISO(m.prazo).getTime() - Date.now()) / (30 * 86400000))) : 0;
            return (
              <Cartao key={m.id} className="col-6" titulo={m.nome} icone={<Target size={16} />} acoes={<Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.excluirMetaEconomia(m.id)} />}>
                <div className="linha-entre"><span className="numero-grande privado">{formatarDinheiro(m.guardado)}</span><span className="texto-2 privado">{formatarDinheiro(m.alvo)}</span></div>
                <Progresso valor={p} nivel={p >= 1 ? "sucesso" : undefined} rotulo={m.nome} />
                <div className="linha-entre" style={{ marginTop: 8 }}>
                  <span className="texto-3" style={{ fontSize: 12 }}>{m.prazo && p < 1 ? T.financas.porMes(formatarDinheiro(Math.ceil((m.alvo - m.guardado) / meses))) : `${Math.round(p * 100)}%`}</span>
                  <Botao pequeno icone={<Plus size={13} />} onClick={() => { setGuardando(m.id); setValor(""); setErros({}); }}>{T.financas.guardar}</Botao>
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
      <Modal aberto={nova} titulo={T.financas.novaMetaEconomia} aoFechar={() => setNova(false)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const novos: Record<string, string> = {};
            if (!nome.trim()) novos.nome = T.validacao.obrigatorio;
            const v = validarValor(alvo);
            if (v.erro) novos.alvo = v.erro;
            if (prazo && (!dataValida(prazo) || prazo <= hojeISO())) novos.prazo = T.validacao.dataFutura;
            setErros(novos);
            if (Object.keys(novos).length || v.valor == null) return;
            fin.criarMetaEconomia({ nome: nome.trim().slice(0, 60), alvo: v.valor, guardado: 0, prazo: prazo || undefined });
            setNova(false);
          }}
        >
          <Campo id="e-nome" rotulo={T.metas.nome} obrigatorio erro={erros.nome}>
            <input id="e-nome" className="campo" value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <div className="formulario-linha">
            <CampoDinheiro id="e-alvo" rotulo={T.financas.alvo} valor={alvo} aoMudar={setAlvo} erro={erros.alvo} obrigatorio />
            <Campo id="e-prazo" rotulo={T.financas.prazo} erro={erros.prazo}>
              <input id="e-prazo" type="date" className="campo" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </Campo>
          </div>
          <div className="formulario-acoes">
            <Botao onClick={() => setNova(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
          </div>
        </form>
      </Modal>
      <Modal aberto={!!guardando} titulo={T.financas.guardar} aoFechar={() => setGuardando(null)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = validarValor(valor);
            if (v.erro || v.valor == null || !guardando) return setErros({ valor: v.erro ?? T.validacao.valorInvalido });
            fin.guardarNaMeta(guardando, v.valor);
            setGuardando(null);
            void tocarSom("pop");
          }}
        >
          <CampoDinheiro id="e-valor" rotulo={T.financas.valor} valor={valor} aoMudar={setValor} erro={erros.valor} obrigatorio />
          <div className="formulario-acoes">
            <Botao onClick={() => setGuardando(null)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Divisao() {
  const fin = useFinancas();
  const avisar = useInterface((s) => s.avisar);
  const [nomePessoa, setNomePessoa] = useState("");
  const [erroPessoa, setErroPessoa] = useState("");
  const [nova, setNova] = useState(false);
  const [acerto, setAcerto] = useState<{ pessoaId: string; saldo: number } | null>(null);
  const [descricao, setDescricao] = useState("");
  const [total, setTotal] = useState("");
  const [pagador, setPagador] = useState(EU);
  const [participantes, setParticipantes] = useState<string[]>([EU]);
  const [modoDiv, setModoDiv] = useState<"iguais" | "valor" | "porcentagem">("iguais");
  const [partes, setPartes] = useState<Record<string, string>>({});
  const [contaId, setContaId] = useState("");
  const [contaAcerto, setContaAcerto] = useState("");
  const [valorAcerto, setValorAcerto] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [categoriaDiv, setCategoriaDiv] = useState({ id: "", nova: "" });
  const sugeridaDiv = !categoriaDiv.id && !categoriaDiv.nova && descricao ? fin.categorias.find((c) => c.id === fin.categorizar(descricao) && c.tipo === "despesa")?.id : undefined;
  const saldos = saldosComPessoas(fin);
  const simplificacao = simplificarDividas(fin);
  const nomeDe = (id: string) => (id === EU ? T.financas.eu : fin.pessoas.find((p) => p.id === id)?.nome ?? "");

  const salvarDivisao = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    if (!descricao.trim()) novos.descricao = T.validacao.obrigatorio;
    const v = validarValor(total);
    if (v.erro) novos.total = v.erro;
    if (participantes.length < 2) novos.participantes = T.financas.minimoParticipantes;
    if (pagador === EU && !contaId) novos.conta = T.validacao.contaObrigatoria;
    let valores: { pessoaId: string; valor: number }[] = [];
    if (v.valor != null && participantes.length >= 2) {
      if (modoDiv === "iguais") {
        const base = Math.floor(v.valor / participantes.length);
        const resto = v.valor - base * participantes.length;
        valores = participantes.map((p, i) => ({ pessoaId: p, valor: base + (i === 0 ? resto : 0) }));
      } else if (modoDiv === "valor") {
        valores = participantes.map((p) => ({ pessoaId: p, valor: lerValorEmCentavos(partes[p] || "0") ?? -1 }));
        if (valores.some((x) => x.valor < 0)) novos.partes = T.validacao.valorInvalido;
        const soma = somar(valores, (x) => x.valor);
        if (soma !== v.valor) novos.partes = T.validacao.partesNaoFecham(formatarDinheiro(v.valor - soma));
      } else {
        const pct = participantes.map((p) => Number((partes[p] || "0").replace(",", ".")));
        if (pct.some((x) => !Number.isFinite(x) || x < 0)) novos.partes = T.validacao.valorInvalido;
        const soma = pct.reduce((a, b) => a + b, 0);
        if (Math.abs(soma - 100) > 0.01) novos.partes = T.financas.porcentagemFecha(soma.toFixed(1).replace(".", ","));
        valores = participantes.map((p, i) => ({ pessoaId: p, valor: Math.round((v.valor! * pct[i]) / 100) }));
        const diferenca = v.valor - somar(valores, (x) => x.valor);
        if (valores[0]) valores[0].valor += diferenca;
      }
    }
    const escolhida = categoriaDiv.id || sugeridaDiv;
    const categoriaValida = fin.categorias.some((c) => c.id === escolhida && c.tipo === "despesa");
    if (!categoriaValida && !categoriaDiv.nova.trim()) novos.categoria = T.financas.categoriaObrigatoria;
    setErros(novos);
    if (Object.keys(novos).length || v.valor == null) return;
    const categoriaId = categoriaValida ? escolhida : fin.obterOuCriarCategoria(categoriaDiv.nova, "despesa").id;
    fin.dividir({ descricao: descricao.trim(), total: v.valor, pagadorId: pagador, partes: valores, data: hojeISO(), contaId: pagador === EU ? contaId : undefined, categoriaId });
    setNova(false);
    void tocarSom("pop");
  };

  return (
    <div className="grade">
      <Cartao className="col-4" titulo={T.financas.pessoas} icone={<Users size={16} />}>
        <form
          className="linha"
          style={{ alignItems: "flex-start", marginBottom: 12 }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const limpo = nomePessoa.trim();
            if (!limpo) return setErroPessoa(T.validacao.obrigatorio);
            if (fin.pessoas.some((p) => normalizarTexto(p.nome) === normalizarTexto(limpo))) return setErroPessoa(T.validacao.duplicado);
            fin.criarPessoa(limpo);
            setNomePessoa("");
            setErroPessoa("");
          }}
        >
          <div className="campo-grupo" style={{ flex: 1 }}>
            <input className="campo" value={nomePessoa} maxLength={40} placeholder={T.financas.novaPessoa} aria-label={T.financas.novaPessoa} aria-invalid={!!erroPessoa} onChange={(e) => { setNomePessoa(e.target.value); setErroPessoa(""); }} />
            {erroPessoa && <span className="campo-erro">{erroPessoa}</span>}
          </div>
          <Botao type="submit" soIcone icone={<Plus size={14} />} aria-label={T.financas.novaPessoa} />
        </form>
        {fin.pessoas.length === 0 ? <p className="texto-3">{T.financas.semPessoas}</p> : (
          <div className="lista">
            {fin.pessoas.map((p) => {
              const s = saldos.get(p.id) ?? 0;
              return (
                <div key={p.id} className="lista-item">
                  <span className="barra-avatar">{p.nome.slice(0, 1).toUpperCase()}</span>
                  <div className="lista-item-principal">
                    <span className="lista-item-titulo">{p.nome}</span>
                    <span className="lista-item-sub privado" style={{ color: s > 0 ? "var(--sucesso)" : s < 0 ? "var(--erro)" : undefined }}>
                      {s > 0 ? T.financas.teDeve(p.nome, formatarDinheiro(s)) : s < 0 ? T.financas.voceDeve(p.nome, formatarDinheiro(-s)) : T.financas.quites(p.nome)}
                    </span>
                  </div>
                  {s !== 0 && <Botao pequeno onClick={() => { setAcerto({ pessoaId: p.id, saldo: s }); setValorAcerto(centavosParaCampo(Math.abs(s))); setContaAcerto(fin.contas[0]?.id ?? ""); setErros({}); }}>{T.financas.registrarAcerto}</Botao>}
                </div>
              );
            })}
          </div>
        )}
      </Cartao>
      <Cartao className="col-8" titulo={T.financas.abas.divisao} icone={<Scale size={16} />} acoes={<Botao pequeno variante="primario" icone={<Plus size={13} />} disabled={fin.pessoas.length === 0} title={fin.pessoas.length === 0 ? T.financas.crieAPessoa : undefined} onClick={() => { setDescricao(""); setTotal(""); setPagador(EU); setParticipantes([EU, ...fin.pessoas.map((p) => p.id)]); setModoDiv("iguais"); setPartes({}); setContaId(fin.contas[0]?.id ?? ""); setCategoriaDiv({ id: "", nova: "" }); setErros({}); setNova(true); }}>{T.financas.novaDivisao}</Botao>}>
        {simplificacao.length > 0 && (
          <div className="coluna" style={{ gap: 4, marginBottom: 12 }}>
            <span className="rotulo-secao">{T.financas.simplificacao}</span>
            {simplificacao.map((s, i) => <span key={i} className="texto-2 privado">{T.financas.simplificar(nomeDe(s.de), nomeDe(s.para), formatarDinheiro(s.valor))}</span>)}
          </div>
        )}
        {fin.divisoes.length === 0 ? <Vazio titulo={T.financas.semDivisoes} /> : (
          <div className="lista">
            {[...fin.divisoes].sort((a, b) => b.data.localeCompare(a.data)).map((d) => (
              <div key={d.id} className="lista-item">
                <div className="lista-item-principal">
                  <span className="lista-item-titulo">{d.descricao}</span>
                  <span className="lista-item-sub">{T.financas.pagoPor(nomeDe(d.pagadorId))} . {d.partes.map((p) => `${nomeDe(p.pessoaId)} ${formatarDinheiro(p.valor)}`).join(", ")}</span>
                </div>
                <span className="numero privado">{formatarDinheiro(d.total)}</span>
                <div className="lista-item-acoes">
                  <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => { fin.excluirDivisao(d.id); avisar(T.geral.excluido); }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Cartao>
      <Modal aberto={nova} titulo={T.financas.novaDivisao} aoFechar={() => setNova(false)} largo>
        <form className="formulario" onSubmit={salvarDivisao} noValidate>
          <div className="formulario-linha">
            <Campo id="dv-desc" rotulo={T.financas.descricao} obrigatorio erro={erros.descricao}>
              <input id="dv-desc" className="campo" value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} />
            </Campo>
            <CampoDinheiro id="dv-total" rotulo={T.financas.valor} valor={total} aoMudar={setTotal} erro={erros.total} obrigatorio />
          </div>
          <div className="formulario-linha">
            <Campo id="dv-pag" rotulo={T.financas.quemPagou}>
              <select id="dv-pag" className="seletor" value={pagador} onChange={(e) => setPagador(e.target.value)}>
                <option value={EU}>{T.financas.eu}</option>
                {fin.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Campo>
            {pagador === EU && (
              <Campo id="dv-conta" rotulo={T.financas.conta} erro={erros.conta}>
                <select id="dv-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
                  {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
            )}
            <Campo id="dv-cat" rotulo={T.financas.categoria} obrigatorio erro={erros.categoria}>
              <SeletorDeCategoria
                id="dv-cat"
                tipo="despesa"
                categoriaId={categoriaDiv.id || sugeridaDiv || ""}
                novaCategoria={categoriaDiv.nova}
                invalido={!!erros.categoria}
                aoMudar={(id, nova) => { setCategoriaDiv({ id, nova }); setErros((e) => ({ ...e, categoria: "" })); }}
              />
            </Campo>
          </div>
          <div className="campo-grupo">
            <span className="campo-rotulo">{T.financas.modoDivisao}</span>
            <Segmentado rotulo={T.financas.modoDivisao} valor={modoDiv} aoMudar={setModoDiv} opcoes={[{ valor: "iguais", rotulo: T.financas.iguais }, { valor: "valor", rotulo: T.financas.porValor }, { valor: "porcentagem", rotulo: T.financas.porPorcentagem }]} />
          </div>
          <div className="campo-grupo">
            <span className="campo-rotulo">{T.financas.participantes}</span>
            {[EU, ...fin.pessoas.map((p) => p.id)].map((id) => (
              <div key={id} className="linha" style={{ minHeight: 36 }}>
                <CaixaMarcar marcada={participantes.includes(id)} rotulo={nomeDe(id)} aoMudar={(v) => setParticipantes((ps) => (v ? [...ps, id] : ps.filter((x) => x !== id)))} />
                <span style={{ flex: 1 }}>{nomeDe(id)}</span>
                {modoDiv !== "iguais" && participantes.includes(id) && (
                  <div className="campo-prefixo" style={{ width: 140 }}>
                    <span>{modoDiv === "valor" ? "R$" : "%"}</span>
                    <input className="campo" inputMode="decimal" value={partes[id] ?? ""} aria-label={nomeDe(id)} onChange={(e) => setPartes({ ...partes, [id]: e.target.value.replace(/[^\d.,]/g, "") })} />
                  </div>
                )}
              </div>
            ))}
            {(erros.participantes || erros.partes) && <span className="campo-erro">{erros.participantes || erros.partes}</span>}
          </div>
          <AvisoFaixa>{T.financas.divisaoOrcamento}</AvisoFaixa>
          <div className="formulario-acoes">
            <Botao onClick={() => setNova(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.salvar}</Botao>
          </div>
        </form>
      </Modal>
      <Modal aberto={!!acerto} titulo={T.financas.registrarAcerto} aoFechar={() => setAcerto(null)}>
        {acerto && (
          <form
            className="formulario"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const v = validarValor(valorAcerto);
              if (v.erro || v.valor == null) return setErros({ acerto: v.erro ?? T.validacao.valorInvalido });
              if (v.valor > Math.abs(acerto.saldo)) return setErros({ acerto: T.financas.acertoMaior });
              fin.registrarAcerto({ pessoaId: acerto.pessoaId, valor: acerto.saldo > 0 ? v.valor : -v.valor, data: hojeISO(), contaId: contaAcerto || undefined }, acerto.saldo);
              setAcerto(null);
              void tocarSom("approve");
            }}
          >
            <CampoDinheiro id="ac-valor" rotulo={T.financas.valor} valor={valorAcerto} aoMudar={setValorAcerto} erro={erros.acerto} obrigatorio />
            <Campo id="ac-conta" rotulo={T.financas.contaAcerto}>
              <select id="ac-conta" className="seletor" value={contaAcerto} onChange={(e) => setContaAcerto(e.target.value)}>
                <option value="">{T.financas.semLancamento}</option>
                {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <div className="formulario-acoes">
              <Botao onClick={() => setAcerto(null)}>{T.geral.cancelar}</Botao>
              <Botao type="submit" variante="primario">{T.geral.confirmar}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function Compras({ mes }: { mes: string }) {
  const fin = useFinancas();
  const [listaId, setListaId] = useState(fin.listas[0]?.id ?? "");
  const [novaLista, setNovaLista] = useState("");
  const [item, setItem] = useState("");
  const [qtd, setQtd] = useState("1");
  const [preco, setPreco] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [finalizando, setFinalizando] = useState(false);
  const [totalReal, setTotalReal] = useState("");
  const [contaId, setContaId] = useState("");
  const [categoriaCompra, setCategoriaCompra] = useState({ id: "", nova: "" });
  const lista = fin.listas.find((l) => l.id === listaId) ?? fin.listas[0];
  const estimado = lista ? somar(lista.itens, (i) => i.precoEstimado * i.quantidade) : 0;
  const marcados = lista ? lista.itens.filter((i) => i.marcado) : [];
  const categoria = fin.categorias.find((c) => c.id === lista?.categoriaId);
  const gastoCategoria = categoria ? gastoPorCategoria(fin, mes).get(categoria.id) ?? 0 : 0;
  const frequentes = Object.entries(fin.precos).filter(([k]) => !lista?.itens.some((i) => normalizarTexto(i.nome) === k)).slice(0, 8);

  return (
    <div className="duas-colunas">
      <Cartao>
        <form
          className="linha"
          style={{ marginBottom: 12, alignItems: "flex-start" }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!novaLista.trim()) return setErros({ lista: T.validacao.obrigatorio });
            const l = fin.criarLista(novaLista, fin.categorias.find((c) => normalizarTexto(c.nome) === "mercado")?.id);
            setListaId(l.id);
            setNovaLista("");
            setErros({});
          }}
        >
          <div className="campo-grupo" style={{ flex: 1 }}>
            <input className="campo" value={novaLista} maxLength={40} placeholder={T.financas.nomeLista} aria-label={T.financas.nomeLista} aria-invalid={!!erros.lista} onChange={(e) => setNovaLista(e.target.value)} />
            {erros.lista && <span className="campo-erro">{erros.lista}</span>}
          </div>
          <Botao type="submit" soIcone icone={<Plus size={14} />} aria-label={T.financas.novaLista} />
        </form>
        <div className="lista-lateral">
          {fin.listas.map((l) => (
            <button key={l.id} type="button" className="lista-lateral-item" aria-current={l.id === lista?.id} onClick={() => setListaId(l.id)}>
              <ShoppingCart size={13} />
              <span className="cortar">{l.nome}</span>
              <span className="texto-3 empurrar numero">{l.itens.length}</span>
            </button>
          ))}
        </div>
      </Cartao>
      {!lista ? <Cartao><Vazio icone={<ShoppingCart size={28} />} titulo={T.financas.semListas} /></Cartao> : (
        <Cartao
          titulo={lista.nome}
          icone={<ShoppingCart size={16} />}
          acoes={
            <>
              <select className="seletor" style={{ width: 160, height: 28 }} aria-label={T.financas.categoria} value={lista.categoriaId ?? ""} onChange={(e) => useFinancas.setState((s) => ({ listas: s.listas.map((x) => (x.id === lista.id ? { ...x, categoriaId: e.target.value || undefined } : x)) }))}>
                <option value="">{T.financas.semCategoria}</option>
                {fin.categorias.filter((c) => c.tipo === "despesa").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.excluirLista(lista.id)} />
            </>
          }
        >
          <form
            className="formulario-linha"
            style={{ alignItems: "end", marginBottom: 12, gridTemplateColumns: "2fr 80px 1fr auto" }}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const novos: Record<string, string> = {};
              if (!item.trim()) novos.item = T.validacao.obrigatorio;
              const q = Number(qtd);
              if (!Number.isInteger(q) || q < 1 || q > 999) novos.qtd = T.validacao.entre(1, 999);
              const p = preco ? lerValorEmCentavos(preco) : 0;
              if (p == null) novos.preco = T.validacao.valorInvalido;
              setErros(novos);
              if (Object.keys(novos).length) return;
              fin.adicionarItens(lista.id, [{ nome: item, quantidade: q, precoEstimado: p ?? 0 }]);
              setItem("");
              setQtd("1");
              setPreco("");
            }}
          >
            <Campo id="lc-item" rotulo={T.financas.novoItem} erro={erros.item}>
              <input id="lc-item" className="campo" value={item} maxLength={60} onChange={(e) => setItem(e.target.value)} />
            </Campo>
            <Campo id="lc-qtd" rotulo={T.financas.quantidade} erro={erros.qtd}>
              <input id="lc-qtd" className="campo" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))} />
            </Campo>
            <CampoDinheiro id="lc-preco" rotulo={T.financas.preco} valor={preco} aoMudar={setPreco} erro={erros.preco} />
            <Botao type="submit" icone={<Plus size={14} />}>{T.geral.adicionar}</Botao>
          </form>
          {frequentes.length > 0 && (
            <div className="coluna" style={{ gap: 4, marginBottom: 12 }}>
              <span className="rotulo-secao">{T.financas.sugestoes}</span>
              <div className="pilulas">
                {frequentes.map(([k, h]) => (
                  <button key={k} type="button" className="pilula" onClick={() => fin.adicionarItens(lista.id, [{ nome: k[0].toUpperCase() + k.slice(1), quantidade: 1, precoEstimado: h[h.length - 1].preco }])}>
                    <Plus size={11} />{k} . {T.financas.ultimoPreco(formatarDinheiro(h[h.length - 1].preco))}
                  </button>
                ))}
              </div>
            </div>
          )}
          {lista.itens.length === 0 ? <p className="texto-3">{T.financas.semItens}</p> : (
            <div className="lista">
              {lista.itens.map((i) => {
                const historico = fin.precos[normalizarTexto(i.nome)];
                return (
                  <div key={i.id} className="lista-item">
                    <CaixaMarcar marcada={i.marcado} rotulo={i.nome} aoMudar={(v) => fin.atualizarItem(lista.id, i.id, { marcado: v })} />
                    <div className="lista-item-principal">
                      <span className={`lista-item-titulo ${i.marcado ? "riscado" : ""}`}>{i.quantidade} x {i.nome}</span>
                      {historico && <span className="lista-item-sub">{T.financas.ultimoPreco(formatarDinheiro(historico[historico.length - 1].preco))}</span>}
                    </div>
                    <span className="numero privado texto-2">{i.precoEstimado ? formatarDinheiro(i.precoEstimado * i.quantidade) : ""}</span>
                    <div className="lista-item-acoes"><Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.removerItem(lista.id, i.id)} /></div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="linha-entre" style={{ marginTop: 16, flexWrap: "wrap" }}>
            <div className="coluna" style={{ gap: 0 }}>
              <span className="texto-2">{T.financas.totalEstimado}: <b className="privado">{formatarDinheiro(estimado)}</b></span>
              {categoria && categoria.orcamento > 0 && <span className="texto-3" style={{ fontSize: 12 }}>{T.financas.sobraOrcamento(formatarDinheiro(categoria.orcamento - gastoCategoria))}</span>}
            </div>
            <Botao variante="primario" disabled={marcados.length === 0 || fin.contas.length === 0} onClick={() => { setTotalReal(centavosParaCampo(somar(marcados, (i) => i.precoEstimado * i.quantidade))); setContaId(fin.contas[0]?.id ?? ""); setCategoriaCompra({ id: lista.categoriaId ?? "", nova: "" }); setErros({}); setFinalizando(true); }}>
              {T.financas.finalizarCompra} ({marcados.length})
            </Botao>
          </div>
        </Cartao>
      )}
      <Modal aberto={finalizando} titulo={T.financas.finalizarCompra} aoFechar={() => setFinalizando(false)}>
        <form
          className="formulario"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = validarValor(totalReal);
            const categoriaValida = fin.categorias.some((c) => c.id === categoriaCompra.id && c.tipo === "despesa");
            const novos: Record<string, string> = {};
            if (v.erro || v.valor == null) novos.total = v.erro ?? T.validacao.valorInvalido;
            if (!categoriaValida && !categoriaCompra.nova.trim()) novos.categoria = T.financas.categoriaObrigatoria;
            setErros(novos);
            if (Object.keys(novos).length || v.valor == null || !lista) return;
            const categoriaId = categoriaValida ? categoriaCompra.id : fin.obterOuCriarCategoria(categoriaCompra.nova, "despesa").id;
            if (!lista.categoriaId) useFinancas.setState((s) => ({ listas: s.listas.map((x) => (x.id === lista.id ? { ...x, categoriaId } : x)) }));
            fin.finalizarCompra(lista.id, contaId, v.valor, categoriaId);
            setFinalizando(false);
            void useAgentes.getState().trabalhar("operador", T.financas.compraDescricao(lista.nome), 400);
          }}
        >
          <CampoDinheiro id="fc-total" rotulo={T.financas.totalReal} valor={totalReal} aoMudar={setTotalReal} erro={erros.total} obrigatorio />
          <Campo id="fc-conta" rotulo={T.financas.conta}>
            <select id="fc-conta" className="seletor" value={contaId} onChange={(e) => setContaId(e.target.value)}>
              {fin.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo id="fc-cat" rotulo={T.financas.categoria} obrigatorio erro={erros.categoria}>
            <SeletorDeCategoria
              id="fc-cat"
              tipo="despesa"
              categoriaId={categoriaCompra.id}
              novaCategoria={categoriaCompra.nova}
              invalido={!!erros.categoria}
              aoMudar={(id, nova) => { setCategoriaCompra({ id, nova }); setErros((e) => ({ ...e, categoria: "" })); }}
            />
          </Campo>
          <div className="formulario-acoes">
            <Botao onClick={() => setFinalizando(false)}>{T.geral.cancelar}</Botao>
            <Botao type="submit" variante="primario">{T.geral.confirmar}</Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Relatorios({ mes, modo }: { mes: string; modo: Modo }) {
  const fin = useFinancas();
  const [contem_, setContem] = useState("");
  const [categoriaRegra, setCategoriaRegra] = useState("");
  const [erro, setErro] = useState("");
  const meses = Array.from({ length: 6 }, (_, i) => format(addMonths(deISO(`${mes}-01`), i - 5), "yyyy-MM"));
  const dados = meses.map((m) => gastoPorCategoria(fin, m, modo));
  const despesas = fin.categorias.filter((c) => c.tipo === "despesa");

  const exportar = () => {
    const cabecalho = [T.financas.data, T.financas.tipoConta, T.financas.descricao, T.financas.categoria, T.financas.conta, T.financas.valor].join(";");
    const linhas = fin.transacoes
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((t) => [t.data, T.financas.tipos[t.tipo], `"${t.descricao.replace(/"/g, "'")}"`, nomeCategoria(t.categoriaId, fin.categorias), fin.contas.find((c) => c.id === t.contaId)?.nome ?? "", centavosParaCampo(t.tipo === "despesa" ? -t.valor : t.valor)].join(";"));
    baixarArquivo(`niko-transacoes-${hojeISO()}.csv`, [cabecalho, ...linhas].join("\n"), "text/csv");
  };

  return (
    <div className="coluna" style={{ gap: 20 }}>
      <Cartao titulo={T.financas.relatorioMensal} icone={<BarChart3 size={16} />} acoes={<Botao pequeno icone={<Download size={13} />} onClick={exportar}>{T.financas.exportarCsv}</Botao>}>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>{T.financas.categoria}</th>
                {meses.map((m) => <th key={m} className="direita" style={{ textTransform: "capitalize" }}>{formatar(`${m}-01`, "MMM yy")}</th>)}
              </tr>
            </thead>
            <tbody>
              {despesas.map((c) => (
                <tr key={c.id}>
                  <td><span className="linha"><span className="ponto-cor" style={{ background: c.cor }} />{c.nome}</span></td>
                  {dados.map((d, i) => <td key={i} className="direita numero privado">{d.get(c.id) ? formatarDinheiro(d.get(c.id)!) : ""}</td>)}
                </tr>
              ))}
              <tr>
                <td><b>{T.financas.total}</b></td>
                {dados.map((d, i) => <td key={i} className="direita numero privado"><b>{formatarDinheiro(somar([...d.values()], (v) => v))}</b></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Cartao>
      <Cartao titulo={T.financas.regras} icone={<Sparkles size={16} />}>
        <form
          className="formulario-linha"
          style={{ alignItems: "end", marginBottom: 12 }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!contem_.trim() || !categoriaRegra) return setErro(T.validacao.obrigatorio);
            fin.criarRegra(contem_, categoriaRegra);
            setContem("");
            setErro("");
          }}
        >
          <Campo id="rg-contem" rotulo={T.financas.regraContem} erro={erro}>
            <input id="rg-contem" className="campo" value={contem_} maxLength={40} placeholder="IFOOD" onChange={(e) => setContem(e.target.value)} />
          </Campo>
          <Campo id="rg-cat" rotulo={T.financas.categoria}>
            <select id="rg-cat" className="seletor" value={categoriaRegra} onChange={(e) => setCategoriaRegra(e.target.value)}>
              <option value="">{T.financas.escolha}</option>
              {fin.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Botao type="submit" icone={<Plus size={14} />}>{T.financas.novaRegra}</Botao>
        </form>
        <div className="lista">
          {fin.regras.map((r) => (
            <div key={r.id} className="lista-item">
              <code>{r.contem}</code>
              <span className="lista-item-principal">{nomeCategoria(r.categoriaId, fin.categorias)}</span>
              <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => fin.excluirRegra(r.id)} />
            </div>
          ))}
        </div>
        <LinhaAlternador rotulo={T.financas.receberStripe} ligado={useConfig.getState().receberStripe} aoMudar={(v) => useConfig.getState().definir({ receberStripe: v })} />
      </Cartao>
    </div>
  );
}

function PrimeirosPassos({ aoCriarConta, aoLancar }: { aoCriarConta: () => void; aoLancar: () => void }) {
  const temConta = useFinancas((s) => s.contas.some((c) => !c.arquivada));
  const temLancamento = useFinancas((s) => s.transacoes.some((t) => !t.ajuste));
  if (temConta && temLancamento) return null;
  const passos = [
    { feito: temConta, titulo: T.financas.passos.conta, texto: T.financas.passos.contaTexto, botao: T.financas.criarConta, acao: aoCriarConta, liberado: true },
    { feito: temLancamento, titulo: T.financas.passos.lancar, texto: T.financas.passos.lancarTexto, botao: T.financas.novaTransacao, acao: aoLancar, liberado: temConta },
  ];
  return (
    <section className="cartao primeiros-passos" aria-label={T.financas.passos.titulo}>
      <div className="primeiros-passos-topo">
        <b>{T.financas.passos.titulo}</b>
        <span className="texto-2">{T.financas.passos.subtitulo}</span>
      </div>
      <ol className="primeiros-passos-lista">
        {passos.map((p, i) => (
          <li key={p.titulo} className="primeiros-passos-item" data-feito={p.feito || undefined} data-liberado={p.liberado || undefined}>
            <span className="primeiros-passos-numero" aria-hidden="true">{p.feito ? <Check size={13} /> : i + 1}</span>
            <div className="primeiros-passos-textos">
              <span className="primeiros-passos-titulo">{p.titulo}</span>
              <span className="texto-2">{p.texto}</span>
            </div>
            {!p.feito && (
              <Botao pequeno variante={p.liberado ? "primario" : "secundario"} disabled={!p.liberado} title={!p.liberado ? T.financas.passos.depoisDaConta : undefined} onClick={p.acao}>
                {p.botao}
              </Botao>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Financas() {
  const parametros = useInterface((s) => s.parametros);
  const [aba, setAba] = useState<Aba>((parametros.aba as Aba) || "visao");
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [modo, setModo] = useState<Modo>("competencia");
  const [nova, setNova] = useState(false);
  const [importar, setImportar] = useState(false);
  // Sem conta não dá para lançar: abre a criação de conta e, depois dela, segue para o que a pessoa queria fazer.
  const [contaAntes, setContaAntes] = useState<"transacao" | "importar" | "conta" | null>(null);
  const fin = useFinancas();
  const temConta = fin.contas.some((c) => !c.arquivada);

  const novaTransacao = () => (useFinancas.getState().contas.some((c) => !c.arquivada) ? setNova(true) : setContaAntes("transacao"));
  const importarExtrato = () => (useFinancas.getState().contas.some((c) => !c.arquivada) ? setImportar(true) : setContaAntes("importar"));

  useEffect(() => {
    if (parametros.aba) setAba(parametros.aba as Aba);
  }, [parametros.aba]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "financas") novaTransacao();
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const mostraMes = ["visao", "transacoes", "orcamento", "relatorios", "compras"].includes(aba);
  const totalMes = somar(gastosDoMes(fin, mes, modo), (t) => parteDoUsuario(t, fin.divisoes));

  return (
    <>
      <CabecalhoAba
        titulo={T.financas.titulo}
        subtitulo={T.financas.subtitulo}
        agente="operador"
        acoes={
          <>
            {!temConta && <Botao pequeno icone={<Landmark size={13} />} onClick={() => setContaAntes("conta")}>{T.financas.criarConta}</Botao>}
            <Botao variante="primario" pequeno icone={<Plus size={13} />} onClick={novaTransacao}>{T.financas.novaTransacao}</Botao>
            <Botao pequeno icone={<Upload size={13} />} onClick={importarExtrato}>{T.financas.importarExtrato}</Botao>
          </>
        }
      />
      <div className="financas-layout">
      <nav className="financas-nav" aria-label={T.financas.titulo}>
        {GRUPOS_ABA.map((g) => (
          <div key={g.nome} className="financas-nav-grupo">
            <span className="rotulo-secao">{g.nome}</span>
            {g.abas.map((a) => (
              <button key={a} type="button" className="lista-lateral-item" aria-current={aba === a} onClick={() => setAba(a)}>
                {ICONE_ABA[a]}
                <span className="cortar">{T.financas.abas[a]}</span>
              </button>
            ))}
          </div>
        ))}
        <select className="seletor financas-nav-select" value={aba} aria-label={T.financas.titulo} onChange={(e) => setAba(e.target.value as Aba)}>
          {(Object.keys(T.financas.abas) as Aba[]).map((a) => <option key={a} value={a}>{T.financas.abas[a]}</option>)}
        </select>
      </nav>
      <div className="financas-conteudo">
      {mostraMes && (
        <div className="barra-acoes">
          <input type="month" className="campo" style={{ width: 170, height: 32 }} value={mes} aria-label={T.financas.periodo} onChange={(e) => e.target.value && setMes(e.target.value)} />
          <Segmentado<Modo> rotulo={T.financas.competencia} valor={modo} aoMudar={setModo} opcoes={[{ valor: "competencia", rotulo: T.financas.competencia }, { valor: "caixa", rotulo: T.financas.caixa }]} />
          <span className="campo-dica">{T.financas.competenciaDica}</span>
          <span className="empurrar texto-2 privado">{T.financas.gastoNoMes(formatarDinheiro(totalMes))}</span>
        </div>
      )}
      <PrimeirosPassos aoCriarConta={() => setContaAntes("conta")} aoLancar={novaTransacao} />
      {aba === "visao" && <VisaoGeral modo={modo} mes={mes} />}
      {aba === "transacoes" && <Cartao><Transacoes mes={mes} buscaInicial={parametros.busca} /></Cartao>}
      {aba === "contas" && <Contas />}
      {aba === "cartoes" && <Cartoes />}
      {aba === "orcamento" && (
        <div className="coluna" style={{ gap: 20 }}>
          <Cartao><Orcamento mes={mes} modo={modo} /></Cartao>
          <GerenciarCategorias />
        </div>
      )}
      {aba === "recorrentes" && <Recorrentes />}
      {aba === "economia" && <Economia />}
      {aba === "divisao" && <Divisao />}
      {aba === "compras" && <Compras mes={mes} />}
      {aba === "relatorios" && <Relatorios mes={mes} modo={modo} />}
      </div>
      </div>
      <FormTransacao aberto={nova} aoFechar={() => setNova(false)} />
      <Importar aberto={importar} aoFechar={() => setImportar(false)} />
      <FormConta
        aberto={contaAntes !== null}
        aviso={contaAntes === "transacao" ? T.financas.contaAntesTransacao : contaAntes === "importar" ? T.financas.contaAntesImportar : undefined}
        aoFechar={() => setContaAntes(null)}
        aoCriar={() => {
          if (contaAntes === "transacao") setNova(true);
          if (contaAntes === "importar") setImportar(true);
        }}
      />
    </>
  );
}
