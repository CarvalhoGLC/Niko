import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armazenamento, chave } from "../ponte/armazenamento";
import { registrarUso, type Uso } from "../utilitarios/buscaApps";

const LIMITE_DE_USOS = 300;

interface EstadoBuscaApps {
  usos: Record<string, Uso>;
  usar: (id: string) => void;
  esquecer: () => void;
}

export const useBuscaApps = create<EstadoBuscaApps>()(
  persist(
    (set, get) => ({
      usos: {},
      usar: (id) => set({ usos: registrarUso(get().usos, id, LIMITE_DE_USOS) }),
      esquecer: () => set({ usos: {} }),
    }),
    { name: chave("busca-apps"), storage: armazenamento, partialize: (s) => ({ usos: s.usos }) },
  ),
);
