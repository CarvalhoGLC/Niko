import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, Copy, EyeOff, Trash2 } from "lucide-react";
import { gravarPendente, useHistoricoCodigo } from "../../../estado/historicoCodigo";
import { inicioDaSemana, resumoDaSemana, semanaPassada, type ResumoDaSemana as Resumo } from "../../../utilitarios/resumoSemanal";
import { deISO } from "../../../utilitarios/datas";
import { tocarSom } from "../../../ponte/sons";
import { Marca } from "../../../marcas/Marca";
import { T } from "../../../textos/textos";
import { MARCA_DA_FERRAMENTA, nomeDaFerramenta } from "./ferramentas";
import type { FerramentaDeCodigo } from "../../../ponte/claudeCode";

const R = T.ilha.claude.resumo;
const LARGURA_IMAGEM = 1080;
const ALTURA_IMAGEM = 1920;

export function duracao(ms: number): string {
  const minutos = Math.round(ms / 60000);
  if (minutos < 60) return R.minutos(minutos);
  const horas = Math.floor(minutos / 60);
  return R.horas(horas, minutos % 60);
}

function nomeDoDia(iso: string): string {
  return deISO(iso).toLocaleDateString("pt-BR", { weekday: "long" });
}

function periodo(inicio: string): string {
  const comeco = deISO(inicio);
  const fim = new Date(comeco.getFullYear(), comeco.getMonth(), comeco.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${f(comeco)} a ${f(fim)}`;
}

function linhasDoResumo(r: Resumo, esconder: boolean): [string, string][] {
  return [
    [R.tempo, duracao(r.tempoMs)],
    [R.sessoes, String(r.sessoes)],
    [R.arquivos, String(r.arquivos)],
    [R.linhas, `+${r.mais} -${r.menos}`],
    [R.comandos, String(r.comandos)],
    [R.pedidos, `${r.pedidos} · ${r.perguntas}`],
    ...(r.agente ? [[R.agente, nomeDaFerramenta(r.agente.ferramenta as FerramentaDeCodigo)] as [string, string]] : []),
    ...(r.projeto ? [[R.projeto, esconder ? R.escondido : r.projeto.nome] as [string, string]] : []),
    ...(r.diaMaisCheio ? [[R.diaMaisCheio, `${nomeDoDia(r.diaMaisCheio.dia)} · ${duracao(r.diaMaisCheio.tempoMs)}`] as [string, string]] : []),
    ...(r.maisLonga ? [[R.maisLonga, `${esconder ? R.escondido : r.maisLonga.projeto} · ${duracao(r.maisLonga.tempoMs)}`] as [string, string]] : []),
  ];
}

async function imagemDoResumo(r: Resumo, esconder: boolean): Promise<Blob | null> {
  const tela = document.createElement("canvas");
  tela.width = LARGURA_IMAGEM;
  tela.height = ALTURA_IMAGEM;
  const c = tela.getContext("2d");
  if (!c) return null;
  const fonte = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
  c.fillStyle = "#111114";
  c.fillRect(0, 0, LARGURA_IMAGEM, ALTURA_IMAGEM);
  c.fillStyle = "#8b8b93";
  c.font = `500 40px ${fonte}`;
  c.fillText(R.titulo, 96, 200);
  c.fillStyle = "#f2f2f4";
  c.font = `700 150px ${fonte}`;
  c.fillText(duracao(r.tempoMs), 96, 380);
  c.fillStyle = "#8b8b93";
  c.font = `400 40px ${fonte}`;
  c.fillText(periodo(r.inicio), 96, 450);
  let y = 610;
  for (const [rotulo, valor] of linhasDoResumo(r, esconder).slice(1)) {
    c.fillStyle = "#8b8b93";
    c.font = `400 36px ${fonte}`;
    c.fillText(rotulo, 96, y);
    c.fillStyle = "#f2f2f4";
    c.font = `600 56px ${fonte}`;
    c.fillText(valor.length > 30 ? `${valor.slice(0, 29)}…` : valor, 96, y + 66);
    y += 128;
  }
  c.fillStyle = "#5c5c66";
  c.font = `500 34px ${fonte}`;
  c.fillText(R.feitoCom, 96, ALTURA_IMAGEM - 110);
  return new Promise((resolver) => tela.toBlob(resolver, "image/png"));
}

export function ResumoDaSemana({ aoFechar }: { aoFechar: () => void }) {
  const historico = useHistoricoCodigo((s) => s.historico);
  const esconder = useHistoricoCodigo((s) => s.esconderProjetos);
  const definir = useHistoricoCodigo((s) => s.definir);
  const limpar = useHistoricoCodigo((s) => s.limpar);
  const [qual, setQual] = useState<"passada" | "atual">("passada");
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  useEffect(() => gravarPendente(), []);
  const resumo = useMemo(() => resumoDaSemana(historico, qual === "passada" ? semanaPassada(new Date()) : inicioDaSemana(new Date())), [historico, qual]);

  const copiar = async () => {
    try {
      const imagem = await imagemDoResumo(resumo, esconder);
      if (!imagem) throw new Error();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": imagem })]);
      void tocarSom("blip");
      setAviso(R.copiado);
    } catch {
      setAviso(R.naoCopiou);
    }
  };

  return (
    <motion.div className="cfg resumo-semana" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1, transition: { duration: 0.2 } }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}>
      <div className="cfg-topo">
        <button type="button" className="vsc-icone-botao" aria-label={T.ilha.claude.config.voltar} title={T.ilha.claude.config.voltar} onClick={aoFechar}>
          <ChevronLeft size={15} />
        </button>
        <span className="cfg-titulo">{R.titulo}</span>
        <span className="vsc-dim cfg-dica">{periodo(resumo.inicio)}</span>
        <span className="resumo-semana-seletor" role="tablist">
          {(["passada", "atual"] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={qual === s} className="vsc-painel" onClick={() => setQual(s)}>
              {R.semanas[s]}
            </button>
          ))}
        </span>
      </div>
      {resumo.sessoes === 0 ? (
        <div className="vsc-vazio">
          <span className="vsc-dim">{R.vazio}</span>
        </div>
      ) : (
        <div className="resumo-semana-corpo">
          <div className="resumo-semana-destaque">
            {resumo.agente && <Marca marca={MARCA_DA_FERRAMENTA[resumo.agente.ferramenta as FerramentaDeCodigo] ?? "claudecode"} tamanho={22} />}
            <span className="resumo-semana-tempo">{duracao(resumo.tempoMs)}</span>
            <span className="vsc-dim">{R.tempoDica}</span>
          </div>
          <dl className="resumo-semana-grade">
            {linhasDoResumo(resumo, esconder)
              .slice(1)
              .map(([rotulo, valor]) => (
                <div key={rotulo} className="resumo-semana-item">
                  <dt>{rotulo}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
      <div className="vsc-permissao-rodape resumo-semana-rodape">
        <span className="vsc-dim" aria-live="polite">{aviso ?? R.soNestePc}</span>
        <button type="button" className="vsc-botao" aria-pressed={esconder} onClick={() => definir({ esconderProjetos: !esconder })}>
          <EyeOff size={13} />
          {R.esconderProjetos}
        </button>
        {confirmarLimpar ? (
          <button
            type="button"
            className="vsc-botao"
            onClick={() => {
              limpar();
              setConfirmarLimpar(false);
              setAviso(R.limpo);
            }}
          >
            <Trash2 size={13} />
            {R.confirmarLimpar}
          </button>
        ) : (
          <button type="button" className="vsc-botao" onClick={() => setConfirmarLimpar(true)}>
            <Trash2 size={13} />
            {R.limpar}
          </button>
        )}
        <button type="button" className="vsc-botao vsc-botao-primario" disabled={resumo.sessoes === 0} onClick={() => void copiar()}>
          <Copy size={13} />
          {R.copiarImagem}
        </button>
      </div>
    </motion.div>
  );
}
