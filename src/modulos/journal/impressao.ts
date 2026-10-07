import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, getDaysInMonth, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { useRotina, tarefasDoDia, habitoCumprido } from "../../estado/rotina";
import { useConfig } from "../../estado/configuracoes";
import { T } from "../../textos/textos";
import { formatar, formatarData, paraISO, hojeISO } from "../../utilitarios/datas";
import { sanitizarHtml, escaparHtml } from "../../utilitarios/sanitizar";
import type { Humor } from "../../tipos";

const COR_HUMOR: Record<Humor, string> = { otimo: "#22c55e", bom: "#84cc16", neutro: "#f59e0b", dificil: "#ef4444" };

function e(texto: string) {
  return escaparHtml(texto);
}

function litros(ml: number) {
  return (ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function imprimirMes(mes: Date, aoFalhar: () => void) {
  const { tarefas, dias, habitos, registros } = useRotina.getState();
  const cfg = useConfig.getState();
  const P = T.journal.impressao;
  const destaque = getComputedStyle(document.documentElement).getPropertyValue("--destaque").trim() || "#7c5ce0";
  const inicio = startOfMonth(mes);
  const lista = Array.from({ length: getDaysInMonth(inicio) }, (_, i) => paraISO(addDays(inicio, i)));
  const ativos = habitos.filter((h) => !h.arquivado);
  const hoje = hojeISO();

  const tarefasMes = lista.flatMap((d) => tarefasDoDia(tarefas, d));
  const concluidas = tarefasMes.filter((t) => t.status === "concluida").length;
  const sonos = lista.map((d) => dias[d]?.sono ?? 0).filter((v) => v > 0);
  const aguas = lista.map((d) => dias[d]?.agua ?? 0).filter((v) => v > 0);
  const humores = lista.map((d) => dias[d]?.humor).filter((h): h is Humor => !!h);
  const contagem = humores.reduce<Record<string, number>>((a, h) => ((a[h] = (a[h] ?? 0) + 1), a), {});
  const predominante = (Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "") as Humor | "";
  const passados = lista.filter((d) => d <= hoje);
  const totalHab = ativos.length * passados.length;
  const feitosHab = ativos.reduce((a, h) => a + passados.filter((d) => habitoCumprido(h, registros[d]?.[h.id])).length, 0);
  const registrados = lista.filter((d) => dias[d] && (dias[d].diario || dias[d].nota || dias[d].humor || dias[d].sono || dias[d].agua)).length;

  const estat = [
    [String(registrados), P.diasRegistrados],
    [`${concluidas}/${tarefasMes.length}`, P.tarefasConcluidas],
    [sonos.length ? `${(sonos.reduce((a, b) => a + b, 0) / sonos.length).toFixed(1).replace(".", ",")} h` : "--", P.mediaSono],
    [aguas.length ? `${litros(aguas.reduce((a, b) => a + b, 0) / aguas.length)} L` : "--", P.mediaAgua],
    [predominante ? T.humor[predominante] : "--", P.humorPredominante],
    [totalHab ? `${Math.round((feitosHab / totalHab) * 100)}%` : "--", P.habitosCumpridos],
  ];

  const grade = eachDayOfInterval({ start: startOfWeek(inicio, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(inicio), { weekStartsOn: 1 }) });
  const calendario = grade
    .map((d) => {
      const iso = paraISO(d);
      const dia = dias[iso];
      const fora = !isSameMonth(d, inicio);
      const cor = dia?.humor ? COR_HUMOR[dia.humor] : "transparent";
      const agua = dia?.agua ? Math.min(1, dia.agua / cfg.agua.meta) : 0;
      return `<div class="cal-dia${fora ? " fora" : ""}" style="--humor:${cor}"><span>${d.getDate()}</span>${dia?.diario ? '<i class="ponto"></i>' : ""}${agua ? `<b class="agua" style="width:${Math.round(agua * 100)}%"></b>` : ""}</div>`;
    })
    .join("");

  const tabelaHabitos = ativos.length
    ? `<table class="habitos"><thead><tr><th></th>${lista.map((d) => `<th>${Number(d.slice(8))}</th>`).join("")}</tr></thead><tbody>${ativos
        .map((h) => `<tr><th>${e(h.nome)}</th>${lista.map((d) => `<td>${habitoCumprido(h, registros[d]?.[h.id]) ? '<i class="ok"></i>' : (registros[d]?.[h.id] ?? 0) > 0 ? '<i class="meio"></i>' : '<i class="nao"></i>'}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`
    : "";

  const entradas = lista
    .map((d) => {
      const dia = dias[d];
      const t = tarefasDoDia(tarefas, d);
      if (!dia && t.length === 0) return "";
      const hab = ativos.filter((h) => habitoCumprido(h, registros[d]?.[h.id]));
      const chips = [
        dia?.humor ? `<span class="chip" style="--c:${COR_HUMOR[dia.humor]}"><i></i>${e(T.humor[dia.humor])}</span>` : "",
        dia?.sono ? `<span class="chip">${e(T.journal.sono)}: ${String(dia.sono).replace(".", ",")} h</span>` : "",
        dia?.agua ? `<span class="chip agua-chip">${e(T.journal.agua)}: ${litros(dia.agua)} L</span>` : "",
      ].join("");
      const listaTarefas = t.length
        ? `<ul class="tarefas">${t.map((x) => `<li class="${x.status}"><i></i><span>${e(x.titulo)}</span>${x.status !== "concluida" && x.status !== "a_fazer" ? `<em>${e(T.status[x.status])}</em>` : ""}</li>`).join("")}</ul>`
        : "";
      return `<article class="dia"><div class="data"><b>${d.slice(8)}</b><span>${e(formatar(d, "EEE"))}</span></div><div class="conteudo">${chips ? `<div class="chips">${chips}</div>` : ""}${listaTarefas}${hab.length ? `<div class="hab">${hab.map((h) => `<span>${e(h.nome)}</span>`).join("")}</div>` : ""}${dia?.diario ? `<div class="diario">${sanitizarHtml(dia.diario)}</div>` : ""}${dia?.nota ? `<p class="nota">${e(dia.nota)}</p>` : ""}${[dia?.manha, dia?.tarde, dia?.noite].some(Boolean) ? `<div class="periodos">${(["manha", "tarde", "noite"] as const).filter((p) => dia?.[p]).map((p) => `<span><b>${e(T.journal[p])}</b> ${e(dia![p])}</span>`).join("")}</div>` : ""}</div></article>`;
    })
    .filter(Boolean)
    .join("");

  const foto = cfg.foto ? `<img class="foto" src="${cfg.foto}" alt="">` : `<span class="foto letra">${e((cfg.nome || "N").slice(0, 1).toUpperCase())}</span>`;
  const titulo = formatarData(inicio, "MMMM yyyy");
  const css = `
  @page { size: A4 portrait; margin: 12mm 12mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  :root { --d: ${destaque}; }
  body { margin: 0; font-family: "Inter", system-ui, sans-serif; color: #1c1c1e; font-size: 11.5px; line-height: 1.5; background: #fff; }
  .pagina { max-width: 186mm; margin: 0 auto; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-radius: 16px; background: linear-gradient(135deg, color-mix(in srgb, var(--d) 16%, #fff), #fff 70%); border: 1px solid #ececec; }
  .marca { display: flex; align-items: center; gap: 12px; }
  .logo { width: 38px; height: 38px; border-radius: 10px; background: #111; color: #fff; display: grid; place-items: center; font: 700 20px "IBM Plex Mono", ui-monospace, monospace; }
  h1 { margin: 0; font: 700 22px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: -0.01em; text-transform: capitalize; }
  .rotulo { font: 600 9.5px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: 0.12em; text-transform: uppercase; color: var(--d); }
  .pessoa { display: flex; align-items: center; gap: 10px; text-align: right; }
  .pessoa b { display: block; font-size: 13px; }
  .pessoa small { color: #8a8a8a; }
  .foto { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: 0 0 0 1px #e5e5e5; }
  .letra { display: grid; place-items: center; background: color-mix(in srgb, var(--d) 18%, #fff); color: var(--d); font-weight: 700; font-size: 18px; }
  .estat { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin: 14px 0; }
  .estat div { padding: 10px; border: 1px solid #ececec; border-radius: 12px; }
  .estat b { display: block; font: 700 16px "IBM Plex Mono", ui-monospace, monospace; }
  .estat span { color: #8a8a8a; font-size: 9.5px; }
  .bloco { border: 1px solid #ececec; border-radius: 14px; padding: 14px; margin-bottom: 14px; break-inside: avoid; }
  .bloco h2 { margin: 0 0 10px; font: 600 10px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: 0.1em; text-transform: uppercase; color: #8a8a8a; }
  .duas { display: grid; grid-template-columns: 1fr 1.2fr; gap: 14px; }
  .semana, .cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .semana span { text-align: center; font-size: 9px; color: #9a9a9a; text-transform: uppercase; }
  .cal-dia { position: relative; height: 34px; border-radius: 8px; background: color-mix(in srgb, var(--humor) 22%, #f6f6f5); border: 1px solid color-mix(in srgb, var(--humor) 50%, #eee); padding: 3px 5px; font-size: 10px; overflow: hidden; }
  .cal-dia.fora { opacity: 0.3; }
  .cal-dia .ponto { position: absolute; top: 5px; right: 5px; width: 5px; height: 5px; border-radius: 50%; background: var(--d); }
  .cal-dia .agua { position: absolute; left: 0; bottom: 0; height: 3px; background: #60a5fa; }
  .legenda { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; font-size: 9.5px; color: #6b6b6b; }
  .legenda i { display: inline-block; width: 8px; height: 8px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
  table.habitos { width: 100%; border-collapse: collapse; font-size: 8.5px; table-layout: fixed; }
  table.habitos th { font-weight: 500; color: #9a9a9a; padding: 1px; }
  table.habitos tbody th { text-align: left; color: #1c1c1e; font-size: 9.5px; width: 26mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  table.habitos td { text-align: center; padding: 1px; }
  table.habitos i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; background: #eeeeec; }
  table.habitos i.ok { background: var(--d); }
  table.habitos i.meio { background: color-mix(in srgb, var(--d) 40%, #fff); }
  .dia { display: grid; grid-template-columns: 46px 1fr; gap: 12px; padding: 12px 0; border-top: 1px dashed #e5e5e5; break-inside: avoid; }
  .dia:first-of-type { border-top: 0; }
  .data { text-align: center; }
  .data b { display: block; font: 700 22px/1 "IBM Plex Mono", ui-monospace, monospace; color: var(--d); }
  .data span { font-size: 9.5px; color: #8a8a8a; text-transform: uppercase; letter-spacing: 0.06em; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; background: #f4f4f2; font-size: 10px; }
  .chip i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
  .agua-chip { background: #e8f3ff; color: #1d4ed8; }
  ul.tarefas { list-style: none; margin: 0 0 6px; padding: 0; }
  ul.tarefas li { display: flex; align-items: center; gap: 7px; padding: 1px 0; }
  ul.tarefas li i { width: 10px; height: 10px; border-radius: 3px; border: 1.5px solid #bdbdbd; flex: 0 0 auto; }
  ul.tarefas li.concluida i { background: var(--d); border-color: var(--d); }
  ul.tarefas li.concluida span { text-decoration: line-through; color: #8a8a8a; }
  ul.tarefas li.cancelada span { text-decoration: line-through; color: #b0b0b0; }
  ul.tarefas em { font-style: normal; font-size: 9px; color: #8a8a8a; border: 1px solid #e5e5e5; border-radius: 999px; padding: 0 6px; }
  .hab { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
  .hab span { font-size: 9.5px; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--d) 12%, #fff); color: color-mix(in srgb, var(--d) 75%, #000); }
  .diario { font-size: 11px; color: #2a2a2e; }
  .diario p { margin: 0 0 4px; }
  .nota { margin: 6px 0 0; padding: 6px 10px; border-radius: 8px; background: #fff8db; border-left: 3px solid #f2c94c; font-size: 10.5px; }
  .periodos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px; font-size: 10px; color: #4a4a4a; }
  .periodos b { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9a9a; }
  footer { margin-top: 18px; text-align: center; font-size: 9px; color: #a0a0a0; }
  .vazio { color: #9a9a9a; text-align: center; padding: 24px; }
  `;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${e(T.journal.titulo)} ${e(titulo)}</title><style>${css}</style></head><body><div class="pagina">
  <header><div class="marca"><span class="logo">N</span><div><span class="rotulo">${e(T.journal.titulo)}</span><h1>${e(titulo)}</h1></div></div><div class="pessoa"><div><b>${e(cfg.nome || T.barraLateral.perfil)}</b><small>${e(P.geradoEm(formatar(hoje, "d 'de' MMMM 'de' yyyy")))}</small></div>${foto}</div></header>
  <section class="estat">${estat.map(([v, r]) => `<div><b>${e(v)}</b><span>${e(r)}</span></div>`).join("")}</section>
  <div class="duas">
    <section class="bloco"><h2>${e(P.humorDoMes)}</h2><div class="semana">${T.calendario.diasSemana.map((d) => `<span>${e(d)}</span>`).join("")}</div><div class="cal">${calendario}</div><div class="legenda">${(Object.keys(COR_HUMOR) as Humor[]).map((h) => `<span><i style="background:${COR_HUMOR[h]}"></i>${e(T.humor[h])}</span>`).join("")}<span><i style="background:#60a5fa"></i>${e(T.journal.agua)}</span></div></section>
    <section class="bloco"><h2>${e(T.journal.habitos)}</h2>${tabelaHabitos || `<p class="vazio">${e(T.journal.semHabitos)}</p>`}</section>
  </div>
  <section class="bloco"><h2>${e(P.dias)}</h2>${entradas || `<p class="vazio">${e(P.semRegistros)}</p>`}</section>
  <footer>${e(P.rodape)}</footer>
  </div></body></html>`;

  imprimirEmQuadroInvisivel(html, aoFalhar);
}

const ESPERA_PARA_IMPRIMIR_MS = 350;
const LIMITE_DO_QUADRO_MS = 10 * 60_000;

function imprimirEmQuadroInvisivel(html: string, aoFalhar: () => void) {
  document.querySelector("iframe[data-niko-impressao]")?.remove();
  const quadro = document.createElement("iframe");
  quadro.dataset.nikoImpressao = "";
  quadro.setAttribute("aria-hidden", "true");
  quadro.tabIndex = -1;
  quadro.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  const endereco = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const remover = () => {
    quadro.remove();
    URL.revokeObjectURL(endereco);
  };
  quadro.onload = () => {
    const alvo = quadro.contentWindow;
    if (!alvo) {
      remover();
      aoFalhar();
      return;
    }
    alvo.addEventListener("afterprint", () => window.setTimeout(remover, 0), { once: true });
    window.setTimeout(() => {
      try {
        alvo.focus();
        alvo.print();
      } catch {
        remover();
        aoFalhar();
      }
    }, ESPERA_PARA_IMPRIMIR_MS);
    window.setTimeout(remover, LIMITE_DO_QUADRO_MS);
  };
  quadro.src = endereco;
  document.body.appendChild(quadro);
}
