import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armazenamento, chave } from "../ponte/armazenamento";
import { acumular, HISTORICO_VAZIO, type EventoDeCodigo, type HistoricoDeCodigo } from "../utilitarios/resumoSemanal";

const EVENTOS_QUE_GRAVAM = new Set(["Stop", "StopFailure", "SessionEnd"]);
const GRAVAR_NO_MAXIMO_A_CADA_MS = 60_000;

interface EstadoHistoricoCodigo {
  historico: HistoricoDeCodigo;
  esconderProjetos: boolean;
  ultimoResumoVisto: string | null;
  registrar: (e: EventoDeCodigo) => void;
  definir: (parcial: Partial<Pick<EstadoHistoricoCodigo, "esconderProjetos" | "ultimoResumoVisto">>) => void;
  limpar: () => void;
}

let pendente: HistoricoDeCodigo | null = null;
let gravadoEm = 0;
let relogio: ReturnType<typeof setTimeout> | null = null;
const GRAVAR_PENDENTE_EM_MS = 15_000;

function gravarPendente() {
  if (relogio) clearTimeout(relogio);
  relogio = null;
  if (!pendente) return;
  gravadoEm = Date.now();
  const historico = pendente;
  pendente = null;
  useHistoricoCodigo.setState({ historico });
}
const antesDeCarregar: EventoDeCodigo[] = [];
const LIMITE_ANTES_DE_CARREGAR = 500;

export const useHistoricoCodigo = create<EstadoHistoricoCodigo>()(
  persist(
    (set, get) => ({
      historico: HISTORICO_VAZIO,
      esconderProjetos: false,
      ultimoResumoVisto: null,
      registrar: (e) => {
        if (!useHistoricoCodigo.persist.hasHydrated()) {
          if (antesDeCarregar.length < LIMITE_ANTES_DE_CARREGAR) antesDeCarregar.push(e);
          return;
        }
        const base = pendente ?? get().historico;
        const proximo = acumular(base, e);
        if (proximo === base) return;
        pendente = proximo;
        if (EVENTOS_QUE_GRAVAM.has(e.evento) || Date.now() - gravadoEm > GRAVAR_NO_MAXIMO_A_CADA_MS) gravarPendente();
        else if (!relogio) relogio = setTimeout(gravarPendente, GRAVAR_PENDENTE_EM_MS);
      },
      definir: (parcial) => set(parcial),
      limpar: () => {
        if (relogio) clearTimeout(relogio);
        relogio = null;
        pendente = null;
        set({ historico: HISTORICO_VAZIO });
      },
    }),
    { name: chave("historico-codigo"), storage: armazenamento, partialize: (s) => ({ historico: s.historico, esconderProjetos: s.esconderProjetos, ultimoResumoVisto: s.ultimoResumoVisto }) },
  ),
);

useHistoricoCodigo.persist.onFinishHydration(() => {
  for (const e of antesDeCarregar.splice(0)) useHistoricoCodigo.getState().registrar(e);
});
if (typeof window !== "undefined") window.addEventListener("beforeunload", gravarPendente);

export { gravarPendente };
