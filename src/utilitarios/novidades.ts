import { T } from "../textos/textos";
import { versaoMaisNova } from "./versoes";

export type VersaoComNovidades = (typeof T.atualizacao.historico)[number];

const mesmaVersao = (a: string, b: string) => !versaoMaisNova(a, b) && !versaoMaisNova(b, a);

export function novidadesAte(versaoAtual: string | null | undefined, historico: readonly VersaoComNovidades[] = T.atualizacao.historico): VersaoComNovidades[] {
  if (!versaoAtual) return [];
  return historico.filter((v) => !versaoMaisNova(v.versao, versaoAtual)).sort((a, b) => (versaoMaisNova(a.versao, b.versao) ? -1 : versaoMaisNova(b.versao, a.versao) ? 1 : 0));
}

export function temNovidadesDe(versao: string): boolean {
  return T.atualizacao.historico.some((v) => mesmaVersao(v.versao, versao));
}
