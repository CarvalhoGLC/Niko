export interface PosicaoAssistive { x: number; y: number }
export interface TelaAssistive { largura: number; altura: number }
export interface AtalhoAssistive { id: string; nome: string }
export interface ConfigAssistive {
  ativo: boolean;
  fixado: boolean;
  opacidade: number;
  origemCor: "ilha" | "dock";
  posicao: PosicaoAssistive;
  apps: AtalhoAssistive[];
}

export const TAMANHO_BOTAO = 40;
export const LIMITE_ATALHOS = 24;
export const ASSISTIVE_PADRAO: ConfigAssistive = { ativo: false, fixado: false, opacidade: 0.65, origemCor: "ilha", posicao: { x: 1, y: 0.24 }, apps: [] };
const limitar = (n: number, min: number, max: number) => Math.min(Math.max(Number.isFinite(n) ? n : min, min), max);

function limites(tela: TelaAssistive) {
  const margemX = Math.min(16, Math.max(0, (tela.largura - TAMANHO_BOTAO) / 2));
  const margemY = Math.min(16, Math.max(0, (tela.altura - TAMANHO_BOTAO) / 2));
  return { minX: margemX, maxX: Math.max(margemX, tela.largura - TAMANHO_BOTAO - margemX), minY: margemY, maxY: Math.max(margemY, tela.altura - TAMANHO_BOTAO - margemY) };
}

export function limitarPosicao(posicao: PosicaoAssistive, tela: TelaAssistive): PosicaoAssistive {
  const l = limites(tela);
  return { x: limitar(posicao.x, l.minX, l.maxX), y: limitar(posicao.y, l.minY, l.maxY) };
}

export function normalizarPosicao(posicao: PosicaoAssistive, tela: TelaAssistive): PosicaoAssistive {
  const l = limites(tela), p = limitarPosicao(posicao, tela);
  return { x: l.maxX === l.minX ? 0 : (p.x - l.minX) / (l.maxX - l.minX), y: l.maxY === l.minY ? 0 : (p.y - l.minY) / (l.maxY - l.minY) };
}

export function posicaoNaTela(posicao: PosicaoAssistive, tela: TelaAssistive): PosicaoAssistive {
  const l = limites(tela);
  return limitarPosicao({ x: l.minX + limitar(posicao.x, 0, 1) * (l.maxX - l.minX), y: l.minY + limitar(posicao.y, 0, 1) * (l.maxY - l.minY) }, tela);
}

export function posicionarMenu(posicao: PosicaoAssistive, tela: TelaAssistive, alturaDesejada: number, larguraDesejada = 44) {
  const largura = Math.min(larguraDesejada, Math.max(0, tela.largura - 24));
  const disponivelAbaixo = Math.max(0, tela.altura - posicao.y - TAMANHO_BOTAO - 8);
  const disponivelAcima = Math.max(0, posicao.y - 8);
  const acima = alturaDesejada > disponivelAbaixo && disponivelAcima > disponivelAbaixo;
  const altura = Math.min(alturaDesejada, Math.max(0, acima ? disponivelAcima : disponivelAbaixo));
  return {
    x: limitar(posicao.x + TAMANHO_BOTAO / 2 - largura / 2, 12, Math.max(12, tela.largura - largura - 12)),
    y: limitar(acima ? posicao.y - altura + 4 : posicao.y + TAMANHO_BOTAO - 4, 12, Math.max(12, tela.altura - altura - 12)),
    largura, altura, acima,
  };
}

export function validarAssistive(entrada: unknown): ConfigAssistive {
  const s = (entrada && typeof entrada === "object" ? entrada : {}) as Partial<ConfigAssistive>;
  const unicos = new Set<string>();
  const apps: AtalhoAssistive[] = [];
  for (const item of Array.isArray(s.apps) ? s.apps : []) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || item.id.length > 2048 || typeof item.nome !== "string" || !item.nome.trim() || unicos.has(item.id) || apps.length >= LIMITE_ATALHOS) continue;
    unicos.add(item.id);
    apps.push({ id: item.id, nome: item.nome.trim().slice(0, 160) });
  }
  return { ativo: typeof s.ativo === "boolean" ? s.ativo : ASSISTIVE_PADRAO.ativo, fixado: s.fixado === true, origemCor: s.origemCor === "dock" ? "dock" : "ilha", opacidade: limitar(s.opacidade ?? ASSISTIVE_PADRAO.opacidade, 0.3, 1), posicao: { x: limitar(s.posicao?.x ?? ASSISTIVE_PADRAO.posicao.x, 0, 1), y: limitar(s.posicao?.y ?? ASSISTIVE_PADRAO.posicao.y, 0, 1) }, apps };
}

export function moverAtalho<T extends { id: string }>(apps: T[], id: string, direcao: -1 | 1): T[] {
  const de = apps.findIndex((a) => a.id === id), para = de + direcao;
  if (de < 0 || para < 0 || para >= apps.length) return apps;
  const copia = [...apps];
  [copia[de], copia[para]] = [copia[para], copia[de]];
  return copia;
}
