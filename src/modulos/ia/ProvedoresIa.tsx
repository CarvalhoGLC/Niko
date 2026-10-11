import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { SecaoIa } from "../configuracoes/SecaoIa";
import { T } from "../../textos/textos";

export default function ProvedoresIa() {
  return (
    <>
      <CabecalhoAba titulo={T.rotas.ia} subtitulo={T.provedoresIa.subtitulo} />
      <SecaoIa />
    </>
  );
}
