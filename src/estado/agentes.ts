import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armazenamento, chave } from "../ponte/armazenamento";
import type { AgenteId, Alerta, Atividade, EstadoAgente, Rota, ServicoId } from "../tipos";
import { gerarId } from "../utilitarios/basicos";
import { tocarSom, type NomeSom } from "../ponte/sons";
import { avisoLigado, useIlha } from "./ilha";
import type { CategoriaDeAviso } from "./configuracoes";

const CATEGORIA_DA_ROTA: Partial<Record<Rota, CategoriaDeAviso>> = { calendario: "lembretes", journal: "habitos", estudos: "estudos", financas: "financas", conexoes: "conexoes", consumo: "consumo" };

export const AGENTES: AgenteId[] = ["organizador", "tutor", "operador", "java"];

interface Sinais {
  pensando: number;
  escrevendo: number;
  ouvindo: boolean;
  sucessoAte: number;
  erro: string | null;
}

const SINAIS_VAZIOS: Sinais = { pensando: 0, escrevendo: 0, ouvindo: false, sucessoAte: 0, erro: null };

interface EstadoAgentes {
  sinais: Record<AgenteId, Sinais>;
  forcado: Partial<Record<AgenteId, EstadoAgente>>;
  dormindo: Record<AgenteId, boolean>;
  ultimaAtividade: Record<AgenteId, number>;
  tarefaAtual: Record<AgenteId, string>;
  atividades: Atividade[];
  alertas: Alerta[];
  relogio: number;
  registrar: (agente: AgenteId, texto: string) => void;
  trabalhar: (agente: AgenteId, texto: string, duracaoMs?: number) => Promise<void>;
  alertar: (agente: AgenteId, texto: string, rota?: Rota, som?: NomeSom, servico?: ServicoId, urgente?: boolean) => string;
  resolverAlerta: (id: string) => void;
  marcarVistos: () => void;
  falhar: (agente: AgenteId, texto: string) => void;
  verErro: (agente: AgenteId) => void;
  ouvir: (agente: AgenteId, ligado: boolean) => void;
  forcar: (agente: AgenteId, estado: EstadoAgente | null) => void;
  verificarSono: (minutos: number) => void;
  tique: () => void;
}

function porAgente<T>(valor: () => T): Record<AgenteId, T> {
  return { organizador: valor(), tutor: valor(), operador: valor(), java: valor() };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const VALIDADE_ALERTA = 12 * 3600000;
const ALERTA_FRESCO = 20000;

export function alertaFresco(a: Alerta, agora = Date.now()): boolean {
  return !a.visto && agora - new Date(a.criadoEm).getTime() < ALERTA_FRESCO;
}

export const useAgentes = create<EstadoAgentes>()(
  persist(
    (set, get) => {
      const mudarSinal = (agente: AgenteId, mudanca: (s: Sinais) => Sinais) =>
        set((s) => ({
          sinais: { ...s.sinais, [agente]: mudanca(s.sinais[agente]) },
          ultimaAtividade: { ...s.ultimaAtividade, [agente]: Date.now() },
          dormindo: { ...s.dormindo, [agente]: false },
        }));

      return {
        sinais: porAgente(() => ({ ...SINAIS_VAZIOS })),
        forcado: {},
        dormindo: porAgente(() => false),
        ultimaAtividade: porAgente(() => Date.now()),
        tarefaAtual: porAgente(() => ""),
        atividades: [],
        alertas: [],
        relogio: Date.now(),
        registrar: (agente, texto) =>
          set((s) => ({
            atividades: [{ id: gerarId(), agenteId: agente, texto, data: new Date().toISOString() }, ...s.atividades].slice(0, 80),
            ultimaAtividade: { ...s.ultimaAtividade, [agente]: Date.now() },
            dormindo: { ...s.dormindo, [agente]: false },
          })),
        trabalhar: async (agente, texto, duracaoMs = 900) => {
          set((s) => ({ tarefaAtual: { ...s.tarefaAtual, [agente]: texto } }));
          mudarSinal(agente, (x) => ({ ...x, pensando: x.pensando + 1 }));
          void tocarSom("think", "personagens");
          await esperar(Math.min(500, duracaoMs / 2));
          mudarSinal(agente, (x) => ({ ...x, pensando: Math.max(0, x.pensando - 1), escrevendo: x.escrevendo + 1 }));
          await esperar(duracaoMs);
          mudarSinal(agente, (x) => ({ ...x, escrevendo: Math.max(0, x.escrevendo - 1), sucessoAte: Date.now() + 3000 }));
          set((s) => ({ tarefaAtual: { ...s.tarefaAtual, [agente]: "" } }));
          get().registrar(agente, texto);
          void tocarSom("finish", "personagens");
          setTimeout(() => set({ relogio: Date.now() }), 3100);
        },
        alertar: (agente, texto, rota, som = "question", servico, urgente = false) => {
          const repetido = get().alertas.find((a) => a.agenteId === agente && a.texto === texto);
          if (repetido) return repetido.id;
          const id = gerarId();
          set((s) => ({
            alertas: [...s.alertas, { id, agenteId: agente, texto, rota, servico, criadoEm: new Date().toISOString() }].slice(-20),
            relogio: Date.now(),
          }));
          mudarSinal(agente, (x) => x);
          const categoria = rota ? CATEGORIA_DA_ROTA[rota] : undefined;
          if (avisoLigado(categoria)) {
            const aceito = useIlha.getState().revelar({ texto, tipo: "alerta", agente, aba: "avisos", categoria }, urgente ? 6000 : 4200, urgente ? "alta" : "normal");
            if (aceito) void tocarSom(som, "avisos");
          }
          window.setTimeout(() => set({ relogio: Date.now() }), ALERTA_FRESCO + 200);
          return id;
        },
        resolverAlerta: (id) => set((s) => ({ alertas: s.alertas.filter((a) => a.id !== id) })),
        marcarVistos: () => {
          if (get().alertas.every((a) => a.visto)) return;
          set((s) => ({ alertas: s.alertas.map((a) => ({ ...a, visto: true })), relogio: Date.now() }));
        },
        falhar: (agente, texto) => {
          mudarSinal(agente, (x) => ({ ...x, erro: texto }));
          get().registrar(agente, texto);
          void tocarSom("error", "avisos");
        },
        verErro: (agente) => mudarSinal(agente, (x) => ({ ...x, erro: null })),
        ouvir: (agente, ligado) => {
          if (get().sinais[agente].ouvindo === ligado) return;
          mudarSinal(agente, (x) => ({ ...x, ouvindo: ligado }));
        },
        forcar: (agente, estado) =>
          set((s) => {
            const forcado = { ...s.forcado };
            if (estado) forcado[agente] = estado;
            else delete forcado[agente];
            return { forcado };
          }),
        verificarSono: (minutos) => {
          const agora = Date.now();
          const s = get();
          const vencidos = s.alertas.filter((a) => agora - new Date(a.criadoEm).getTime() > VALIDADE_ALERTA);
          if (vencidos.length) set({ alertas: s.alertas.filter((a) => !vencidos.includes(a)) });
          const dormindo = { ...s.dormindo };
          let mudou = false;
          for (const a of AGENTES) {
            const deveDormir = agora - s.ultimaAtividade[a] > minutos * 60000;
            if (deveDormir !== dormindo[a]) {
              dormindo[a] = deveDormir;
              mudou = true;
              if (deveDormir) {
                void tocarSom("yawn", "personagens");
                window.setTimeout(() => void tocarSom("sleep", "personagens"), 1400);
              }
            }
          }
          if (mudou) set({ dormindo });
        },
        tique: () => set({ relogio: Date.now() }),
      };
    },
    {
      name: chave("agentes"),
      storage: armazenamento,
      version: 1,
      migrate: (salvo) => {
        const s = (salvo ?? {}) as Partial<EstadoAgentes>;
        return { ...s, alertas: (s.alertas ?? []).filter((a) => !a.servico) } as EstadoAgentes;
      },
      partialize: (s) => ({ atividades: s.atividades, alertas: s.alertas }),
      merge: (persistido, atual) => {
        const salvo = (persistido ?? {}) as Partial<EstadoAgentes>;
        const limite = Date.now() - VALIDADE_ALERTA;
        return { ...atual, ...salvo, alertas: (salvo.alertas ?? []).filter((a) => new Date(a.criadoEm).getTime() > limite) };
      },
    },
  ),
);

export function estadoDoAgente(s: EstadoAgentes, agente: AgenteId): EstadoAgente {
  const forcado = s.forcado[agente];
  if (forcado) return forcado;
  const x = s.sinais[agente];
  if (s.alertas.some((a) => a.agenteId === agente && alertaFresco(a, Math.max(s.relogio, Date.now())))) return "alerta";
  if (x.erro) return "erro";
  if (x.escrevendo > 0) return "escrevendo";
  if (x.pensando > 0) return "pensando";
  if (x.ouvindo) return "ouvindo";
  if (x.sucessoAte > s.relogio && x.sucessoAte > Date.now()) return "sucesso";
  if (s.dormindo[agente]) return "dormindo";
  return "ocioso";
}

export function useEstadoAgente(agente: AgenteId): EstadoAgente {
  return useAgentes((s) => estadoDoAgente(s, agente));
}

export const COR_ESTADO: Record<EstadoAgente, string> = {
  ocioso: "#8a8f98",
  ouvindo: "#38bdf8",
  pensando: "#a78bfa",
  escrevendo: "#22d3ee",
  sucesso: "#34d399",
  alerta: "#f5a524",
  erro: "#f4505e",
  dormindo: "#6366f1",
};
