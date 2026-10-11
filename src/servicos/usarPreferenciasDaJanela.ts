import { useEffect } from "react";
import { useConfig } from "../estado/configuracoes";
import { definirPreferenciasSom } from "../ponte/sons";
import { definirViradaDoDia } from "../utilitarios/datas";

export function usarPreferenciasDaJanela() {
  const sons = useConfig((s) => s.sons);
  const naoPerturbe = useConfig((s) => s.naoPerturbe);
  const virada = useConfig((s) => s.viradaAs4h);
  useEffect(() => {
    definirPreferenciasSom({ ...sons, silencioFoco: naoPerturbe });
  }, [sons, naoPerturbe]);
  useEffect(() => {
    definirViradaDoDia(virada);
  }, [virada]);
}
