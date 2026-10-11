import type { SessaoClaude } from "../../../estado/claudeCode";
import { T } from "../../../textos/textos";

export function indicadorDePermissoes(sessao: Pick<SessaoClaude, "modo" | "modoAtualizadoEm" | "modoConfirmado">, agora: number) {
  const C = T.ilha.claude;
  if (!sessao.modo || !Object.hasOwn(C.modos, sessao.modo)) return { texto: C.modoNaoInformado, dica: C.modoDica };
  const nome = C.modos[sessao.modo];
  const idade = agora - Date.parse(sessao.modoAtualizadoEm ?? "");
  const atual = sessao.modoConfirmado && Number.isFinite(idade) && idade >= 0 && idade < 90000;
  return { texto: atual ? C.modoInformado(nome) : C.ultimoModo(nome), dica: C.modoDica };
}
