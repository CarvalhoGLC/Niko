import { useEffect } from "react";
import { NATIVO, liberarSistemaInicial, tempoOciosoMs, versaoDoApp } from "../../../desktop/desktop";
import { useConfig, type Configuracoes } from "../../../estado/configuracoes";
import { useIlha } from "../../../estado/ilha";
import { hojeISO } from "../../../utilitarios/datas";

const AUSENCIA_MS = 30 * 60_000;
const ATIVO_AGORA_MS = 60_000;
const INTERVALO_DA_VERIFICACAO_MS = 60_000;
const ESPERA_ANTES_DE_SAUDAR_MS = 700;

type UltimaSaudacao = Configuracoes["ultimaSaudacao"];

export function decidirSaudacaoAoAbrir(ultima: UltimaSaudacao, hoje: string, versao: string): { saudar: boolean; versaoNova?: string } {
  if (!ultima) return { saudar: true };
  if (ultima.versao !== versao) return { saudar: true, versaoNova: versao };
  return { saudar: ultima.dia !== hoje };
}

export function voltouDepoisDeAusencia(lacunaMs: number, ociosoMs: number, jaAusente: boolean): { ausente: boolean; voltou: boolean } {
  const ausente = jaAusente || lacunaMs >= AUSENCIA_MS || ociosoMs >= AUSENCIA_MS;
  return ausente && ociosoMs <= ATIVO_AGORA_MS ? { ausente: false, voltou: true } : { ausente, voltou: false };
}

function esperarConfiguracoes(): Promise<void> {
  if (useConfig.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolver) => {
    const desligar = useConfig.persist.onFinishHydration(() => {
      desligar();
      resolver();
    });
  });
}

export function usarSaudacaoDiaria(ligada: boolean) {
  useEffect(() => {
    let vivo = true;
    let versao = "";
    let ausente = false;
    let ultimaVerificacao = Date.now();
    let espera: number | undefined;
    let intervalo: number | undefined;

    const saudarAgora = (versaoNova?: string) => {
      useConfig.getState().definir({ ultimaSaudacao: { dia: hojeISO(), versao } });
      useIlha.getState().saudar(versaoNova);
    };

    const verificarVolta = async () => {
      const agora = Date.now();
      const lacuna = agora - ultimaVerificacao;
      ultimaVerificacao = agora;
      const ocioso = NATIVO ? (await tempoOciosoMs()) ?? 0 : 0;
      if (!vivo) return;
      const r = voltouDepoisDeAusencia(lacuna, ocioso, ausente);
      ausente = r.ausente;
      if (r.voltou && useConfig.getState().ultimaSaudacao?.dia !== hojeISO()) saudarAgora();
    };

    void (async () => {
      await esperarConfiguracoes();
      versao = await versaoDoApp();
      if (!vivo) return;
      if (!ligada) {
        void liberarSistemaInicial();
        return;
      }
      const decisao = decidirSaudacaoAoAbrir(useConfig.getState().ultimaSaudacao, hojeISO(), versao);
      if (decisao.saudar) espera = window.setTimeout(() => vivo && saudarAgora(decisao.versaoNova), ESPERA_ANTES_DE_SAUDAR_MS);
      else void liberarSistemaInicial();
      intervalo = window.setInterval(() => void verificarVolta(), INTERVALO_DA_VERIFICACAO_MS);
    })();

    return () => {
      vivo = false;
      window.clearTimeout(espera);
      window.clearInterval(intervalo);
    };
  }, [ligada]);
}
