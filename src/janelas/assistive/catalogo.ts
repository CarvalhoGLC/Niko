import { controle, type AppInstalado } from "../../ponte/ponteLocal";

let lista: AppInstalado[] | null = null;
let carregando: Promise<AppInstalado[]> | null = null;
const icones = new Map<string, string | null>();
const pedidos = new Map<string, Promise<void>>();

export function listarAppsAssistive(forcar = false): Promise<AppInstalado[]> {
  if (carregando) return carregando;
  if (lista && !forcar) return Promise.resolve(lista);
  carregando = controle.apps(forcar).then((apps) => {
    lista = apps.filter((a) => a.id && a.nome).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return lista;
  }).finally(() => { carregando = null; });
  return carregando;
}

export async function carregarIconesAssistive(ids: string[]): Promise<Record<string, string | null>> {
  const unicos = [...new Set(ids)];
  const faltando = unicos.filter((id) => !icones.has(id) && !pedidos.has(id));
  if (faltando.length) {
    const pedido = controle.iconesDeApps(faltando).then((resposta) => {
      for (const id of faltando) icones.set(id, resposta.find((i) => i.id === id)?.icone ?? null);
    }).finally(() => { for (const id of faltando) pedidos.delete(id); });
    for (const id of faltando) pedidos.set(id, pedido);
  }
  await Promise.all(unicos.map((id) => pedidos.get(id)));
  return Object.fromEntries(unicos.map((id) => [id, icones.get(id) ?? null]));
}
