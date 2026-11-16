// Regras da torre de controle: em qual quadro cada veículo aparece.
//
// Cada veículo entra em UM quadro só — a ordem das regras abaixo resolve os casos
// ambíguos que aparecem no mundo real (ex.: carreta que ainda está no raio do CD
// mas já tem viagem aberta não pode aparecer como "indo para loja").
import { dentroDoRaio } from "./geo.js";

export const QUADROS = ["PATIO_CD", "INDO_PARA_LOJA", "EM_LOJA", "VOLTANDO", "SEM_SINAL"];

export const LIMITE_PATIO_MIN = 60; // acima disso, veículo programado parado no pátio vira alerta
export const LIMITE_SINAL_MIN = 30; // posição mais velha que isso = sem sinal

/**
 * @param veiculo  { placa, tipo, posicao: {lat, lon, em}, viagem: {loja, status} | null, indisponivel }
 * @param locais   { cd: {lat, lon, raioM}, lojas: { [codigo]: {lat, lon, raioM, nome} } }
 * @param agora    Date
 */
export function classificar(veiculo, locais, agora) {
  const idadeSinalMin = (agora - new Date(veiculo.posicao.em)) / 60_000;
  if (idadeSinalMin > LIMITE_SINAL_MIN) return "SEM_SINAL";

  const noCd = dentroDoRaio(veiculo.posicao, locais.cd);
  const loja = veiculo.viagem ? locais.lojas[veiculo.viagem.loja] : null;
  const naLoja = loja ? dentroDoRaio(veiculo.posicao, loja) : false;

  // 1) Dentro do raio do CD é sempre pátio, mesmo com viagem aberta (ainda não saiu).
  if (noCd) return "PATIO_CD";
  // 2) Dentro do raio da loja de destino: em loja (descarregando).
  if (naLoja) return "EM_LOJA";
  // 3) Fora dos dois raios: depende da etapa da viagem.
  if (veiculo.viagem?.status === "ENTREGUE") return "VOLTANDO";
  if (veiculo.viagem) return "INDO_PARA_LOJA";
  return "VOLTANDO"; // sem viagem e fora do CD: retornando vazio
}

/** Alertas visuais do quadro "Pátio CD". */
export function alertasPatio(veiculo, minutosNoPatio) {
  return {
    indisponivel: Boolean(veiculo.indisponivel),
    // Só é problema ficar parado se o veículo já tem viagem programada.
    atrasoSaida: Boolean(veiculo.viagem) && !veiculo.indisponivel && minutosNoPatio > LIMITE_PATIO_MIN,
  };
}

/** Monta o payload do painel: quadros, contadores e ordenação. */
export function montarPainel(veiculos, locais, agora = new Date()) {
  const quadros = Object.fromEntries(QUADROS.map((q) => [q, []]));

  for (const v of veiculos) {
    const quadro = classificar(v, locais, agora);
    const minutosNoQuadro = Math.round((agora - new Date(v.entrouNoQuadroEm ?? v.posicao.em)) / 60_000);
    const item = {
      placa: v.placa,
      tipo: v.tipo,
      loja: v.viagem ? locais.lojas[v.viagem.loja]?.nome ?? v.viagem.loja : null,
      minutos: minutosNoQuadro,
      ...(quadro === "PATIO_CD" ? alertasPatio(v, minutosNoQuadro) : {}),
    };
    quadros[quadro].push(item);
  }

  // Pátio: programados primeiro, do mais antigo para o mais novo (quem está esperando há mais tempo no topo).
  quadros.PATIO_CD.sort((a, b) => Number(Boolean(b.loja)) - Number(Boolean(a.loja)) || b.minutos - a.minutos);
  for (const q of ["INDO_PARA_LOJA", "EM_LOJA", "VOLTANDO", "SEM_SINAL"]) quadros[q].sort((a, b) => b.minutos - a.minutos);

  const contadores = Object.fromEntries(QUADROS.map((q) => [q, quadros[q].length]));
  contadores.PATIO_INDISPONIVEIS = quadros.PATIO_CD.filter((i) => i.indisponivel).length;
  contadores.PATIO_ATRASADOS = quadros.PATIO_CD.filter((i) => i.atrasoSaida).length;

  return { geradoEm: agora.toISOString(), contadores, quadros };
}
