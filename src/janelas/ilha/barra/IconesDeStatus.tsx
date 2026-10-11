import { EthernetPort, GlobeOff, Unplug, Volume1, Volume2, VolumeX, Wifi, WifiHigh, WifiLow, WifiOff, Zap } from "lucide-react";
import type { EstadoSistema } from "../../../ponte/ponteLocal";

export function IconeDeVolume({ volume, mudo, tamanho }: { volume: number; mudo: boolean; tamanho: number }) {
  if (mudo || volume === 0) return <VolumeX size={tamanho} />;
  return volume < 50 ? <Volume1 size={tamanho} /> : <Volume2 size={tamanho} />;
}

export function IconeDeSinal({ sinal, tamanho }: { sinal: number; tamanho: number }) {
  if (sinal >= 70) return <Wifi size={tamanho} />;
  return sinal >= 40 ? <WifiHigh size={tamanho} /> : <WifiLow size={tamanho} />;
}

export function wifiLigado(rede: EstadoSistema) {
  return rede.radios.WiFi ?? rede.wifi.existe;
}

export function IconeDeWifi({ rede, tamanho }: { rede: EstadoSistema; tamanho: number }) {
  if (!wifiLigado(rede) || !rede.wifi.conectado) return <WifiOff size={tamanho} />;
  return <IconeDeSinal sinal={rede.wifi.sinal ?? 100} tamanho={tamanho} />;
}

export type SituacaoDaRede = "cabo" | "wifi" | "semInternet" | "wifiDesconectado" | "desconectado";

export function situacaoDaRede(rede: EstadoSistema): SituacaoDaRede {
  const cabo = rede.conexao?.cabo ?? false;
  const wifi = wifiLigado(rede) && rede.wifi.conectado;
  if ((cabo || wifi) && rede.conexao?.internet === false) return "semInternet";
  if (cabo) return "cabo";
  if (wifi) return "wifi";
  return rede.wifi.existe ? "wifiDesconectado" : "desconectado";
}

export function IconeDeRede({ rede, tamanho }: { rede: EstadoSistema; tamanho: number }) {
  const situacao = situacaoDaRede(rede);
  if (situacao === "cabo") return <EthernetPort size={tamanho} />;
  if (situacao === "semInternet") return <GlobeOff size={tamanho} />;
  if (situacao === "desconectado") return <Unplug size={tamanho} />;
  return <IconeDeWifi rede={rede} tamanho={tamanho} />;
}

export function BateriaDesenhada({ nivel, carregando }: { nivel: number; carregando: boolean }) {
  const limitado = Math.max(0, Math.min(100, nivel));
  return (
    <span className="ilha-bateria" data-carregando={carregando || undefined} data-baixa={(limitado <= 15 && !carregando) || undefined} aria-hidden="true">
      <span className="ilha-bateria-nivel" style={{ width: `calc((100% - 3px) * ${limitado / 100})` }} />
      {carregando && <Zap size={8} strokeWidth={3} className="ilha-bateria-raio" />}
    </span>
  );
}
