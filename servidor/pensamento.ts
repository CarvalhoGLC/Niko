const ABERTURAS = ["<think>", "<thinking>"];
const FECHAMENTOS = ["</think>", "</thinking>"];

function primeira(texto: string, tags: string[]): { inicio: number; fim: number } | null {
  let melhor: { inicio: number; fim: number } | null = null;
  for (const tag of tags) {
    const i = texto.toLowerCase().indexOf(tag);
    if (i >= 0 && (!melhor || i < melhor.inicio)) melhor = { inicio: i, fim: i + tag.length };
  }
  return melhor;
}

function inicioDeTagIncompleta(texto: string, tags: string[]): number {
  const i = texto.lastIndexOf("<");
  if (i < 0) return -1;
  const resto = texto.slice(i).toLowerCase();
  return tags.some((t) => t.startsWith(resto) && t !== resto) ? i : -1;
}

/** Tira do texto dos modelos locais os blocos <think>...</think>, mesmo quando a tag chega partida entre pedaços do streaming. */
export function criarFiltroDePensamento() {
  let dentro = false;
  let guardado = "";
  let mostrouAlgo = false;
  let pensou = false;

  const receber = (trecho: string): string => {
    let texto = guardado + trecho;
    guardado = "";
    let saida = "";
    while (texto) {
      if (!dentro) {
        const abre = primeira(texto, ABERTURAS);
        if (abre) {
          saida += texto.slice(0, abre.inicio);
          texto = texto.slice(abre.fim);
          dentro = true;
          pensou = true;
          continue;
        }
        const parcial = inicioDeTagIncompleta(texto, ABERTURAS);
        if (parcial >= 0) {
          guardado = texto.slice(parcial);
          texto = texto.slice(0, parcial);
        }
        saida += texto;
        break;
      }
      const fecha = primeira(texto, FECHAMENTOS);
      if (fecha) {
        texto = texto.slice(fecha.fim);
        dentro = false;
        if (!mostrouAlgo && !saida) texto = texto.replace(/^\s+/, "");
        continue;
      }
      const parcial = inicioDeTagIncompleta(texto, FECHAMENTOS);
      guardado = parcial >= 0 ? texto.slice(parcial) : "";
      break;
    }
    if (saida) mostrouAlgo = true;
    return saida;
  };

  const terminar = (): string => {
    const resto = dentro ? "" : guardado;
    guardado = "";
    return resto;
  };

  return { receber, terminar, pensou: () => pensou };
}
