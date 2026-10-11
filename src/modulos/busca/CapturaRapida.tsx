import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Bell, Banknote, CircleCheck, CornerDownLeft, Link2, Receipt, StickyNote } from "lucide-react";
import { useInterface } from "../../estado/interface";
import { useConfig } from "../../estado/configuracoes";
import { capturarLivre, tiposDeCapturaLigados } from "../../utilitarios/captura";
import { confirmarComando, faltaCategoria, tipoDeCategoriaDoCartao } from "../../utilitarios/comandos";
import { SeletorDeCategoria } from "../../componentes/SeletorDeCategoria";
import { T } from "../../textos/textos";
import { Botao } from "../../componentes/basicos";
import { formatarDinheiro } from "../../utilitarios/dinheiro";
import { normalizarTexto, urlSegura } from "../../utilitarios/basicos";
import { formatarTeclas } from "../../utilitarios/atalhos";
import { funcaoLigada } from "../../utilitarios/funcoes";
import { tocarSom } from "../../ponte/sons";
import type { CartaoConfirmacao } from "../../tipos";

type TipoChip = keyof typeof T.captura.tipos;

const ORDEM_CHIPS: TipoChip[] = ["tarefa", "gasto", "receita", "link", "nota", "lembrete"];

const ICONE_CHIP: Record<TipoChip, React.ReactNode> = {
  tarefa: <CircleCheck size={12} />,
  gasto: <Receipt size={12} />,
  receita: <Banknote size={12} />,
  link: <Link2 size={12} />,
  nota: <StickyNote size={12} />,
  lembrete: <Bell size={12} />,
};

function tipoDetectado(texto: string): TipoChip | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const comando = limpo.startsWith("/");
  const [primeira] = (comando ? limpo.slice(1) : limpo).split(/\s+/);
  const chave = normalizarTexto(primeira ?? "").replace(/:$/, "");
  if ((ORDEM_CHIPS as string[]).includes(chave)) return chave as TipoChip;
  if (comando) return null;
  if (urlSegura(primeira ?? "")) return "link";
  return "tarefa";
}

export function CapturaRapida() {
  const aberta = useInterface((s) => s.capturaAberta);
  const abrir = useInterface((s) => s.abrirCaptura);
  const avisar = useInterface((s) => s.avisar);
  const desligadas = useConfig((s) => s.funcoesDesligadas);
  const atalho = useConfig((s) => s.atalhosGlobais.captura);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [confirmacao, setConfirmacao] = useState<CartaoConfirmacao | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberta) return;
    setTexto("");
    setErro("");
    setConfirmacao(null);
    window.setTimeout(() => campo.current?.focus(), 20);
  }, [aberta]);

  const chips = useMemo(() => {
    const ligados: string[] = tiposDeCapturaLigados(desligadas);
    return ORDEM_CHIPS.filter((t) => (t === "receita" ? funcaoLigada("financas", desligadas) : ligados.includes(t)));
  }, [desligadas]);
  const detectado = tipoDetectado(texto);
  const teclas = atalho ? formatarTeclas(atalho).split(" + ") : [];

  const fechar = () => abrir(false);

  const enviar = () => {
    if (!texto.trim()) {
      setErro(T.validacao.obrigatorio);
      return;
    }
    const r = capturarLivre(texto);
    if (r.confirmacao) {
      setConfirmacao(r.confirmacao);
      return;
    }
    if (!r.ok) {
      setErro(r.resposta);
      return;
    }
    void tocarSom("pop");
    avisar(r.resposta);
    fechar();
  };

  const tipoCartao: TipoChip = confirmacao?.tipo === "receita" ? "receita" : "gasto";

  return (
    <AnimatePresence>
      {aberta && (
        <motion.div className="estilo-sistema busca-fundo captura-fundo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} onPointerDown={(e) => e.target === e.currentTarget && fechar()}>
          <motion.div
            className="busca-caixa captura-caixa"
            role="dialog"
            aria-modal="true"
            aria-label={T.captura.titulo}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", visualDuration: 0.3, bounce: 0.2 }}
            onKeyDown={(e) => e.key === "Escape" && fechar()}
          >
            <div className="captura-topo">
              <span className="captura-rotulo">{T.captura.titulo}</span>
              {teclas.length > 0 && (
                <span className="captura-teclas">
                  {teclas.map((t) => <kbd key={t} className="busca-tecla">{t}</kbd>)}
                </span>
              )}
            </div>
            <input
              ref={campo}
              className="captura-texto"
              value={texto}
              maxLength={300}
              readOnly={!!confirmacao}
              aria-label={T.captura.titulo}
              aria-invalid={erro ? "true" : "false"}
              placeholder={T.captura.placeholder}
              onChange={(e) => {
                setTexto(e.target.value);
                setErro("");
              }}
              onKeyDown={(e) => e.key === "Enter" && !confirmacao && enviar()}
            />
            {chips.length > 0 && (
              <div className="captura-tipos" aria-hidden="true">
                {chips.map((t) => (
                  <span key={t} className="captura-tipo" data-ativo={detectado === t ? "sim" : undefined}>
                    {ICONE_CHIP[t]}
                    {T.captura.tipos[t]}
                  </span>
                ))}
              </div>
            )}
            {confirmacao && (
              <div className="captura-cartao">
                <div className="captura-cartao-linha">
                  <span className="captura-cartao-icone" data-tipo={tipoCartao}>{tipoCartao === "receita" ? <Banknote size={15} /> : <Receipt size={15} />}</span>
                  <span className="captura-cartao-texto">
                    <span className="captura-cartao-titulo">{String(confirmacao.dados.descricao)}</span>
                    {(confirmacao.tipo === "gasto" || confirmacao.tipo === "receita") && <span className="captura-cartao-sub">{T.captura.tipos[tipoCartao]}</span>}
                  </span>
                  <span className="captura-cartao-valor privado">{formatarDinheiro(Number(confirmacao.dados.valor))}</span>
                </div>
                {tipoDeCategoriaDoCartao(confirmacao) && (
                  <SeletorDeCategoria
                    tipo={tipoDeCategoriaDoCartao(confirmacao)!}
                    categoriaId={String(confirmacao.dados.categoriaId ?? "")}
                    novaCategoria={String(confirmacao.dados.novaCategoria ?? "")}
                    invalido={faltaCategoria(confirmacao)}
                    aoMudar={(categoriaId, novaCategoria) => setConfirmacao({ ...confirmacao, dados: { ...confirmacao.dados, categoriaId, novaCategoria } })}
                  />
                )}
              </div>
            )}
            <div className="captura-rodape">
              {erro ? (
                <span className="captura-dica campo-erro" role="alert"><AlertCircle size={12} />{erro}</span>
              ) : (
                <span className="captura-dica">{T.captura.dica}</span>
              )}
              {confirmacao ? (
                <>
                  <Botao onClick={() => setConfirmacao(null)}>{T.geral.cancelar}</Botao>
                  <Botao
                    variante="primario"
                    disabled={faltaCategoria(confirmacao)}
                    title={faltaCategoria(confirmacao) ? T.financas.categoriaObrigatoria : undefined}
                    autoFocus
                    onClick={() => {
                      void Promise.resolve(confirmarComando(confirmacao)).then(avisar);
                      void tocarSom("approve");
                      fechar();
                    }}
                  >
                    {T.geral.confirmar}
                  </Botao>
                </>
              ) : (
                <Botao variante="primario" className="captura-enviar" onClick={enviar}>
                  {T.captura.capturar}
                  <CornerDownLeft size={12} />
                </Botao>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
