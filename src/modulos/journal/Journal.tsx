import { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, getDaysInMonth, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Undo2, Redo2, Printer, Laugh, Smile, Meh, Frown, Moon, Repeat, ListTodo, PenLine, CalendarRange, Archive, Check, Minus } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Cartao, Botao, Campo, Modal, Segmentado, Vazio } from "../../componentes/basicos";
import { ItemTarefa } from "../../componentes/ItemTarefa";
import { Editor } from "../../componentes/Editor";
import { BarrasVerticais } from "../../componentes/Graficos";
import { useRotina, tarefasDoDia, habitoCumprido, DIA_VAZIO } from "../../estado/rotina";
import { usePomodoro } from "../../estado/pomodoro";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { T } from "../../textos/textos";
import { deISO, formatar, formatarData, hojeISO, paraISO, dataValida, diaDoMomento } from "../../utilitarios/datas";
import { interpretarQuando } from "../../utilitarios/linguagem";
import { sequenciaHabito } from "../../utilitarios/estatisticas";
import { EVENTO_NOVO } from "../../janelas/area-de-trabalho/usarAtalhos";
import type { Humor, TipoHabito } from "../../tipos";
import { somar } from "../../utilitarios/basicos";
import { CopoAgua } from "./CopoAgua";
import { imprimirMes } from "./impressao";

const ICONE_HUMOR: Record<Humor, React.ReactNode> = {
  otimo: <Laugh size={16} />,
  bom: <Smile size={16} />,
  neutro: <Meh size={16} />,
  dificil: <Frown size={16} />,
};

function MiniCalendario({ data, aoEscolher }: { data: string; aoEscolher: (d: string) => void }) {
  const [mes, setMes] = useState(() => startOfMonth(deISO(data)));
  const tarefas = useRotina((s) => s.tarefas);
  const dias = useRotina((s) => s.dias);
  useEffect(() => setMes(startOfMonth(deISO(data))), [data]);
  const grade = eachDayOfInterval({ start: startOfWeek(mes, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }) });
  const hoje = hojeISO();
  const comConteudo = new Set([...tarefas.filter((t) => t.data).map((t) => t.data as string), ...Object.entries(dias).filter(([, d]) => d.diario || d.nota || d.humor).map(([k]) => k)]);

  return (
    <div className="mini-calendario">
      <div className="linha-entre">
        <Botao pequeno soIcone variante="fantasma" icone={<ChevronLeft size={14} />} aria-label={T.geral.anterior} onClick={() => setMes(addMonths(mes, -1))} />
        <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{formatarData(mes, "MMMM yyyy")}</span>
        <Botao pequeno soIcone variante="fantasma" icone={<ChevronRight size={14} />} aria-label={T.geral.proximo} onClick={() => setMes(addMonths(mes, 1))} />
      </div>
      <div className="mini-calendario-grade" role="grid">
        {T.calendario.diasSemana.map((d) => (
          <span key={d} className="mini-calendario-cabecalho">{d.slice(0, 1)}</span>
        ))}
        {grade.map((d) => {
          const iso = paraISO(d);
          return (
            <button
              key={iso}
              type="button"
              className="mini-calendario-dia"
              data-fora={isSameMonth(d, mes) ? "nao" : "sim"}
              data-hoje={iso === hoje ? "sim" : "nao"}
              aria-pressed={iso === data}
              aria-label={formatar(iso, "d 'de' MMMM")}
              onClick={() => aoEscolher(iso)}
            >
              {d.getDate()}
              {comConteudo.has(iso) && <span className="mini-calendario-ponto" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GradeHabitos({ data }: { data: string }) {
  const habitos = useRotina((s) => s.habitos).filter((h) => !h.arquivado);
  const registros = useRotina((s) => s.registros);
  const registrar = useRotina((s) => s.registrarHabito);
  const atualizar = useRotina((s) => s.atualizarHabito);
  const [criando, setCriando] = useState(false);
  const mes = startOfMonth(deISO(data));
  const dias = Array.from({ length: getDaysInMonth(mes) }, (_, i) => paraISO(addDays(mes, i)));
  const hoje = hojeISO();

  return (
    <Cartao
      titulo={T.journal.habitos}
      icone={<Repeat size={16} />}
      className="col-12"
      acoes={<Botao pequeno icone={<Plus size={13} />} onClick={() => setCriando(true)}>{T.journal.novoHabito}</Botao>}
    >
      {habitos.length === 0 ? (
        <Vazio titulo={T.journal.semHabitos} texto={T.journal.semHabitosDica} acao={<Botao variante="primario" onClick={() => setCriando(true)}>{T.journal.novoHabito}</Botao>} />
      ) : (
        <div className="tabela-rolagem">
          <table className="grade-habitos">
            <thead>
              <tr>
                <th />
                {dias.map((d) => (
                  <th key={d} data-hoje={d === hoje ? "sim" : "nao"} data-selecionado={d === data ? "sim" : "nao"}>{Number(d.slice(8))}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {habitos.map((h) => {
                const cumpridos = dias.filter((d) => d <= hoje && habitoCumprido(h, registros[d]?.[h.id])).length;
                const passados = dias.filter((d) => d <= hoje).length;
                return (
                  <tr key={h.id}>
                    <th className="grade-habitos-nome">
                      <div className="coluna" style={{ gap: 0 }}>
                        <span className="cortar">{h.nome}</span>
                        <span className="texto-3" style={{ fontSize: 10, fontWeight: 400 }}>
                          {T.journal.sequencia(sequenciaHabito(h, registros))} . {T.journal.doMes(passados ? Math.round((cumpridos / passados) * 100) : 0)}
                        </span>
                      </div>
                    </th>
                    {dias.map((d) => {
                      const valor = registros[d]?.[h.id] ?? 0;
                      const feito = habitoCumprido(h, valor);
                      const futuro = d > hoje;
                      return (
                        <td key={d}>
                          <button
                            type="button"
                            className="celula-habito"
                            data-feito={feito ? "sim" : valor > 0 ? "parcial" : "nao"}
                            disabled={futuro}
                            aria-label={`${h.nome} ${formatar(d, "d/MM")}${h.tipo === "quantidade" ? `: ${valor} de ${h.meta}` : ""}`}
                            title={h.tipo === "quantidade" ? `${valor}/${h.meta} ${h.unidade}` : undefined}
                            onClick={() => registrar(d, h.id, h.tipo === "sim_nao" ? (feito ? 0 : 1) : valor >= h.meta ? 0 : valor + 1)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (h.tipo === "quantidade") registrar(d, h.id, valor - 1);
                            }}
                          >
                            {feito ? <Check size={11} strokeWidth={3} /> : h.tipo === "quantidade" && valor > 0 ? valor : ""}
                          </button>
                        </td>
                      );
                    })}
                    <td>
                      <Botao pequeno soIcone variante="fantasma" icone={<Archive size={13} />} aria-label={T.journal.arquivar} title={T.journal.arquivar} onClick={() => atualizar(h.id, { arquivado: true })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <NovoHabito aberto={criando} aoFechar={() => setCriando(false)} />
    </Cartao>
  );
}

function NovoHabito({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const criar = useRotina((s) => s.criarHabito);
  const habitos = useRotina((s) => s.habitos);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoHabito>("sim_nao");
  const [meta, setMeta] = useState("8");
  const [unidade, setUnidade] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (aberto) {
      setNome("");
      setTipo("sim_nao");
      setMeta("8");
      setUnidade("");
      setErros({});
    }
  }, [aberto]);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const novos: Record<string, string> = {};
    const limpo = nome.trim();
    if (!limpo) novos.nome = T.validacao.obrigatorio;
    else if (habitos.some((h) => !h.arquivado && h.nome.toLowerCase() === limpo.toLowerCase())) novos.nome = T.validacao.duplicado;
    const n = Number(meta);
    if (tipo === "quantidade" && (!Number.isInteger(n) || n < 1 || n > 1000)) novos.meta = T.validacao.entre(1, 1000);
    setErros(novos);
    if (Object.keys(novos).length) return;
    criar({ nome: limpo, tipo, meta: tipo === "quantidade" ? n : 1, unidade: unidade.trim().slice(0, 20) });
    aoFechar();
  };

  return (
    <Modal aberto={aberto} titulo={T.journal.novoHabito} aoFechar={aoFechar}>
      <form className="formulario" onSubmit={salvar} noValidate>
        <Campo id="h-nome" rotulo={T.journal.nomeHabito} obrigatorio erro={erros.nome}>
          <input id="h-nome" className="campo" value={nome} maxLength={60} aria-invalid={!!erros.nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <div className="campo-grupo">
          <span className="campo-rotulo">{T.journal.tipoHabito}</span>
          <Segmentado<TipoHabito> rotulo={T.journal.tipoHabito} valor={tipo} aoMudar={setTipo} opcoes={[{ valor: "sim_nao", rotulo: T.journal.simNao }, { valor: "quantidade", rotulo: T.journal.quantidade }]} />
        </div>
        {tipo === "quantidade" && (
          <div className="formulario-linha">
            <Campo id="h-meta" rotulo={T.journal.meta} obrigatorio erro={erros.meta}>
              <input id="h-meta" className="campo" inputMode="numeric" value={meta} aria-invalid={!!erros.meta} onChange={(e) => setMeta(e.target.value.replace(/\D/g, ""))} />
            </Campo>
            <Campo id="h-unidade" rotulo={T.journal.unidade} dica={T.journal.unidadeExemplo}>
              <input id="h-unidade" className="campo" value={unidade} maxLength={20} onChange={(e) => setUnidade(e.target.value)} />
            </Campo>
          </div>
        )}
        <div className="formulario-acoes">
          <Botao onClick={aoFechar}>{T.geral.cancelar}</Botao>
          <Botao type="submit" variante="primario">{T.geral.criar}</Botao>
        </div>
      </form>
    </Modal>
  );
}

export default function Journal() {
  const parametros = useInterface((s) => s.parametros);
  const avisar = useInterface((s) => s.avisar);
  const [data, setData] = useState(parametros.data && /^\d{4}-\d{2}-\d{2}$/.test(parametros.data) ? parametros.data : hojeISO());
  const tarefas = useRotina((s) => s.tarefas);
  const dias = useRotina((s) => s.dias);
  const criarTarefa = useRotina((s) => s.criarTarefa);
  const atualizarDia = useRotina((s) => s.atualizarDia);
  const desfazer = useRotina((s) => s.desfazer);
  const refazer = useRotina((s) => s.refazer);
  const podeDesfazer = useRotina((s) => s.passado.length > 0);
  const podeRefazer = useRotina((s) => s.futuro.length > 0);
  const sessoes = usePomodoro((s) => s.sessoes);
  const virada = useConfig((s) => s.viradaAs4h);
  const [novaTarefa, setNovaTarefa] = useState("");
  const [erroTarefa, setErroTarefa] = useState("");
  const [salvo, setSalvo] = useState(false);
  const dia = dias[data] ?? DIA_VAZIO;
  const doDia = tarefasDoDia(tarefas, data);
  const pomodoros = sessoes.filter((s) => s.etapa === "foco" && s.situacao === "concluida" && diaDoMomento(s.inicio) === data);
  const [vistaSemana, setVistaSemana] = useState<"dia" | "semana">("dia");

  useEffect(() => {
    if (parametros.data && /^\d{4}-\d{2}-\d{2}$/.test(parametros.data)) setData(parametros.data);
  }, [parametros.data]);

  useEffect(() => {
    const aoNovo = (e: Event) => {
      if ((e as CustomEvent).detail === "journal") document.getElementById("j-nova")?.focus();
    };
    window.addEventListener(EVENTO_NOVO, aoNovo);
    return () => window.removeEventListener(EVENTO_NOVO, aoNovo);
  }, []);

  const marcarSalvo = () => {
    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 1400);
  };

  const mudarDia = (parcial: Partial<typeof dia>) => {
    atualizarDia(data, parcial);
    marcarSalvo();
  };

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    const limpo = novaTarefa.trim();
    if (!limpo) {
      setErroTarefa(T.validacao.obrigatorio);
      return;
    }
    const q = interpretarQuando(limpo);
    criarTarefa({ titulo: q.resto || limpo, data: q.data ?? data, hora: q.hora });
    setNovaTarefa("");
    setErroTarefa("");
  };

  const mes = startOfMonth(deISO(data));
  const sonoDoMes = useMemo(() => {
    const lista = Array.from({ length: getDaysInMonth(mes) }, (_, i) => paraISO(addDays(mes, i)));
    return lista.map((d) => ({ rotulo: d.slice(8), valor: dias[d]?.sono ?? 0, detalhe: `${formatar(d, "d/MM")}: ${dias[d]?.sono ?? 0} h` }));
  }, [dias, mes]);
  const comSono = sonoDoMes.filter((s) => s.valor > 0);
  const media = comSono.length ? (somar(comSono, (s) => s.valor) / comSono.length).toFixed(1).replace(".", ",") : "0";
  const semana = eachDayOfInterval({ start: startOfWeek(deISO(data), { weekStartsOn: 1 }), end: endOfWeek(deISO(data), { weekStartsOn: 1 }) }).map(paraISO);

  return (
    <>
      <CabecalhoAba
        rotulo={formatar(data, "EEEE")}
        titulo={formatar(data, "d 'de' MMMM 'de' yyyy")}
        subtitulo={T.journal.subtitulo}
        agente="organizador"
        acoes={
          <>
            <Botao pequeno icone={<ChevronLeft size={13} />} onClick={() => setData(paraISO(addDays(deISO(data), -1)))}>{T.geral.anterior}</Botao>
            <Botao pequeno onClick={() => setData(hojeISO())} disabled={data === hojeISO()}>{T.journal.hoje}</Botao>
            <Botao pequeno onClick={() => setData(paraISO(addDays(deISO(hojeISO()), -1)))}>{T.geral.ontem}</Botao>
            <input type="date" className="campo" style={{ width: 160, height: 28 }} value={data} max={hojeISO()} aria-label={T.journal.irParaData} onChange={(e) => dataValida(e.target.value) && setData(e.target.value)} />
            <Botao pequeno icone={<ChevronRight size={13} />} onClick={() => setData(paraISO(addDays(deISO(data), 1)))}>{T.geral.proximo}</Botao>
            <Botao pequeno soIcone variante="fantasma" icone={<Undo2 size={14} />} aria-label={T.geral.desfazer} title={`${T.geral.desfazer} (Ctrl + Z)`} disabled={!podeDesfazer} onClick={desfazer} />
            <Botao pequeno soIcone variante="fantasma" icone={<Redo2 size={14} />} aria-label={T.geral.refazer} title={`${T.geral.refazer} (Ctrl + Shift + Z)`} disabled={!podeRefazer} onClick={refazer} />
            <Botao pequeno variante="fantasma" icone={<Printer size={13} />} onClick={() => imprimirMes(mes, () => avisar(T.journal.impressao.falhou))}>{T.journal.imprimirMes}</Botao>
            {virada && <span className="etiqueta">{T.journal.viradaAtiva}</span>}
            <span className="etiqueta etiqueta-sucesso" style={{ opacity: salvo ? 1 : 0, transition: "opacity 0.3s" }} aria-live="polite">{T.geral.salvo}</span>
          </>
        }
      />
      <div className="grade">
        <Cartao className="col-4">
          <MiniCalendario data={data} aoEscolher={setData} />
        </Cartao>
        <Cartao
          className="col-8"
          titulo={T.journal.tarefas}
          icone={<ListTodo size={16} />}
          acoes={pomodoros.length > 0 ? <span className="etiqueta">{T.journal.pomodorosDoDia(pomodoros.length, somar(pomodoros, (p) => p.minutos))}</span> : undefined}
        >
          {doDia.length === 0 ? <p className="texto-3" style={{ padding: "8px 0" }}>{T.journal.semTarefas}</p> : doDia.map((t) => <ItemTarefa key={t.id} tarefa={t} />)}
          <form onSubmit={adicionar} className="linha" style={{ marginTop: 8, alignItems: "flex-start" }} noValidate>
            <div className="campo-grupo" style={{ flex: 1 }}>
              <input
                id="j-nova"
                className="campo"
                value={novaTarefa}
                maxLength={200}
                placeholder={T.journal.novaTarefa}
                aria-label={T.journal.novaTarefa}
                aria-invalid={!!erroTarefa}
                onChange={(e) => {
                  setNovaTarefa(e.target.value);
                  setErroTarefa("");
                }}
              />
              {erroTarefa && <span className="campo-erro">{erroTarefa}</span>}
            </div>
            <Botao type="submit" variante="primario" icone={<Plus size={14} />}>{T.geral.adicionar}</Botao>
          </form>
        </Cartao>

        <Cartao className="col-4" titulo={T.journal.humor} icone={<Smile size={16} />}>
          <div className="segmentado" role="radiogroup" aria-label={T.journal.humor} style={{ width: "100%" }}>
            {(Object.keys(T.humor) as Humor[]).map((h) => (
              <button key={h} type="button" role="radio" aria-checked={dia.humor === h} aria-selected={dia.humor === h} style={{ flex: 1, justifyContent: "center" }} onClick={() => mudarDia({ humor: dia.humor === h ? undefined : h })}>
                {ICONE_HUMOR[h]}
                <span>{T.humor[h]}</span>
              </button>
            ))}
          </div>
        </Cartao>

        <Cartao className="col-8" titulo={T.journal.sono} icone={<Moon size={16} />} acoes={<span className="texto-3" style={{ fontSize: 12 }}>{T.journal.mediaSono(media)}</span>}>
          <div className="linha" style={{ gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <div className="linha">
              <Botao pequeno soIcone icone={<Minus size={14} />} aria-label="-0,5" onClick={() => mudarDia({ sono: Math.max(0, (dia.sono ?? 0) - 0.5) })} />
              <span className="numero-grande" style={{ minWidth: 64, textAlign: "center" }}>{(dia.sono ?? 0).toFixed(1).replace(".", ",")}</span>
              <Botao pequeno soIcone icone={<Plus size={14} />} aria-label="+0,5" onClick={() => mudarDia({ sono: Math.min(16, (dia.sono ?? 0) + 0.5) })} />
              <span className="texto-3">{T.journal.horasSono}</span>
            </div>
            <label className="linha texto-2" style={{ fontSize: 12 }}>
              {T.journal.dormiu}
              <input type="time" className="campo" style={{ width: 110, height: 30 }} value={dia.dormiu ?? ""} onChange={(e) => mudarDia({ dormiu: e.target.value || undefined })} />
            </label>
            <label className="linha texto-2" style={{ fontSize: 12 }}>
              {T.journal.acordou}
              <input type="time" className="campo" style={{ width: 110, height: 30 }} value={dia.acordou ?? ""} onChange={(e) => mudarDia({ acordou: e.target.value || undefined })} />
            </label>
          </div>
          <BarrasVerticais barras={sonoDoMes} formatar={(v) => `${v} h`} altura={90} aoEscolher={(i) => setData(paraISO(addDays(mes, i)))} selecionada={Number(data.slice(8)) - 1} />
        </Cartao>

        <CopoAgua data={data} />
        <Cartao className="col-8" titulo={T.journal.diario} icone={<PenLine size={16} />}>
          <Editor chave={`diario-${data}`} conteudo={dia.diario} placeholder={T.journal.diarioVazio} aoMudar={(html) => mudarDia({ diario: html })} />
        </Cartao>

        <Cartao
          className="col-12"
          titulo={T.journal.semana}
          icone={<CalendarRange size={16} />}
          acoes={<Segmentado rotulo={T.journal.semana} valor={vistaSemana} aoMudar={setVistaSemana} opcoes={[{ valor: "dia", rotulo: T.journal.vistaDia }, { valor: "semana", rotulo: T.calendario.vistas.semana }]} />}
        >
          <div className="tabela-rolagem">
            <table className="tabela tabela-semana">
              <thead>
                <tr>
                  <th />
                  {(vistaSemana === "semana" ? semana : [data]).map((d) => (
                    <th key={d} style={{ textTransform: "capitalize" }}>{formatar(d, "EEE d")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["manha", "tarde", "noite"] as const).map((p) => (
                  <tr key={p}>
                    <th>{T.journal[p]}</th>
                    {(vistaSemana === "semana" ? semana : [data]).map((d) => (
                      <td key={d}>
                        <input
                          className="campo"
                          style={{ height: 30, minWidth: 110 }}
                          maxLength={120}
                          aria-label={`${T.journal[p]} ${format(deISO(d), "dd/MM")}`}
                          value={(dias[d] ?? DIA_VAZIO)[p]}
                          onChange={(e) => {
                            atualizarDia(d, { [p]: e.target.value });
                            marcarSalvo();
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>

        <GradeHabitos data={data} />
      </div>
    </>
  );
}
