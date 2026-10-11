import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { lerConsumo, lerUsoOficial, type UsoFerramenta } from "../../../ponte/ponteLocal";
import { useConfig } from "../../../estado/configuracoes";
import { faltaPara, nivelDoUso, rotuloJanela } from "../../../utilitarios/consumo";
import { Marca, type MarcaId } from "../../../marcas/Marca";
import { T } from "../../../textos/textos";

const C = T.ilha.claude;
const INTERVALO_MS = 60_000;
const JANELAS = ["sessao", "semanal"] as const;
const MARCA_DO_USO: Record<string, MarcaId> = { claude: "claudecode", codex: "codex" };
const COR_DO_USO: Record<string, string> = { claude: "#d97757", codex: "#7a9dff" };
const TAMANHO = 28;
const RAIO = 12;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

function dicaDoUso(f: UsoFerramenta) {
  const linhas = JANELAS.map((id) => f.janelas.find((j) => j.id === id))
    .filter((j): j is NonNullable<typeof j> => Boolean(j))
    .map((j) => C.uso.linha(rotuloJanela(j.rotulo), Math.round(j.usado), faltaPara(j.reiniciaEm)));
  return [C.uso.nomes[f.id] ?? f.nome, ...linhas].join("\n");
}

function AnelDeUso({ ferramenta, indice }: { ferramenta: UsoFerramenta; indice: number }) {
  const sessao = ferramenta.janelas.find((j) => j.id === "sessao") ?? ferramenta.janelas[0];
  const usado = Math.max(0, Math.min(100, sessao?.usado ?? 0));
  const nivel = nivelDoUso(usado);
  const cor = nivel === "erro" ? "var(--i-vermelho)" : nivel === "alerta" ? "var(--i-ambar)" : COR_DO_USO[ferramenta.id] ?? "var(--i-verde)";
  const dica = dicaDoUso(ferramenta);
  return (
    <motion.span
      className="ias-anel"
      data-nivel={nivel}
      data-dica={dica}
      tabIndex={0}
      role="img"
      aria-label={dica.replace(/\n/g, ". ")}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 + indice * 0.08, type: "spring", visualDuration: 0.4, bounce: 0.35 }}
    >
      <svg width={TAMANHO} height={TAMANHO} viewBox={`0 0 ${TAMANHO} ${TAMANHO}`} aria-hidden="true">
        <circle className="ias-anel-trilho" cx={TAMANHO / 2} cy={TAMANHO / 2} r={RAIO} />
        <motion.circle
          cx={TAMANHO / 2}
          cy={TAMANHO / 2}
          r={RAIO}
          fill="none"
          stroke={cor}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeDasharray={CIRCUNFERENCIA}
          transform={`rotate(-90 ${TAMANHO / 2} ${TAMANHO / 2})`}
          initial={{ strokeDashoffset: CIRCUNFERENCIA }}
          animate={{ strokeDashoffset: CIRCUNFERENCIA * (1 - usado / 100) }}
          transition={{ delay: 0.25 + indice * 0.08, duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <span className="ias-anel-logo">
        <Marca marca={MARCA_DO_USO[ferramenta.id] ?? "claudecode"} tamanho={13} />
      </span>
    </motion.span>
  );
}

export function UsoDasIas() {
  const lerPlanos = useConfig((s) => s.consumo.lerPlanos);
  const [ferramentas, setFerramentas] = useState<UsoFerramenta[]>([]);

  useEffect(() => {
    let vivo = true;
    const ler = () => {
      if (document.hidden) return;
      (lerPlanos ? lerConsumo() : lerUsoOficial())
        .then((r) => vivo && setFerramentas(r.ferramentas.filter((f) => f.situacao === "ok" && f.janelas.length > 0)))
        .catch(() => undefined);
    };
    ler();
    const t = window.setInterval(ler, INTERVALO_MS);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [lerPlanos]);

  if (ferramentas.length === 0) return null;

  return (
    <span className="ias-aneis" aria-label={C.uso.titulo}>
      {ferramentas.map((f, i) => (
        <AnelDeUso key={f.id} ferramenta={f} indice={i} />
      ))}
    </span>
  );
}
