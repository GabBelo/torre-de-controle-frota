// Fonte de dados FICTÍCIA: simula a frota e um banco lento.
// Em produção, este módulo seria substituído pelas consultas SQL ao TMS/rastreador.
// Coordenadas, placas e lojas são inventadas (região genérica do litoral de SC).

export const LOCAIS = {
  cd: { lat: -26.91, lon: -48.67, raioM: 600, nome: "CD Central" },
  lojas: Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => {
      const ang = (i / 30) * 2 * Math.PI;
      const dist = 0.08 + (i % 5) * 0.06; // 9 a 35 km do CD, em volta dele
      return [`L${String(i + 1).padStart(2, "0")}`, { lat: -26.91 + Math.sin(ang) * dist, lon: -48.67 + Math.cos(ang) * dist, raioM: 250 }];
    }),
  ),
};

const TRACAO = ["Conj. Seco", "Conj. Seco", "Truck Seco", "Conj. Frigo", "Truck Frigo", "Truck Frigo"];
const LETRAS = "ABCDEFGHJKLMNPRSTUVWXZ";

// Gerador pseudoaleatório com semente: dados reprodutíveis entre execuções.
function rng(semente) {
  let s = semente >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const perto = (local, r, metros) => ({
  lat: local.lat + ((r() - 0.5) * metros) / 111_000,
  lon: local.lon + ((r() - 0.5) * metros) / 111_000,
});
const entre = (a, b, t) => ({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });

/** Gera a frota no instante `agora`. A semente muda a cada 10 minutos, então o painel "mexe". */
export function gerarFrota(agora = new Date()) {
  const r = rng(Math.floor(agora.getTime() / 600_000));
  const escolher = (lista) => lista[Math.floor(r() * lista.length)];
  const usadas = new Set();
  const placa = () => {
    let p;
    do p = `T${escolher(LETRAS)}${escolher(LETRAS)}${Math.floor(r() * 10)}${escolher(LETRAS)}${Math.floor(r() * 90 + 10)}`;
    while (usadas.has(p));
    usadas.add(p);
    return p;
  };
  const codigosLojas = Object.keys(LOCAIS.lojas);
  const minAtras = (min) => new Date(agora - min * 60_000).toISOString();
  const minDepois = (min) => new Date(agora.getTime() + min * 60_000).toISOString();
  const veiculos = [];

  const tracao = (cenario) => {
    const tipo = escolher(TRACAO);
    const loja = escolher(codigosLojas);
    const destino = LOCAIS.lojas[loja];
    const sub = tipo.startsWith("Conj") ? placa() : null;
    const v = { placa: placa(), tipo, sub, viagem: null, indisponivel: false };

    if (cenario === "patio") {
      v.posicao = perto(LOCAIS.cd, r, 600);
      v.entrouNoQuadroEm = minAtras(Math.floor(r() * 400));
      if (r() < 0.35) v.viagem = { loja, status: "PROGRAMADA" };
      else v.indisponivel = r() < 0.15;
    } else if (cenario === "ida") {
      v.posicao = entre(LOCAIS.cd, destino, 0.15 + r() * 0.75);
      v.entrouNoQuadroEm = minAtras(Math.floor(r() * 180));
      const agendado = 60 + Math.floor(r() * 240);
      v.viagem = { loja, status: "EM_VIAGEM", agendadoEm: minDepois(agendado), previstoEm: minDepois(agendado - 150 + Math.floor(r() * 190)) };
    } else if (cenario === "doca") {
      v.posicao = perto(destino, r, 200);
      v.entrouNoQuadroEm = minAtras(Math.floor(r() * 140));
      v.viagem = { loja, status: "EM_VIAGEM" };
    } else if (cenario === "volta") {
      v.posicao = entre(destino, LOCAIS.cd, 0.1 + r() * 0.8);
      v.entrouNoQuadroEm = minAtras(Math.floor(r() * 400));
      v.viagem = { loja, status: "ENTREGUE", previstoEm: minDepois(-60 + Math.floor(r() * 180)) };
    } else { // sem sinal
      v.posicao = entre(LOCAIS.cd, destino, r());
      v.entrouNoQuadroEm = minAtras(40 + Math.floor(r() * 200));
    }
    v.posicao.em = cenario === "sem-sinal" ? v.entrouNoQuadroEm : minAtras(Math.floor(r() * 5));
    veiculos.push(v);
  };

  const carretaSolta = (naLoja) => {
    const loja = escolher(codigosLojas);
    veiculos.push({
      placa: placa(),
      tipo: r() < 0.75 ? "Carreta Seca" : "Carreta Frigo",
      viagem: naLoja ? { loja, status: "EM_VIAGEM" } : r() < 0.1 ? { loja, status: "PROGRAMADA" } : null,
      indisponivel: !naLoja && r() < 0.08,
      posicao: { ...perto(naLoja ? LOCAIS.lojas[loja] : LOCAIS.cd, r, 200), em: minAtras(Math.floor(r() * 5)) },
      entrouNoQuadroEm: minAtras(Math.floor(r() * 900)),
    });
  };

  for (let i = 0; i < 10; i++) tracao("patio");
  for (let i = 0; i < 9; i++) tracao("ida");
  for (let i = 0; i < 4; i++) tracao("doca");
  for (let i = 0; i < 22; i++) tracao("volta");
  for (let i = 0; i < 2; i++) tracao("sem-sinal");
  for (let i = 0; i < 26; i++) carretaSolta(false);
  for (let i = 0; i < 2; i++) carretaSolta(true);
  return veiculos;
}

/** Simula a consulta pesada ao banco (latência de 0,8 a 2 s). */
export async function consultarFrota({ latenciaMs } = {}) {
  const espera = latenciaMs ?? 800 + Math.random() * 1200;
  await new Promise((ok) => setTimeout(ok, espera));
  return gerarFrota(new Date());
}
