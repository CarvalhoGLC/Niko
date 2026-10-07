import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./estilos/tokens.css";
import "./estilos/base.css";
import "./estilos/componentes.css";
import "./estilos/sistema.css";
import "./estilos/modulos.css";
import { iniciarArmazenamento } from "./ponte/armazenamento";
import { JANELA, NATIVO, prepararPonte, desviarLinksExternos } from "./desktop/desktop";
import { T } from "./textos/textos";

document.documentElement.dataset.tema = "claro";

const SELETOR_DAS_SOBREPOSTAS = ".ilha-raiz, .ilha-gatilho, .ilha-barra, .ilha-pop, .dock, .dock-gatilho, .dock-previa";

async function iniciar() {
  const sobreposta = JANELA === "ilha" || JANELA === "dock";
  if (sobreposta) document.documentElement.classList.add("janela-sobreposta");
  document.addEventListener("contextmenu", (e) => {
    const alvo = e.target as HTMLElement | null;
    if (alvo?.closest("input, textarea, [contenteditable='true']")) return;
    if (sobreposta || alvo?.closest(SELETOR_DAS_SOBREPOSTAS)) e.preventDefault();
  });
  await prepararPonte();
  desviarLinksExternos();
  let modo = "local";
  for (let tentativa = 0; tentativa < (NATIVO ? 120 : 1); tentativa++) {
    modo = await iniciarArmazenamento();
    if (modo === "banco") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const raiz = document.getElementById("raiz");
  if (!raiz) return;
  if (NATIVO && modo !== "banco") {
    if (JANELA !== "sistema") return;
    raiz.innerHTML = `<div class="falha-ponte"><h1>${T.app.ponteFalhou}</h1><p>${T.app.ponteFalhouDica}</p></div>`;
    return;
  }
  if (JANELA === "ilha" || JANELA === "dock") document.documentElement.classList.add("janela-sobreposta");
  let Raiz: () => React.ReactElement;
  if (!NATIVO) Raiz = (await import("./janelas/area-de-trabalho/AreaDeTrabalho")).AreaDeTrabalho;
  else {
    const apps = await import("./desktop/Aplicativos");
    Raiz = JANELA === "ilha" ? apps.AppIlha : JANELA === "dock" ? apps.AppDock : apps.AppSistema;
  }
  createRoot(raiz).render(
    <StrictMode>
      <Raiz />
    </StrictMode>,
  );
}

void iniciar();
