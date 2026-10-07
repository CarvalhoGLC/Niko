import { NATIVO } from "../../../desktop/desktop";
import { useIlha } from "../../../estado/ilha";

export const EVENTO_DA_SAUDACAO = "niko://saudacao";
export const LARGURA_DA_SAUDACAO = 520;
export const ALTURA_DA_SAUDACAO = 176;

export async function pedirSaudacao() {
  if (!NATIVO) {
    useIlha.getState().saudar();
    return;
  }
  const { emit } = await import("@tauri-apps/api/event");
  await emit(EVENTO_DA_SAUDACAO);
}
