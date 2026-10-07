import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { useInterface } from "../../estado/interface";
import { capturarLivre } from "../../utilitarios/captura";
import { confirmarComando, faltaCategoria, tipoDeCategoriaDoCartao } from "../../utilitarios/comandos";
import { SeletorDeCategoria } from "../../componentes/SeletorDeCategoria";
import { T } from "../../textos/textos";
import { Botao } from "../../componentes/basicos";
import { formatarDinheiro } from "../../utilitarios/dinheiro";
import { tocarSom } from "../../ponte/sons";
import type { CartaoConfirmacao } from "../../tipos";

export function CapturaRapida() {
  const aberta = useInterface((s) => s.capturaAberta);
  const abrir = useInterface((s) => s.abrirCaptura);
  const avisar = useInterface((s) => s.avisar);
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

  return (
    <AnimatePresence>
      {aberta && (
        <motion.div className="sobreposicao sobreposicao-centro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} onPointerDown={(e) => e.target === e.currentTarget && fechar()}>
          <motion.div
            className="paleta captura"
            role="dialog"
            aria-modal="true"
            aria-label={T.captura.titulo}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", visualDuration: 0.3, bounce: 0.2 }}
            onKeyDown={(e) => e.key === "Escape" && fechar()}
          >
            <div className="paleta-campo">
              <Zap size={16} />
              {confirmacao ? (
                <div className="linha" style={{ flex: 1, flexWrap: "wrap" }}>
                  <span className="privado"><b>{formatarDinheiro(Number(confirmacao.dados.valor))}</b></span>
                  <span className="texto-2">{String(confirmacao.dados.descricao)}</span>
                  {tipoDeCategoriaDoCartao(confirmacao) && (
                    <span style={{ minWidth: 180, flex: "0 1 220px" }}>
                      <SeletorDeCategoria
                        tipo={tipoDeCategoriaDoCartao(confirmacao)!}
                        categoriaId={String(confirmacao.dados.categoriaId ?? "")}
                        novaCategoria={String(confirmacao.dados.novaCategoria ?? "")}
                        invalido={faltaCategoria(confirmacao)}
                        aoMudar={(categoriaId, novaCategoria) => setConfirmacao({ ...confirmacao, dados: { ...confirmacao.dados, categoriaId, novaCategoria } })}
                      />
                    </span>
                  )}
                  <span className="empurrar linha">
                    <Botao pequeno onClick={() => setConfirmacao(null)}>{T.geral.cancelar}</Botao>
                    <Botao
                      pequeno
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
                  </span>
                </div>
              ) : (
                <input
                  ref={campo}
                  value={texto}
                  maxLength={300}
                  aria-label={T.captura.titulo}
                  aria-invalid={erro ? "true" : "false"}
                  placeholder={T.captura.placeholder}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    setErro("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && enviar()}
                />
              )}
            </div>
            <div className="paleta-rodape">
              {erro ? (
                <span className="campo-erro"><AlertCircle size={12} />{erro}</span>
              ) : (
                <span className="texto-3 linha"><CheckCircle2 size={12} />{T.captura.dica}</span>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
