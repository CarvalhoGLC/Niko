import { addDays, format, parseISO, differenceInCalendarDays, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { T } from "../textos/textos";

export function paraISO(data: Date): string {
  return format(data, "yyyy-MM-dd");
}

export function deISO(texto: string): Date {
  return parseISO(texto);
}

export function dataValida(texto: string | undefined): boolean {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  return isValid(parseISO(texto));
}

export function horaValida(texto: string | undefined): boolean {
  if (!texto) return false;
  const partes = /^(\d{1,2}):(\d{2})$/.exec(texto);
  if (!partes) return false;
  return Number(partes[1]) < 24 && Number(partes[2]) < 60;
}

let viradaAs4h = false;

export function definirViradaDoDia(ativa: boolean) {
  viradaAs4h = ativa;
}

export function agoraDoNiko(): Date {
  const agora = new Date();
  if (viradaAs4h && agora.getHours() < 4) return addDays(agora, -1);
  return agora;
}

export function hojeISO(): string {
  return paraISO(agoraDoNiko());
}

export function formatar(texto: string, padrao: string): string {
  return format(parseISO(texto), padrao, { locale: ptBR });
}

export function formatarData(data: Date, padrao: string): string {
  return format(data, padrao, { locale: ptBR });
}

export function diasAte(texto: string): number {
  return differenceInCalendarDays(parseISO(texto), parseISO(hojeISO()));
}

export function descreverDistancia(texto: string): string {
  const dias = diasAte(texto);
  if (dias === 0) return T.datas.hoje;
  if (dias === 1) return T.datas.amanha;
  if (dias === -1) return T.datas.ontem;
  if (dias > 1) return T.datas.emDias(dias);
  return T.datas.haDias(Math.abs(dias));
}

export function horarioRelativo(iso: string): string {
  const segundos = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 45) return T.datas.agora;
  if (segundos < 3600) return T.datas.haMin(Math.round(segundos / 60));
  if (segundos < 86400) return T.datas.haHoras(Math.round(segundos / 3600));
  return T.datas.haDiasCurto(Math.round(segundos / 86400));
}

export function diaDoMomento(iso: string): string {
  const momento = new Date(iso);
  return paraISO(viradaAs4h && momento.getHours() < 4 ? addDays(momento, -1) : momento);
}

export function mesISO(texto: string): string {
  return texto.slice(0, 7);
}

export function saudacao(): string {
  const hora = new Date().getHours();
  if (hora < 5) return T.datas.boaNoite;
  if (hora < 12) return T.datas.bomDia;
  if (hora < 18) return T.datas.boaTarde;
  return T.datas.boaNoite;
}
