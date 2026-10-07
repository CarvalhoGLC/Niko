import type { AbaIlha, SecaoHoje } from "../../../estado/configuracoes";
import { useIlha } from "../../../estado/ilha";

export function alternarAbaDaBarra(aba: AbaIlha, secao?: SecaoHoje) {
  const ilha = useIlha.getState();
  const mesmaSecao = !secao || ilha.secaoHoje === secao;
  if (secao) ilha.definirSecaoHoje(secao);
  if (ilha.estado === "expandida" && ilha.aba === aba && mesmaSecao) ilha.recolher();
  else ilha.abrir(aba);
}

export function abaVizinha(abas: AbaIlha[], atual: AbaIlha, passo: 1 | -1): AbaIlha | undefined {
  if (abas.length === 0) return undefined;
  const indice = abas.indexOf(atual);
  if (indice < 0) return abas[0];
  return abas[Math.min(abas.length - 1, Math.max(0, indice + passo))];
}

export function criarAlternadorDoIniciar(ler: () => Promise<{ aberto: boolean }>, executar: (abertoAntes?: boolean) => Promise<unknown>) {
  let leitura: Promise<boolean | undefined> | null = null;
  let ocupado = false;
  let preparando = false;
  return {
    preparar() {
      if (ocupado || preparando) return;
      preparando = true;
      leitura = ler().then((r) => r.aberto).catch(() => undefined).finally(() => { preparando = false; });
    },
    limpar() {
      leitura = null;
    },
    async alternar() {
      if (ocupado) return;
      ocupado = true;
      const anterior = leitura;
      leitura = null;
      try {
        const abertoAntes = await (anterior ?? ler().then((r) => r.aberto).catch(() => undefined));
        const resultado = await executar(abertoAntes);
        if (resultado && typeof resultado === "object" && "aberto" in resultado && typeof resultado.aberto === "boolean") leitura = Promise.resolve(resultado.aberto);
      } finally {
        ocupado = false;
      }
    },
  };
}
