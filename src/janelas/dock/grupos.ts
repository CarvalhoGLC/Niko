import type { AppAberto } from "../../desktop/desktop";

function chaveDoApp(a: AppAberto) {
  return a.app === "ApplicationFrameHost" ? `uwp-${a.titulo}` : (a.caminho ?? a.app);
}

export function agruparApps(apps: AppAberto[]): Map<string, AppAberto[]> {
  const gruposPorApp = new Map<string, Set<string>>();
  for (const a of apps) {
    if (!a.grupo) continue;
    const chave = chaveDoApp(a);
    gruposPorApp.set(chave, (gruposPorApp.get(chave) ?? new Set()).add(a.grupo));
  }
  const grupos = new Map<string, AppAberto[]>();
  for (const a of apps) {
    const base = chaveDoApp(a);
    const separar = a.grupo && (gruposPorApp.get(base)?.size ?? 0) > 1;
    const chave = separar ? `${base}|${a.grupo}` : base;
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  return grupos;
}

export function nomeDoGrupo(principal: AppAberto): string {
  if (principal.app === "ApplicationFrameHost") return principal.titulo;
  return principal.nomeDoGrupo || principal.nome || principal.app;
}
