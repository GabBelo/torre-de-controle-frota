// Fonte de dados FICTÍCIA: simula a frota e um banco lento.
// Em produção, este módulo seria substituído pelas consultas SQL ao TMS/rastreador.
// Coordenadas e nomes são inventados (região genérica do litoral de SC).

export const LOCAIS = {
  cd: { lat: -26.9100, lon: -48.6700, raioM: 600, nome: "CD Central" },
  lojas: {
    L01: { lat: -26.9905, lon: -48.6350, raioM: 250, nome: "Loja 01" },
    L02: { lat: -26.8200, lon: -48.6500, raioM: 250, nome: "Loja 02" },
    L03: { lat: -27.0950, lon: -48.6150, raioM: 250, nome: "Loja 03" },
    L04: { lat: -26.9300, lon: -48.9500, raioM: 250, nome: "Loja 04" },
    L05: { lat: -26.4800, lon: -48.8000, raioM: 250, nome: "Loja 05" },
  },
};

const TIPOS = ["Cavalo", "Carreta refrigerada", "Carreta seca", "Truck"];

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

/** Gera a frota no instante `agora`. A semente muda a cada minuto, então o painel "mexe". */
export function gerarFrota(agora = new Date(), qtd = 60) {
  const r = rng(Math.floor(agora.getTime() / 60_000));
  const codigosLojas = Object.keys(LOCAIS.lojas);
  const veiculos = [];

  for (let i = 1; i <= qtd; i++) {
    const placa = `TST${String(i).padStart(4, "0")}`; // placas obviamente fictícias
    const loja = codigosLojas[Math.floor(r() * codigosLojas.length)];
    const destino = LOCAIS.lojas[loja];
    const sorteio = r();
    const minutosAtras = (min) => new Date(agora - min * 60_000).toISOString();

    let posicao;
    let viagem = null;
    let entrouNoQuadroEm;
    if (sorteio < 0.35) { // no pátio do CD (parte já programada)
      posicao = perto(LOCAIS.cd, r, 600);
      viagem = r() < 0.6 ? { loja, status: "PROGRAMADA" } : null;
      entrouNoQuadroEm = minutosAtras(Math.floor(r() * 180));
    } else if (sorteio < 0.6) { // em rota para a loja
      posicao = entre(LOCAIS.cd, destino, 0.2 + r() * 0.7);
      viagem = { loja, status: "EM_VIAGEM" };
      entrouNoQuadroEm = minutosAtras(Math.floor(r() * 120));
    } else if (sorteio < 0.75) { // descarregando na loja
      posicao = perto(destino, r, 200);
      viagem = { loja, status: "EM_VIAGEM" };
      entrouNoQuadroEm = minutosAtras(Math.floor(r() * 90));
    } else if (sorteio < 0.95) { // voltando
      posicao = entre(destino, LOCAIS.cd, 0.1 + r() * 0.8);
      viagem = { loja, status: "ENTREGUE" };
      entrouNoQuadroEm = minutosAtras(Math.floor(r() * 100));
    } else { // rastreador sem sinal
      posicao = entre(LOCAIS.cd, destino, r());
      entrouNoQuadroEm = minutosAtras(40 + Math.floor(r() * 200));
    }
    const semSinal = sorteio >= 0.95;
    veiculos.push({
      placa,
      tipo: TIPOS[Math.floor(r() * TIPOS.length)],
      posicao: { ...posicao, em: semSinal ? entrouNoQuadroEm : minutosAtras(Math.floor(r() * 5)) },
      viagem,
      entrouNoQuadroEm,
      indisponivel: !viagem && r() < 0.3, // manutenção, documentação etc.
    });
  }
  return veiculos;
}

/** Simula a consulta pesada ao banco (latência de 0,8 a 2 s). */
export async function consultarFrota({ latenciaMs } = {}) {
  const espera = latenciaMs ?? 800 + Math.random() * 1200;
  await new Promise((ok) => setTimeout(ok, espera));
  return gerarFrota(new Date());
}
