import type { FerramentaDeCodigo } from "../../../ponte/claudeCode";
import type { MarcaId } from "../../../marcas/Marca";
import { T } from "../../../textos/textos";

export const MARCA_DA_FERRAMENTA: Record<FerramentaDeCodigo, MarcaId> = {
  claude: "claudecode",
  codex: "codex",
  copilot: "copilot",
  opencode: "opencode",
  antigravity: "antigravity",
  kimi: "kimi",
  gemini: "gemini",
  amp: "amp",
};

export const COR_DA_FERRAMENTA: Record<FerramentaDeCodigo, string> = {
  claude: "#d97757",
  codex: "#7a9dff",
  copilot: "#a371f7",
  opencode: "#cfcfcf",
  antigravity: "#3186ff",
  kimi: "#5b8cff",
  gemini: "#8e75b2",
  amp: "#f34e3f",
};

export function nomeDaFerramenta(ferramenta: FerramentaDeCodigo | undefined): string {
  return T.ilha.claude.nomes[ferramenta ?? "claude"] ?? ferramenta ?? "";
}
