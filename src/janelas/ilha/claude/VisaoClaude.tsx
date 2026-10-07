import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell, Bot, Check, ChevronRight, CircleCheck, CircleX, Code2, Copy, FilePen, FileText, FolderOpen, FolderSearch, Globe, ListChecks, LoaderCircle, MessageSquare, Search, Settings, ShieldAlert, SquareTerminal, X, type LucideIcon,
} from "lucide-react";
import { useClaudeCode, type PassoClaude, type SessaoClaude, type PedidoDePermissao } from "../../../estado/claudeCode";
import { agentesDeCodigo, claudeCode, FERRAMENTAS_DE_CODIGO, type RegraSugerida } from "../../../ponte/claudeCode";
import { contarMudancas } from "../../../utilitarios/diff";
import { DiffCompacto } from "./DiffCompacto";
import { UsoDasIas } from "./UsoDasIas";
import { useIlha } from "../../../estado/ilha";
import { tocarSom } from "../../../ponte/sons";
import { Marca } from "../../../marcas/Marca";
import { TextoRico } from "../../../componentes/TextoRico";
import { T } from "../../../textos/textos";
import "./claude.css";
import { EtapasAnimadas } from "../animacoes/EtapasAnimadas";
import { fecharSessao } from "./usarClaudeCode";
import { ConfigDasFerramentas } from "./ConfigDasFerramentas";
import { MARCA_DA_FERRAMENTA, nomeDaFerramenta } from "./ferramentas";

const ESPERA_MS = 110_000;
const C = T.ilha.claude;

const ICONE_FERRAMENTA: Record<string, LucideIcon> = {
  Bash: SquareTerminal,
  PowerShell: SquareTerminal,
  Read: FileText,
  Write: FilePen,
  Edit: FilePen,
  MultiEdit: FilePen,
  NotebookEdit: FilePen,
  Glob: FolderSearch,
  LS: FolderSearch,
  Grep: Search,
  WebSearch: Globe,
  WebFetch: Globe,
  TodoWrite: ListChecks,
  Task: Bot,
  Agent: Bot,
};

function iconeDoPasso(p: PassoClaude): LucideIcon {
  if (p.tipo === "pedido") return MessageSquare;
  if (p.tipo === "falha" || p.tipo === "erro") return CircleX;
  if (p.tipo === "fim") return CircleCheck;
  if (p.tipo === "aviso") return Bell;
  if (p.tipo === "subagente") return Bot;
  return (p.ferramenta && ICONE_FERRAMENTA[p.ferramenta]) || SquareTerminal;
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function quandoFoi(iso: string, agora: number) {
  const min = Math.floor((agora - Date.parse(iso)) / 60000);
  return min < 1 ? C.agora : C.haMinutos(min);
}

function usarAgora(intervalo: number) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), intervalo);
    return () => window.clearInterval(t);
  }, [intervalo]);
  return agora;
}

function abrirProjeto(cwd: string, como: "vscode" | "pasta") {
  claudeCode.abrir(cwd, como).catch((e: Error) => {
    useIlha.getState().revelar({ texto: C.abrirFalhou[e.message] ?? C.abrirFalhou.outro, tipo: "alerta", marca: "claudecode", aba: "claude" }, 4500);
  });
}

function Permissao({ pedido, fila }: { pedido: PedidoDePermissao; fila: number }) {
  const agora = usarAgora(1000);
  const [enviando, setEnviando] = useState(false);
  const restante = Math.max(0, Math.ceil((Date.parse(pedido.recebidoEm) + ESPERA_MS - agora) / 1000));
  const regra = pedido.sugestoes[0];
  const textoRegra = regra ? `${regra.toolName}(${regra.ruleContent})` : "";
  const decidir = (decisao: "allow" | "deny" | "terminal", comRegra?: RegraSugerida) => {
    if (enviando) return;
    setEnviando(true);
    claudeCode
      .decidir(pedido.pedidoId, decisao, comRegra)
      .then(() => {
        useClaudeCode.getState().removerPedido(pedido.pedidoId);
        void tocarSom(decisao === "allow" ? "approve" : decisao === "deny" ? "slap" : "close", "avisos");
      })
      .catch(() => {
        useClaudeCode.getState().removerPedido(pedido.pedidoId);
        useIlha.getState().revelar({ texto: C.decisaoFalhou, tipo: "alerta", marca: "claudecode", aba: "claude" }, 5000);
      })
      .finally(() => setEnviando(false));
  };
  return (
    <div className="vsc-permissao" role="alertdialog" aria-label={C.querPermissao(nomeDaFerramenta(pedido.ferramentaDeCodigo), pedido.ferramenta)}>
      <div className="vsc-permissao-topo">
        <ShieldAlert size={15} />
        <Marca marca={MARCA_DA_FERRAMENTA[pedido.ferramentaDeCodigo]} tamanho={14} />
        <span>{C.querPermissao(nomeDaFerramenta(pedido.ferramentaDeCodigo), pedido.ferramenta)}</span>
        <span className="vsc-chip">{pedido.projeto}</span>
      </div>
      {pedido.alteracao ? <DiffCompacto alteracao={pedido.alteracao} maximo={80} /> : <pre className="vsc-codigo">{pedido.entrada}</pre>}
      <div className="vsc-permissao-rodape">
        <span className="vsc-dim">
          {C.expiraEm(restante)}
          {fila > 1 ? ` . ${C.maisPedidos(fila - 1)}` : ""}
        </span>
        <span className="vsc-barra-tempo" style={{ ["--resto" as string]: `${(restante / (ESPERA_MS / 1000)) * 100}%` }} />
        <button type="button" className="vsc-botao vsc-botao-link" disabled={enviando} onClick={() => decidir("terminal")}>
          {C.noTerminal}
        </button>
        <button type="button" className="vsc-botao" disabled={enviando} onClick={() => decidir("deny")}>
          {C.negar}
        </button>
        {regra && (
          <button type="button" className="vsc-botao vsc-botao-regra" disabled={enviando} title={C.sempreDica(textoRegra)} onClick={() => decidir("allow", regra)}>
            {C.sempre}
            <code>{textoRegra}</code>
          </button>
        )}
        <button type="button" className="vsc-botao vsc-botao-primario" disabled={enviando} onClick={() => decidir("allow")}>
          {enviando ? <LoaderCircle size={13} className="girando" /> : <Check size={13} />}
          {C.permitir}
        </button>
      </div>
    </div>
  );
}

function Atividade({ sessao }: { sessao: SessaoClaude }) {
  const lista = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  useEffect(() => {
    const el = lista.current;
    if (el && noFim.current) el.scrollTop = el.scrollHeight;
  }, [sessao.passos.length, sessao.id]);
  return (
    <div
      ref={lista}
      className="vsc-atividade"
      role="log"
      onScroll={(e) => {
        const el = e.currentTarget;
        noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {sessao.passos.map((p) => {
        const Icone = iconeDoPasso(p);
        const contagem = p.alteracao ? contarMudancas(p.alteracao) : null;
        const aberto = abertos.has(p.id);
        const conteudo = (
          <>
            <span className="vsc-hora">{hora(p.hora)}</span>
            <Icone size={13} className="vsc-icone" />
            <span className="vsc-rotulo">{p.rotulo}</span>
            {p.detalhe && <span className="vsc-detalhe">{p.detalhe}</span>}
            {contagem && (
              <span className="vsc-contagem">
                <span className="vsc-diff-mais">+{contagem.mais}</span>
                <span className="vsc-diff-menos">-{contagem.menos}</span>
                <ChevronRight size={12} className="vsc-seta" data-aberto={aberto || undefined} />
              </span>
            )}
          </>
        );
        return (
          <div key={p.id}>
            {p.alteracao ? (
              <button type="button" className="vsc-linha vsc-linha-botao" data-tipo={p.tipo} aria-expanded={aberto} title={C.verAlteracao} onClick={() => alternar(p.id)}>
                {conteudo}
              </button>
            ) : (
              <div className="vsc-linha" data-tipo={p.tipo}>
                {conteudo}
              </div>
            )}
            {aberto && p.alteracao && (
              <div className="vsc-linha-diff">
                <DiffCompacto alteracao={p.alteracao} />
              </div>
            )}
          </div>
        );
      })}
      {(sessao.estado === "trabalhando" || sessao.estado === "pensando") && (
        <div className="vsc-linha vsc-cursor">
          <span className="vsc-hora" />
          <LoaderCircle size={13} className="vsc-icone girando" />
          <span className="vsc-rotulo">{C.estados[sessao.estado]}</span>
        </div>
      )}
    </div>
  );
}

function Resposta({ sessao }: { sessao: SessaoClaude }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="vsc-editor">
      <div className="vsc-migalhas">
        <span>{sessao.projeto}</span>
        <span className="vsc-dim">›</span>
        <span>{C.resposta}</span>
        <button
          type="button"
          className="vsc-icone-botao"
          aria-label={C.copiarResposta}
          title={C.copiarResposta}
          onClick={() => {
            void navigator.clipboard.writeText(sessao.resposta ?? "").then(() => {
              setCopiado(true);
              window.setTimeout(() => setCopiado(false), 1400);
            });
          }}
        >
          {copiado ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      {sessao.pedido && (
        <div className="vsc-pedido">
          <span className="vsc-dim">{C.pedido}</span>
          <span>{sessao.pedido}</span>
        </div>
      )}
      <div className="vsc-markdown privado">
        <TextoRico texto={sessao.resposta ?? ""} />
      </div>
    </div>
  );
}

function SemSessoes({ conectado, aoConfigurar }: { conectado: boolean; aoConfigurar: () => void }) {
  return (
    <div className="vsc-vazio">
      <span className="vsc-vazio-logos" aria-hidden="true">
        {FERRAMENTAS_DE_CODIGO.map((f, i) => (
          <motion.span
            key={f}
            className="vsc-vazio-logo"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: [0, -3, 0] }}
            transition={{ opacity: { delay: i * 0.06 }, y: { delay: 0.4 + i * 0.18, duration: 2.4, repeat: Infinity, ease: "easeInOut" } }}
          >
            <Marca marca={MARCA_DA_FERRAMENTA[f]} tamanho={18} />
          </motion.span>
        ))}
      </span>
      <b>{conectado ? C.semSessoes : C.naoConectado}</b>
      <span className="vsc-dim">{conectado ? C.semSessoesDica : C.naoConectadoDica}</span>
      {!conectado && (
        <button type="button" className="vsc-botao vsc-botao-primario" onClick={aoConfigurar}>
          <Settings size={13} />
          {C.abrirConfiguracoes}
        </button>
      )}
    </div>
  );
}

export function VisaoClaude() {
  const sessoes = useClaudeCode((s) => s.sessoes);
  const ordem = useClaudeCode((s) => s.ordem);
  const pedidos = useClaudeCode((s) => s.pedidos);
  const focada = useClaudeCode((s) => s.focada);
  const focar = useClaudeCode((s) => s.focar);
  const agora = usarAgora(30000);
  const [conectado, setConectado] = useState(true);
  const [configAberta, setConfigAberta] = useState(false);
  const sessao = sessoes[focada ?? ""] ?? sessoes[ordem[0]];
  const pedido = pedidos.find((p) => p.sessao === sessao?.id) ?? pedidos[0];
  const [painel, setPainel] = useState<"resposta" | "atividade">("atividade");

  useEffect(() => {
    if (configAberta) return;
    void agentesDeCodigo
      .estado()
      .then((r) => setConectado(r.ferramentas.some((f) => f.instalado)))
      .catch(() => setConectado(false));
  }, [configAberta]);

  useEffect(() => {
    setPainel(sessao?.estado === "terminou" && sessao.resposta ? "resposta" : "atividade");
  }, [sessao?.id, sessao?.estado, sessao?.resposta]);

  return (
    <div className="ias">
    <div className="vsc">
      <div className="vsc-topo">
      <div className="vsc-abas" role="tablist">
        {ordem.map((id) => {
          const s = sessoes[id];
          if (!s) return null;
          const temPedido = pedidos.some((p) => p.sessao === id);
          return (
            <div key={id} className="vsc-aba" data-ativa={s.id === sessao?.id || undefined} data-estado={temPedido ? "aprovacao" : s.estado}>
              <button type="button" role="tab" aria-selected={s.id === sessao?.id} className="vsc-aba-botao" onClick={() => focar(id)} title={s.cwd}>
                <Marca marca={MARCA_DA_FERRAMENTA[s.ferramenta ?? "claude"]} tamanho={12} />
                <span className="vsc-aba-nome">{s.projeto}</span>
                <span className="vsc-ponto" />
              </button>
              <button type="button" className="vsc-aba-fechar" aria-label={C.fechar} title={C.fechar} onClick={() => fecharSessao(id)}>
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
        <span className="vsc-acoes-abas">
          {sessao?.modo && <span className="vsc-dim vsc-acoes-texto">{C.modos[sessao.modo] ?? sessao.modo}</span>}
          {sessao && <span className="vsc-dim vsc-acoes-texto">{quandoFoi(sessao.atualizadaEm, agora)}</span>}
          {sessao?.cwd && (
            <>
              <button type="button" className="vsc-icone-botao" aria-label={C.abrirVsCode} title={C.abrirVsCode} onClick={() => abrirProjeto(sessao.cwd, "vscode")}>
                <Code2 size={13} />
              </button>
              <button type="button" className="vsc-icone-botao" aria-label={C.abrirPasta} title={C.abrirPasta} onClick={() => abrirProjeto(sessao.cwd, "pasta")}>
                <FolderOpen size={13} />
              </button>
            </>
          )}
          <UsoDasIas />
          <button type="button" className="vsc-icone-botao vsc-engrenagem" aria-label={C.configurar} title={C.configurar} aria-pressed={configAberta} onClick={() => setConfigAberta((v) => !v)}>
            <Settings size={13} />
          </button>
        </span>
      </div>

      <div className="vsc-corpo">
        {!sessao ? (
          <SemSessoes conectado={conectado} aoConfigurar={() => setConfigAberta(true)} />
        ) : pedido ? (
          <Permissao pedido={pedido} fila={pedidos.length} />
        ) : (
          <>
            <div className="vsc-paineis" role="tablist">
              {sessao.resposta && (
                <button type="button" role="tab" aria-selected={painel === "resposta"} className="vsc-painel" onClick={() => setPainel("resposta")}>
                  {C.resposta}
                </button>
              )}
              <button type="button" role="tab" aria-selected={painel === "atividade"} className="vsc-painel" onClick={() => setPainel("atividade")}>
                {C.atividade}
              </button>
            </div>
            {painel === "atividade" && <EtapasAnimadas contexto={sessao.id} etapas={sessao.passos.filter((p) => p.tipo === "ferramenta" || p.tipo === "fim" || p.tipo === "erro").map((p) => ({ id: p.id, texto: `${p.rotulo} ${p.detalhe ?? ""}`.trim() }))} />}
            {painel === "resposta" && sessao.resposta ? <Resposta sessao={sessao} /> : <Atividade sessao={sessao} />}
          </>
        )}
      </div>
      <AnimatePresence>{configAberta && <ConfigDasFerramentas key="config" aoFechar={() => setConfigAberta(false)} />}</AnimatePresence>
    </div>
    </div>
  );
}
