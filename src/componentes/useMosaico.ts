import { useLayoutEffect, type RefObject } from "react";

const SECAO_EXTRA = ".inicio-secao-extra";
const ITEM_EXTRA = ".inicio-item-extra";

function preencher(cartao: HTMLElement) {
  const secoes = Array.from(cartao.querySelectorAll<HTMLElement>(SECAO_EXTRA));
  const extras = Array.from(cartao.querySelectorAll<HTMLElement>(ITEM_EXTRA));
  for (const el of [...secoes, ...extras]) el.style.display = "";
  for (let i = extras.length - 1; i >= 0 && cartao.scrollHeight > cartao.clientHeight + 1; i--) extras[i].style.display = "none";
  for (const s of secoes) {
    const itens = Array.from(s.querySelectorAll<HTMLElement>(ITEM_EXTRA));
    if (itens.length === 0 || itens.every((x) => x.style.display === "none")) s.style.display = "none";
  }
}

function organizar(grade: HTMLElement) {
  const itens = Array.from(grade.children) as HTMLElement[];
  grade.dataset.medindo = "sim";
  for (const el of itens) {
    el.style.height = "";
    for (const x of el.querySelectorAll<HTMLElement>(`${ITEM_EXTRA}, ${SECAO_EXTRA}`)) x.style.display = "";
  }
  const alturas = itens.map((el) => el.getBoundingClientRect().height);
  delete grade.dataset.medindo;
  itens.forEach((el, i) => {
    el.style.height = `${alturas[i]}px`;
    preencher(el);
  });
}

export function useMosaico(ref: RefObject<HTMLElement | null>, chave: string) {
  useLayoutEffect(() => {
    const grade = ref.current;
    if (!grade) return;
    let quadro = 0;
    let largura = grade.clientWidth;
    const agendar = () => {
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        organizar(grade);
      });
    };
    organizar(grade);
    const tamanho = new ResizeObserver(() => {
      if (grade.clientWidth === largura) return;
      largura = grade.clientWidth;
      agendar();
    });
    tamanho.observe(grade);
    const mudancas = new MutationObserver(agendar);
    mudancas.observe(grade, { childList: true, subtree: true, characterData: true });
    const aoCarregarFonte = () => agendar();
    document.fonts?.addEventListener?.("loadingdone", aoCarregarFonte);
    return () => {
      tamanho.disconnect();
      mudancas.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", aoCarregarFonte);
      cancelAnimationFrame(quadro);
    };
  }, [ref, chave]);
}
