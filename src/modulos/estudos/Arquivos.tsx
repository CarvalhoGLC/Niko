import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Eye, ExternalLink, File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, LoaderCircle, Presentation, ScanText, Search, Trash2, Upload } from "lucide-react";
import { Botao, ConfirmarModal, Modal, Vazio, AvisoFaixa } from "../../componentes/basicos";
import { Paginacao, usarPaginacao } from "../../componentes/Paginacao";
import { ZonaDeSoltar, useArrastarArquivos } from "../../componentes/AnexosChat";
import { useInterface } from "../../estado/interface";
import { useComunicacao } from "../../estado/comunicacao";
import { enviarAoTime, ocupado as chatOcupado } from "../../estado/conversando";
import { extrairTexto, podeExtrairTexto, type TextoExtraido } from "../../utilitarios/leitorDeArquivos";
import type { AcaoAnexo } from "../../utilitarios/recursosChat";
import { tocarSom } from "../../ponte/sons";
import { formatarTamanho } from "../../utilitarios/anexos";
import { formatar } from "../../utilitarios/datas";
import { gerarId } from "../../utilitarios/basicos";
import {
  abrirNoPrograma, baixarArquivo, enviarArquivo, excluirArquivo, extensaoDe, formaDeVer, lerConteudo, listarArquivos, EXTENSOES_ACEITAS, LIMITE_ARQUIVO, type ArquivoDaMateria,
} from "../../ponte/arquivos";
import { T } from "../../textos/textos";
import type { Materia } from "../../tipos";

type CodigoDeErro = keyof typeof T.estudos.arquivos.erros;

const LIMITE_TEXTO = 2 * 1024 * 1024;

type CodigoDeLeitura = keyof typeof T.estudos.arquivos.leitura;

function mensagemDeErro(e: unknown, nome: string): string {
  const codigo = (e as Error)?.message ?? "";
  if (Object.hasOwn(T.estudos.arquivos.leitura, codigo)) return T.estudos.arquivos.leitura[codigo as CodigoDeLeitura](nome);
  return (T.estudos.arquivos.erros[codigo as CodigoDeErro] ?? T.estudos.arquivos.erros.outro)(nome);
}

function descreverOrigem(e: TextoExtraido): string {
  const O = T.estudos.arquivos.origens;
  if (e.origem === "pdf") return O.pdf(e.paginas ?? 0);
  if (e.origem === "pdf_ocr") return O.pdf_ocr(e.paginas ?? 0, e.paginasLidasComOcr ?? 0);
  return O[e.origem];
}

function TextoDoArquivo({ aberto, aoFechar }: { aberto: { arquivo: ArquivoDaMateria; extraido: TextoExtraido } | null; aoFechar: () => void }) {
  const avisar = useInterface((s) => s.avisar);
  return (
    <Modal aberto={!!aberto} titulo={aberto ? T.estudos.arquivos.textoDe(aberto.arquivo.nome) : ""} aoFechar={aoFechar} largo>
      {aberto && (
        <div className="visualizador">
          <AvisoFaixa>{descreverOrigem(aberto.extraido)}</AvisoFaixa>
          <div className="visualizador-quadro" data-forma="texto">
            <pre className="visualizador-texto">{aberto.extraido.texto}</pre>
          </div>
          <div className="formulario-acoes">
            <Botao
              variante="primario"
              icone={<Copy size={14} />}
              onClick={() => {
                void navigator.clipboard.writeText(aberto.extraido.texto).then(() => avisar(T.estudos.arquivos.copiado));
              }}
            >
              {T.estudos.arquivos.copiar}
            </Botao>
          </div>
        </div>
      )}
    </Modal>
  );
}

function IconeDoArquivo({ extensao }: { extensao: string }) {
  const forma = formaDeVer(extensao);
  if (forma === "pdf" || forma === "texto" || ["doc", "docx", "odt", "rtf", "epub"].includes(extensao)) return <FileText size={16} />;
  if (forma === "imagem") return <FileImage size={16} />;
  if (forma === "audio") return <FileAudio size={16} />;
  if (forma === "video") return <FileVideo size={16} />;
  if (["ppt", "pptx", "odp"].includes(extensao)) return <Presentation size={16} />;
  if (["xls", "xlsx", "ods", "csv"].includes(extensao)) return <FileSpreadsheet size={16} />;
  if (["zip", "rar", "7z"].includes(extensao)) return <FileArchive size={16} />;
  return <File size={16} />;
}

interface Envio {
  id: string;
  nome: string;
  tamanho: number;
}

function Visualizador({ materiaId, arquivo, aoFechar, aoBaixar, aoAbrir, aoVerTexto }: { materiaId: string; arquivo: ArquivoDaMateria | null; aoFechar: () => void; aoBaixar: (a: ArquivoDaMateria) => void; aoAbrir: (a: ArquivoDaMateria) => void; aoVerTexto: (a: ArquivoDaMateria) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [texto, setTexto] = useState<{ conteudo: string; cortado: boolean } | null>(null);
  const [erro, setErro] = useState("");
  const forma = arquivo ? formaDeVer(arquivo.extensao) : "programa";

  useEffect(() => {
    setUrl(null);
    setTexto(null);
    setErro("");
    if (!arquivo || forma === "programa") return;
    let vivo = true;
    let criada: string | null = null;
    lerConteudo(materiaId, arquivo.id)
      .then(async (blob) => {
        if (!vivo) return;
        if (forma === "texto") {
          const conteudo = await blob.slice(0, LIMITE_TEXTO).text();
          if (vivo) setTexto({ conteudo, cortado: blob.size > LIMITE_TEXTO });
          return;
        }
        criada = URL.createObjectURL(blob);
        setUrl(criada);
      })
      .catch((e) => vivo && setErro(mensagemDeErro(e, arquivo.nome)));
    return () => {
      vivo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [arquivo, forma, materiaId]);

  const carregando = !erro && forma !== "programa" && !url && !texto;

  return (
    <Modal aberto={!!arquivo} titulo={arquivo?.nome ?? ""} aoFechar={aoFechar} largo>
      {arquivo && (
        <div className="visualizador">
          <div className="visualizador-quadro" data-forma={forma}>
            {erro && <AvisoFaixa tipo="erro">{erro}</AvisoFaixa>}
            {carregando && (
              <span className="visualizador-carregando">
                <LoaderCircle size={18} className="girando" />
                {T.estudos.arquivos.carregando}
              </span>
            )}
            {forma === "programa" && <Vazio icone={<IconeDoArquivo extensao={arquivo.extensao} />} titulo={arquivo.nome} texto={T.estudos.arquivos.semPrevia} />}
            {url && forma === "pdf" && <iframe src={url} title={arquivo.nome} className="visualizador-pdf" />}
            {url && forma === "imagem" && <img src={url} alt={arquivo.nome} className="visualizador-imagem" />}
            {url && forma === "video" && <video src={url} controls className="visualizador-midia" />}
            {url && forma === "audio" && <audio src={url} controls className="visualizador-audio" />}
            {texto && (
              <>
                {texto.cortado && <AvisoFaixa>{T.estudos.arquivos.textoCortado}</AvisoFaixa>}
                <pre className="visualizador-texto">{texto.conteudo}</pre>
              </>
            )}
          </div>
          <div className="formulario-acoes">
            <span className="texto-3 empurrar">{formatarTamanho(arquivo.tamanho)}</span>
            {podeExtrairTexto(arquivo.nome) && <Botao icone={<ScanText size={14} />} onClick={() => aoVerTexto(arquivo)}>{T.estudos.arquivos.verTexto}</Botao>}
            <Botao icone={<ExternalLink size={14} />} onClick={() => aoAbrir(arquivo)}>{T.estudos.arquivos.abrirNoPrograma}</Botao>
            <Botao variante="primario" icone={<Download size={14} />} onClick={() => aoBaixar(arquivo)}>{T.estudos.arquivos.baixar}</Botao>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Arquivos({ materia }: { materia: Materia }) {
  const avisar = useInterface((s) => s.avisar);
  const [arquivos, setArquivos] = useState<ArquivoDaMateria[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [falhaLista, setFalhaLista] = useState(false);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [busca, setBusca] = useState("");
  const [vendo, setVendo] = useState<ArquivoDaMateria | null>(null);
  const [excluindo, setExcluindo] = useState<ArquivoDaMateria | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const recarregar = useCallback(async () => {
    try {
      setArquivos(await listarArquivos(materia.id));
      setFalhaLista(false);
    } catch {
      setFalhaLista(true);
    } finally {
      setCarregado(true);
    }
  }, [materia.id]);

  useEffect(() => {
    setCarregado(false);
    setArquivos([]);
    setBusca("");
    void recarregar();
    const aoFocar = () => void recarregar();
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [recarregar]);

  const enviar = useCallback(
    (lista: File[]) => {
      for (const arquivo of lista) {
        const extensao = extensaoDe(arquivo.name);
        if (!EXTENSOES_ACEITAS.includes(extensao)) {
          avisar(T.estudos.arquivos.erros.tipo_nao_suportado(arquivo.name));
          void tocarSom("error", "avisos");
          continue;
        }
        if (arquivo.size > LIMITE_ARQUIVO) {
          avisar(T.estudos.arquivos.erros.arquivo_grande(arquivo.name));
          void tocarSom("error", "avisos");
          continue;
        }
        if (arquivo.size === 0) {
          avisar(T.estudos.arquivos.erros.arquivo_vazio(arquivo.name));
          continue;
        }
        const envio = { id: gerarId(), nome: arquivo.name, tamanho: arquivo.size };
        setEnvios((e) => [...e, envio]);
        enviarArquivo(materia.id, arquivo)
          .then((novo) => {
            setArquivos((a) => [novo, ...a.filter((x) => x.id !== novo.id)]);
            void tocarSom("approve", "interface");
          })
          .catch((e) => {
            avisar(mensagemDeErro(e, arquivo.name));
            void tocarSom("error", "avisos");
          })
          .finally(() => setEnvios((e) => e.filter((x) => x.id !== envio.id)));
      }
    },
    [avisar, materia.id],
  );

  const arrastando = useArrastarArquivos(area, enviar);
  const irPara = useInterface((s) => s.irPara);
  const [acoesAbertas, setAcoesAbertas] = useState<string | null>(null);
  const [lendo, setLendo] = useState<{ id: string; progresso: number } | null>(null);
  const [textoAberto, setTextoAberto] = useState<{ arquivo: ArquivoDaMateria; extraido: TextoExtraido } | null>(null);

  const analisar = useCallback(
    async (a: ArquivoDaMateria, acao: AcaoAnexo) => {
      if (lendo) return;
      if (acao !== "extrair" && chatOcupado()) {
        avisar(T.estudos.arquivos.chatOcupado);
        return;
      }
      setLendo({ id: a.id, progresso: 0 });
      try {
        const extraido = await extrairTexto(await lerConteudo(materia.id, a.id), a.nome, (p) => setLendo({ id: a.id, progresso: p }));
        if (acao === "extrair") {
          setTextoAberto({ arquivo: a, extraido });
          return;
        }
        if (chatOcupado()) {
          avisar(T.estudos.arquivos.chatOcupado);
          return;
        }
        const conversa = useComunicacao.getState().criarConversa("tutor");
        void enviarAoTime(conversa.id, "", [{ anexo: { nome: a.nome.slice(0, 120), tipo: a.extensao, tamanho: a.tamanho, texto: extraido.texto.slice(0, 60000) } }], { acaoAnexo: acao });
        irPara("chat", { conversa: conversa.id });
        avisar(T.estudos.arquivos.enviadoAoChat);
      } catch (e) {
        avisar(mensagemDeErro(e, a.nome));
        void tocarSom("error", "avisos");
      } finally {
        setLendo(null);
        setAcoesAbertas(null);
      }
    },
    [avisar, irPara, lendo, materia.id],
  );

  const baixar = useCallback(
    (a: ArquivoDaMateria) => {
      baixarArquivo(materia.id, a.id)
        .then((r) => avisar(T.estudos.arquivos.baixado(r.caminho)))
        .catch((e) => avisar(mensagemDeErro(e, a.nome)));
    },
    [avisar, materia.id],
  );

  const abrir = useCallback(
    (a: ArquivoDaMateria) => {
      abrirNoPrograma(materia.id, a.id).catch((e) => avisar(mensagemDeErro(e, a.nome)));
    },
    [avisar, materia.id],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return termo ? arquivos.filter((a) => a.nome.toLocaleLowerCase("pt-BR").includes(termo)) : arquivos;
  }, [arquivos, busca]);
  const paginas = usarPaginacao(visiveis, 15, `${busca}|${materia.id}`);

  const total = arquivos.reduce((s, a) => s + a.tamanho, 0);

  return (
    <div ref={area} className="est-arquivos">
      <ZonaDeSoltar ativo={arrastando} agente="tutor" texto={T.estudos.arquivos.solte} tipos={T.estudos.arquivos.tipos} />
      <div className="est-arquivos-soltar">
        <span className="est-arquivos-soltar-icone"><Upload size={20} /></span>
        <span className="est-arquivos-soltar-texto">
          <b>{T.estudos.arquivosArraste}</b>
          <span>{T.estudos.arquivos.dica}</span>
        </span>
        <Botao variante="primario" icone={<Upload size={13} />} onClick={() => entrada.current?.click()}>{T.estudos.arquivos.adicionar}</Botao>
        <input
          ref={entrada}
          type="file"
          multiple
          hidden
          accept={EXTENSOES_ACEITAS.map((e) => `.${e}`).join(",")}
          onChange={(e) => {
            enviar(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {falhaLista && <AvisoFaixa tipo="erro">{T.estudos.arquivos.falhaLista}</AvisoFaixa>}
      {arquivos.length > 0 && (
        <div className="est-arquivos-barra">
          <span>{T.estudos.arquivos.quantidade(arquivos.length)} · {formatarTamanho(total)}</span>
          <label className="est-campo-icone est-arquivos-busca">
            <Search size={12} />
            <input className="campo" value={busca} placeholder={T.estudos.arquivos.buscar} aria-label={T.estudos.arquivos.buscar} onChange={(e) => setBusca(e.target.value)} />
          </label>
        </div>
      )}

      {envios.map((e) => (
        <div key={e.id} className="est-arquivo est-arquivo-enviando">
          <span className="est-arquivo-tipo"><LoaderCircle size={14} className="girando" /></span>
          <span className="est-arquivo-nome">
            <span className="cortar">{e.nome}</span>
            <span className="est-arquivo-info">{T.estudos.arquivos.enviando} · {formatarTamanho(e.tamanho)}</span>
          </span>
        </div>
      ))}

      {carregado && arquivos.length === 0 && envios.length === 0 && !falhaLista ? (
        <Vazio icone={<Upload size={28} />} titulo={T.estudos.arquivos.vazio} texto={T.estudos.arquivos.vazioDica} />
      ) : visiveis.length === 0 && busca ? (
        <Vazio icone={<Search size={28} />} titulo={T.estudos.arquivos.semResultado} />
      ) : (
        <div className="est-arquivos-lista">
          {paginas.visiveis.map((a) => {
            const forma = formaDeVer(a.extensao);
            const temPrevia = forma !== "programa";
            return (
              <div key={a.id} className="est-arquivo-bloco" data-aberto={acoesAbertas === a.id ? "sim" : "nao"}>
                <div className="est-arquivo">
                  <span className="est-arquivo-tipo" data-forma={forma} data-extensao={a.extensao}>{a.extensao.slice(0, 4).toUpperCase()}</span>
                  <button type="button" className="est-arquivo-nome" onClick={() => (temPrevia ? setVendo(a) : abrir(a))} title={temPrevia ? T.estudos.arquivos.ver : T.estudos.arquivos.abrirNoPrograma}>
                    <span className="cortar">{a.nome}</span>
                    <span className="est-arquivo-info">{formatarTamanho(a.tamanho)} · {formatar(a.criadoEm, "d 'de' MMM yyyy")}</span>
                  </button>
                  <span className="est-arquivo-acoes">
                    {temPrevia ? (
                      <Botao pequeno className="est-botao-contorno" icone={<Eye size={12} />} onClick={() => setVendo(a)}>{T.estudos.arquivos.ver}</Botao>
                    ) : (
                      <Botao pequeno className="est-botao-contorno" icone={<ExternalLink size={12} />} onClick={() => abrir(a)}>{T.estudos.arquivos.abrirNoPrograma}</Botao>
                    )}
                    {podeExtrairTexto(a.nome) &&
                      (lendo?.id === a.id ? (
                        <span className="est-arquivo-lendo">
                          <LoaderCircle size={12} className="girando" />
                          {T.estudos.arquivos.lendoPaginas(lendo.progresso)}
                        </span>
                      ) : (
                        <Botao pequeno className="est-botao-contorno" icone={<ScanText size={12} />} aria-label={T.estudos.arquivos.analisarRotulo(a.nome)} aria-expanded={acoesAbertas === a.id} disabled={!!lendo} onClick={() => setAcoesAbertas((x) => (x === a.id ? null : a.id))}>{T.estudos.arquivos.analisar}</Botao>
                      ))}
                    <Botao pequeno soIcone className="est-botao-contorno" icone={<Download size={12} />} aria-label={T.estudos.arquivos.baixar} title={T.estudos.arquivos.baixar} onClick={() => baixar(a)} />
                    <Botao pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.estudos.arquivos.excluir} title={T.estudos.arquivos.excluir} onClick={() => setExcluindo(a)} />
                  </span>
                </div>
                {acoesAbertas === a.id && (
                  <div className="est-arquivo-analise" role="group" aria-label={T.estudos.arquivos.analisarRotulo(a.nome)}>
                    {(Object.keys(T.chat.anexos.acoes) as AcaoAnexo[]).map((acao) => (
                      <Botao key={acao} pequeno variante={acao === "extrair" ? "fantasma" : "secundario"} disabled={!!lendo} onClick={() => void analisar(a, acao)}>
                        {T.chat.anexos.acoes[acao]}
                      </Botao>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <Paginacao {...paginas} />
        </div>
      )}

      <Visualizador materiaId={materia.id} arquivo={vendo} aoFechar={() => setVendo(null)} aoBaixar={baixar} aoAbrir={abrir} aoVerTexto={(a) => { setVendo(null); void analisar(a, "extrair"); }} />
      <TextoDoArquivo aberto={textoAberto} aoFechar={() => setTextoAberto(null)} />
      <ConfirmarModal
        aberto={!!excluindo}
        titulo={T.estudos.arquivos.excluir}
        texto={excluindo ? T.estudos.arquivos.excluirTexto(excluindo.nome) : ""}
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={() => {
          const alvo = excluindo;
          if (!alvo) return;
          excluirArquivo(materia.id, alvo.id)
            .then(() => {
              setArquivos((lista) => lista.filter((x) => x.id !== alvo.id));
              if (vendo?.id === alvo.id) setVendo(null);
              void tocarSom("slap", "interface");
            })
            .catch((e) => avisar(mensagemDeErro(e, alvo.nome)));
        }}
      />
    </div>
  );
}
