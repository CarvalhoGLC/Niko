import type { AppAberto } from "../../desktop/desktop";
import { T } from "../../textos/textos";

export type AcaoDaJanela = "focar" | "minimizar" | "fechar";

/** Confere se o HWND ainda pertence ao mesmo processo antes de agir. */
export async function executarNasJanelas(acao: AcaoDaJanela, alvos: AppAberto[], pedir: typeof fetch = fetch) {
  const resposta = await pedir("/ponte/janelas", { headers: { "x-niko": "1" }, signal: AbortSignal.timeout(20000) });
  if (!resposta.ok) throw new Error(T.dock.menu.falhou);
  const dados = await resposta.json() as { janelas?: AppAberto[] | AppAberto };
  const atuais = Array.isArray(dados.janelas) ? dados.janelas : dados.janelas ? [dados.janelas] : [];
  let ausentes = 0;
  let falhas = 0;
  for (const alvo of alvos) {
    const atual = atuais.find((j) => j.id === alvo.id && j.pid === alvo.pid);
    if (!atual) { ausentes++; continue; }
    if (acao === "minimizar" && atual.minimizada) continue;
    try {
      const r = await pedir(`/ponte/janelas/${acao}`, {
        method: "POST", headers: { "x-niko": "1", "content-type": "application/json" },
        body: JSON.stringify({ janela: atual.id }), signal: AbortSignal.timeout(20000),
      });
      if (!r.ok || (await r.json() as { ok?: boolean }).ok !== true) falhas++;
    } catch { falhas++; }
  }
  if (falhas) throw new Error(T.dock.menu.falhou);
  if (ausentes) throw new Error(T.dock.menu.ausente);
}

export function limitarMenu(x: number, y: number, largura: number, altura: number, telaW: number, telaH: number) {
  return { x: Math.max(8, Math.min(x, telaW - largura - 8)), y: Math.max(8, Math.min(y - altura, telaH - altura - 8)) };
}
