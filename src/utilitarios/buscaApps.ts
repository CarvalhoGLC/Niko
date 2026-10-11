import { normalizarTexto } from "./basicos";

export type Buscador = "google" | "duckduckgo" | "bing";

export const BUSCADORES: Buscador[] = ["google", "duckduckgo", "bing"];

const ENDERECO_DO_BUSCADOR: Record<Buscador, string> = {
  google: "https://www.google.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  bing: "https://www.bing.com/search?q=",
};

export interface Uso {
  vezes: number;
  ultimo: number;
}

const DIA_MS = 86_400_000;

export function pontuarNome(consulta: string, nome: string): number {
  const q = normalizarTexto(consulta);
  const n = normalizarTexto(nome);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 90 - Math.min(n.length - q.length, 20) * 0.2;
  const palavras = n.split(/[^a-z0-9]+/).filter(Boolean);
  if (palavras.some((p) => p.startsWith(q))) return 78;
  const termos = q.split(/\s+/).filter(Boolean);
  if (termos.length > 1 && termos.every((t) => palavras.some((p) => p.startsWith(t)))) return 72;
  if (termos.length > 1 && termos.every((t) => n.includes(t))) return 65;
  const posicao = n.indexOf(q);
  if (posicao >= 0) return 60 - Math.min(posicao, 20) * 0.5;
  const junto = q.replace(/\s+/g, "");
  if (junto.length >= 2 && palavras.map((p) => p[0]).join("").startsWith(junto)) return 55;
  if (junto.length >= 3) {
    let i = 0;
    for (const letra of n) if (letra === junto[i]) i++;
    if (i === junto.length) return 30;
  }
  return 0;
}

export function bonusDeUso(uso: Uso | undefined, agora = Date.now()): number {
  if (!uso) return 0;
  const frequencia = Math.min(uso.vezes, 20) * 0.5;
  const dias = (agora - uso.ultimo) / DIA_MS;
  const recencia = dias < 1 ? 5 : dias < 7 ? 3 : dias < 30 ? 1 : 0;
  return frequencia + recencia;
}

export function registrarUso(usos: Record<string, Uso>, id: string, limite: number, agora = Date.now()): Record<string, Uso> {
  const proximo = { ...usos, [id]: { vezes: (usos[id]?.vezes ?? 0) + 1, ultimo: agora } };
  const ids = Object.keys(proximo);
  if (ids.length <= limite) return proximo;
  for (const velho of ids.sort((a, b) => proximo[a].ultimo - proximo[b].ultimo).slice(0, ids.length - limite)) delete proximo[velho];
  return proximo;
}

type Peca = { tipo: "num"; valor: number } | { tipo: "op"; valor: string };

function numeroBrasileiro(bruto: string): number {
  if (bruto.includes(",") && bruto.includes(".")) return Number(bruto.replace(/\./g, "").replace(",", "."));
  return Number(bruto.replace(",", "."));
}

function separar(texto: string): Peca[] | null {
  const limpo = texto.replace(/×|x(?=\s*[\d(])/gi, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  const pecas: Peca[] = [];
  let i = 0;
  while (i < limpo.length) {
    const c = limpo[i];
    if (/[\d.,]/.test(c)) {
      let fim = i;
      while (fim < limpo.length && /[\d.,]/.test(limpo[fim])) fim++;
      const valor = numeroBrasileiro(limpo.slice(i, fim));
      if (!Number.isFinite(valor)) return null;
      pecas.push({ tipo: "num", valor });
      i = fim;
    } else if ("+-*/%^()".includes(c)) {
      pecas.push({ tipo: "op", valor: c });
      i++;
    } else return null;
  }
  return pecas;
}

export function calcular(texto: string): number | null {
  if (!/\d/.test(texto) || !/[+\-*/%^×÷x]/i.test(texto.replace(/^\s*-/, ""))) return null;
  if (!/^[\d\s+\-*/%^().,x×÷]+$/i.test(texto)) return null;
  const pecas = separar(texto);
  if (!pecas?.length) return null;
  let p = 0;
  const eh = (v: string) => pecas[p]?.tipo === "op" && pecas[p].valor === v;
  const expressao = (): number => {
    let v = termo();
    while (eh("+") || eh("-")) {
      const op = pecas[p++].valor;
      const d = termo();
      v = op === "+" ? v + d : v - d;
    }
    return v;
  };
  const termo = (): number => {
    let v = potencia();
    while (eh("*") || eh("/") || eh("%")) {
      const op = pecas[p++].valor;
      const d = potencia();
      v = op === "*" ? v * d : op === "/" ? v / d : v % d;
    }
    return v;
  };
  const potencia = (): number => {
    const base = unario();
    if (!eh("^")) return base;
    p++;
    return Math.pow(base, potencia());
  };
  const unario = (): number => {
    if (eh("-")) {
      p++;
      return -unario();
    }
    if (eh("+")) {
      p++;
      return unario();
    }
    return atomo();
  };
  const atomo = (): number => {
    const x = pecas[p++];
    if (!x) throw new Error("fim");
    if (x.tipo === "num") return x.valor;
    if (x.valor !== "(") throw new Error("simbolo");
    const v = expressao();
    if (!eh(")")) throw new Error("parenteses");
    p++;
    return v;
  };
  try {
    const resultado = expressao();
    return p === pecas.length && Number.isFinite(resultado) ? resultado : null;
  } catch {
    return null;
  }
}

export function formatarNumero(n: number): string {
  return (Math.round(n * 1e10) / 1e10).toLocaleString("pt-BR", { maximumFractionDigits: 10 });
}

export function numeroParaCopiar(n: number): string {
  return String(Math.round(n * 1e10) / 1e10).replace(".", ",");
}

export function enderecoWeb(texto: string): string | null {
  const t = texto.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(t)) return t;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|gov|edu|br|co|ai|me|tv|xyz)(\/\S*)?$/i.test(t)) return `https://${t}`;
  return null;
}

export function enderecoDePesquisa(consulta: string, buscador: Buscador): string {
  return `${ENDERECO_DO_BUSCADOR[buscador] ?? ENDERECO_DO_BUSCADOR.google}${encodeURIComponent(consulta.trim())}`;
}
