import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { classificar, montarPainel, perfilDoTipo } from "../src/dominio/classificacao.js";
import { distanciaMetros } from "../src/dominio/geo.js";

const LOCAIS = {
  cd: { lat: -26.91, lon: -48.67, raioM: 600 },
  lojas: { L01: { lat: -26.99, lon: -48.635, raioM: 250 } },
};
const agora = new Date("2026-03-10T12:00:00Z");
const ha = (min) => new Date(agora - min * 60_000).toISOString();
const daqui = (min) => new Date(agora.getTime() + min * 60_000).toISOString();
const veiculo = (extra) => ({ placa: "TAA0A01", tipo: "Conj. Seco", posicao: { lat: -26.91, lon: -48.67, em: ha(1) }, viagem: null, ...extra });
const naLoja = { lat: -26.99, lon: -48.635, em: ha(1) };
const naEstrada = { lat: -26.95, lon: -48.65, em: ha(1) };

describe("geo", () => {
  test("distância conhecida (~1,1 km por 0,01° de latitude)", () => {
    const d = distanciaMetros({ lat: 0, lon: 0 }, { lat: 0.01, lon: 0 });
    assert.ok(Math.abs(d - 1112) < 5, `distância ${d}`);
  });
});

describe("perfilDoTipo", () => {
  test("separa tração/carreta, equipamento e refrigeração", () => {
    assert.deepEqual(perfilDoTipo("Conj. Frigo"), { grupo: "tracao", equipamento: "cavalo", frio: true });
    assert.deepEqual(perfilDoTipo("Truck Seco"), { grupo: "tracao", equipamento: "truck", frio: false });
    assert.deepEqual(perfilDoTipo("Carreta Frigo"), { grupo: "carreta", equipamento: "carreta", frio: true });
  });
});

describe("classificar", () => {
  test("dentro do raio do CD é pátio, mesmo com viagem aberta", () => {
    assert.equal(classificar(veiculo({ viagem: { loja: "L01", status: "EM_VIAGEM" } }), LOCAIS, agora), "PATIO_CD");
  });

  test("fora do CD com viagem em andamento é trânsito para loja", () => {
    assert.equal(classificar(veiculo({ posicao: naEstrada, viagem: { loja: "L01", status: "EM_VIAGEM" } }), LOCAIS, agora), "TRANSITO_LOJA");
  });

  test("no raio da loja é doca loja, nunca trânsito para CD ao mesmo tempo", () => {
    assert.equal(classificar(veiculo({ posicao: naLoja, viagem: { loja: "L01", status: "ENTREGUE" } }), LOCAIS, agora), "DOCA_LOJA");
  });

  test("entregue e fora da loja é trânsito para CD", () => {
    assert.equal(classificar(veiculo({ posicao: naEstrada, viagem: { loja: "L01", status: "ENTREGUE" } }), LOCAIS, agora), "TRANSITO_CD");
  });

  test("posição velha é sem sinal", () => {
    assert.equal(classificar(veiculo({ posicao: { ...naEstrada, em: ha(45) } }), LOCAIS, agora), "SEM_SINAL");
  });
});

describe("montarPainel", () => {
  const frota = [
    veiculo({ placa: "A", viagem: { loja: "L01", status: "PROGRAMADA" }, entrouNoQuadroEm: ha(90) }), // programado atrasado
    veiculo({ placa: "B", tipo: "Conj. Frigo", viagem: { loja: "L01", status: "PROGRAMADA" }, entrouNoQuadroEm: ha(20) }),
    veiculo({ placa: "C", tipo: "Truck Seco", entrouNoQuadroEm: ha(300) }), // disponível: não é alerta
    veiculo({ placa: "D", tipo: "Carreta Seca", indisponivel: true, entrouNoQuadroEm: ha(500) }),
    veiculo({ placa: "E", posicao: naEstrada, viagem: { loja: "L01", status: "EM_VIAGEM", previstoEm: daqui(200), agendadoEm: daqui(120) } }),
    veiculo({ placa: "F", posicao: naEstrada, viagem: { loja: "L01", status: "EM_VIAGEM", previstoEm: daqui(60), agendadoEm: daqui(120) } }),
  ];
  const painel = montarPainel(frota, LOCAIS, agora);
  const porPlaca = Object.fromEntries(Object.values(painel.quadros).flat().map((v) => [v.placa, v]));

  test("cada veículo aparece em um único quadro", () => {
    const total = Object.values(painel.quadros).reduce((s, q) => s + q.length, 0);
    assert.equal(total, frota.length);
  });

  test("alerta para programado parado há mais de 1 h e para previsão depois do agendamento", () => {
    assert.equal(porPlaca.A.alerta, true);
    assert.equal(porPlaca.B.alerta, false);
    assert.equal(porPlaca.C.alerta, false);
    assert.equal(porPlaca.E.alerta, true);
    assert.equal(porPlaca.F.alerta, false);
  });

  test("matriz do pátio conta disponíveis, programados e indisponíveis por tipo", () => {
    const m = painel.resumo.patio;
    assert.equal(m.prog.seco.cavalo, 1);
    assert.equal(m.prog.frigo.cavalo, 1);
    assert.equal(m.disp.seco.truck, 1);
    assert.equal(m.indisp.seco.carreta, 1);
  });

  test("no pátio, alertas e programados vêm primeiro", () => {
    assert.deepEqual(painel.quadros.PATIO_CD.map((v) => v.placa), ["A", "B", "D", "C"]);
  });

  test("trânsito para loja em ordem de chegada prevista", () => {
    assert.deepEqual(painel.quadros.TRANSITO_LOJA.map((v) => v.placa), ["F", "E"]);
    assert.equal(painel.resumo.porTipo.TRANSITO_LOJA["Conj. Seco"], 2);
  });
});
