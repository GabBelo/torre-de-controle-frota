// Regras da torre de controle: em qual quadro cada veículo aparece.
//
// Cada veículo entra em UM quadro só — a ordem das regras resolve os casos
// ambíguos do mundo real (ex.: veículo ainda no raio do CD, mas com viagem
// aberta, não pode aparecer em "trânsito para loja").
import { dentroDoRaio } from "./geo.js";

export const QUADROS = ["PATIO_CD", "TRANSITO_LOJA", "DOCA_LOJA", "TRANSITO_CD", "SEM_SINAL"];
export const TIPOS_TRACAO = ["Conj. Seco", "Truck Seco", "Conj. Frigo", "Truck Frigo"];

export const LIMITE_PATIO_MIN = 60; // programado parado no pátio além disso = alerta
export const LIMITE_SINAL_MIN = 30; // posição mais velha que isso = sem sinal

/** "Conj. Frigo" -> { grupo: "tracao", equipamento: "cavalo", frio: true } */
export function perfilDoTipo(tipo) {
  const frio = /frigo/i.test(tipo);
  if (/^carreta/i.test(tipo)) return { grupo: "carreta", equipamento: "carreta", frio };
  return { grupo: "tracao", equipamento: /^truck/i.test(tipo) ? "truck" : "cavalo", frio };
}

/**
 * @param veiculo  { placa, tipo, posicao: {lat, lon, em}, viagem: {loja, status} | null, indisponivel }
 * @param locais   { cd: {lat, lon, raioM}, lojas: { [codigo]: {lat, lon, raioM} } }
 */
export function classificar(veiculo, locais, agora) {
  const idadeSinalMin = (agora - new Date(veiculo.posicao.em)) / 60_000;
  if (idadeSinalMin > LIMITE_SINAL_MIN) return "SEM_SINAL";

  if (dentroDoRaio(veiculo.posicao, locais.cd)) return "PATIO_CD"; // 1) no raio do CD é sempre pátio
  const loja = veiculo.viagem ? locais.lojas[veiculo.viagem.loja] : null;
  if (loja && dentroDoRaio(veiculo.posicao, loja)) return "DOCA_LOJA"; // 2) no raio da loja de destino
  if (veiculo.viagem?.status === "ENTREGUE" || !veiculo.viagem) return "TRANSITO_CD"; // 3) voltando
  return "TRANSITO_LOJA";
}

function paraItem(v, quadro, agora) {
  const { grupo, equipamento, frio } = perfilDoTipo(v.tipo);
  const minutos = Math.round((agora - new Date(v.entrouNoQuadroEm ?? v.posicao.em)) / 60_000);
  const programado = quadro === "PATIO_CD" && Boolean(v.viagem) && !v.indisponivel;
  const prev = v.viagem?.previstoEm ?? null;
  const agend = v.viagem?.agendadoEm ?? null;
  return {
    placa: v.placa,
    sub: v.sub ?? null, // carreta engatada no cavalo
    tipo: v.tipo,
    grupo,
    equipamento,
    frio,
    loja: v.viagem?.loja ?? null,
    minutos,
    previstoEm: quadro === "PATIO_CD" ? null : prev,
    agendadoEm: quadro === "TRANSITO_LOJA" ? agend : null,
    programado,
    indisponivel: Boolean(v.indisponivel),
    // Alertas: programado parado no pátio além do limite, ou previsão de chegada depois do agendamento.
    alerta:
      (programado && minutos > LIMITE_PATIO_MIN) ||
      (quadro === "TRANSITO_LOJA" && prev && agend && new Date(prev) > new Date(agend)) ||
      (quadro === "DOCA_LOJA" && grupo === "tracao" && minutos > LIMITE_PATIO_MIN), // carreta solta na loja pode ficar
  };
}

function contarPorTipo(itens) {
  const c = Object.fromEntries(TIPOS_TRACAO.map((t) => [t, 0]));
  for (const i of itens) if (i.tipo in c) c[i.tipo]++;
  return c;
}

/** Matriz do pátio: linhas DISP/PROG/INDISP x colunas seco/frigo x cavalo/carreta/truck. */
function matrizPatio(itens) {
  const linha = () => ({ seco: { cavalo: 0, carreta: 0, truck: 0 }, frigo: { cavalo: 0, carreta: 0, truck: 0 } });
  const m = { disp: linha(), prog: linha(), indisp: linha() };
  for (const i of itens) {
    const status = i.indisponivel ? "indisp" : i.programado ? "prog" : "disp";
    m[status][i.frio ? "frigo" : "seco"][i.equipamento]++;
  }
  return m;
}

/** Monta o payload do painel: quadros, contadores e ordenação. */
export function montarPainel(veiculos, locais, agora = new Date()) {
  const quadros = Object.fromEntries(QUADROS.map((q) => [q, []]));
  for (const v of veiculos) {
    const q = classificar(v, locais, agora);
    quadros[q].push(paraItem(v, q, agora));
  }

  // Pátio e doca: alertas e programados no topo, depois do mais antigo para o mais novo.
  const prioridade = (i) => (i.alerta ? 2 : 0) + (i.programado ? 1 : 0);
  for (const q of ["PATIO_CD", "DOCA_LOJA", "SEM_SINAL"]) {
    quadros[q].sort((a, b) => prioridade(b) - prioridade(a) || b.minutos - a.minutos);
  }
  // Trânsitos: ordem de chegada prevista.
  for (const q of ["TRANSITO_LOJA", "TRANSITO_CD"]) {
    quadros[q].sort((a, b) => String(a.previstoEm).localeCompare(String(b.previstoEm)));
  }

  const resumo = {
    total: Object.fromEntries(QUADROS.map((q) => [q, quadros[q].length])),
    patio: matrizPatio(quadros.PATIO_CD),
    porTipo: {
      TRANSITO_LOJA: contarPorTipo(quadros.TRANSITO_LOJA),
      DOCA_LOJA: contarPorTipo(quadros.DOCA_LOJA),
      TRANSITO_CD: contarPorTipo(quadros.TRANSITO_CD),
    },
    alertas: Object.values(quadros).flat().filter((i) => i.alerta).length,
  };

  return { geradoEm: agora.toISOString(), resumo, quadros };
}
