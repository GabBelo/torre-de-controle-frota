import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { classificar, montarPainel } from "../src/dominio/classificacao.js";
import { distanciaMetros } from "../src/dominio/geo.js";

const LOCAIS = {
  cd: { lat: -26.91, lon: -48.67, raioM: 600 },
  lojas: { L01: { lat: -26.99, lon: -48.635, raioM: 250, nome: "Loja 01" } },
};
const agora = new Date("2026-03-10T12:00:00Z");
const ha = (min) => new Date(agora - min * 60_000).toISOString();
const veiculo = (extra) => ({ placa: "TST0001", tipo: "Cavalo", posicao: { lat: -26.91, lon: -48.67, em: ha(1) }, viagem: null, ...extra });
const naLoja = { lat: -26.99, lon: -48.635, em: ha(1) };
const naEstrada = { lat: -26.95, lon: -48.65, em: ha(1) };

describe("geo", () => {
  test("distância conhecida (~1,1 km por 0,01° de latitude)", () => {
    const d = distanciaMetros({ lat: 0, lon: 0 }, { lat: 0.01, lon: 0 });
    assert.ok(Math.abs(d - 1112) < 5, `distância ${d}`);
  });
});

describe("classificar", () => {
  test("dentro do raio do CD é pátio, mesmo com viagem aberta", () => {
    assert.equal(classificar(veiculo({ viagem: { loja: "L01", status: "EM_VIAGEM" } }), LOCAIS, agora), "PATIO_CD");
  });

  test("fora do CD com viagem em andamento é 'indo para loja'", () => {
    assert.equal(classificar(veiculo({ posicao: naEstrada, viagem: { loja: "L01", status: "EM_VIAGEM" } }), LOCAIS, agora), "INDO_PARA_LOJA");
  });

  test("dentro do raio da loja é 'em loja', nunca 'voltando' ao mesmo tempo", () => {
    assert.equal(classificar(veiculo({ posicao: naLoja, viagem: { loja: "L01", status: "ENTREGUE" } }), LOCAIS, agora), "EM_LOJA");
  });

  test("entregue e fora da loja é 'voltando'", () => {
    assert.equal(classificar(veiculo({ posicao: naEstrada, viagem: { loja: "L01", status: "ENTREGUE" } }), LOCAIS, agora), "VOLTANDO");
  });

  test("posição velha é 'sem sinal'", () => {
    assert.equal(classificar(veiculo({ posicao: { ...naEstrada, em: ha(45) } }), LOCAIS, agora), "SEM_SINAL");
  });
});

describe("montarPainel", () => {
  const frota = [
    veiculo({ placa: "A", viagem: { loja: "L01", status: "PROGRAMADA" }, entrouNoQuadroEm: ha(90) }), // atrasado
    veiculo({ placa: "B", viagem: { loja: "L01", status: "PROGRAMADA" }, entrouNoQuadroEm: ha(20) }),
    veiculo({ placa: "C", entrouNoQuadroEm: ha(300) }), // sem programação: não é alerta
    veiculo({ placa: "D", indisponivel: true, entrouNoQuadroEm: ha(500) }),
    veiculo({ placa: "E", posicao: naEstrada, viagem: { loja: "L01", status: "EM_VIAGEM" } }),
  ];
  const painel = montarPainel(frota, LOCAIS, agora);

  test("cada veículo aparece em um único quadro", () => {
    const total = Object.values(painel.quadros).reduce((s, q) => s + q.length, 0);
    assert.equal(total, frota.length);
  });

  test("alerta de atraso só para programado parado há mais de 1 h", () => {
    const porPlaca = Object.fromEntries(painel.quadros.PATIO_CD.map((v) => [v.placa, v]));
    assert.equal(porPlaca.A.atrasoSaida, true);
    assert.equal(porPlaca.B.atrasoSaida, false);
    assert.equal(porPlaca.C.atrasoSaida, false);
    assert.equal(porPlaca.D.indisponivel, true);
    assert.equal(painel.contadores.PATIO_ATRASADOS, 1);
    assert.equal(painel.contadores.PATIO_INDISPONIVEIS, 1);
  });

  test("no pátio, programados vêm primeiro, do mais antigo para o mais novo", () => {
    assert.deepEqual(painel.quadros.PATIO_CD.map((v) => v.placa), ["A", "B", "D", "C"]);
  });
});
