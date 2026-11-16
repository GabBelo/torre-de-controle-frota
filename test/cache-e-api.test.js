import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { criarApp } from "../src/app.js";
import { criarCache } from "../src/cache/swrCache.js";
import { gerarFrota } from "../src/fonte/simulador.js";
import { percentil } from "../src/metricas/metricas.js";

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const pastaTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), "torre-"));

describe("cache stale-while-revalidate", () => {
  test("primeira chamada espera o banco; as seguintes respondem do cache", async () => {
    let consultas = 0;
    const cache = criarCache({ nome: "t1", ttlMs: 1000, construir: async () => (await dormir(50), ++consultas) });

    assert.equal((await cache.obter()).origem, "banco");
    const t0 = performance.now();
    const r = await cache.obter();
    assert.equal(r.origem, "cache");
    assert.ok(performance.now() - t0 < 20, "resposta do cache deve ser imediata");
    assert.equal(consultas, 1);
  });

  test("dado vencido é servido na hora e atualizado em segundo plano", async () => {
    let versao = 0;
    const cache = criarCache({ nome: "t2", ttlMs: 10, construir: async () => (await dormir(30), ++versao) });
    await cache.obter();
    await dormir(20);

    const vencido = await cache.obter();
    assert.equal(vencido.origem, "cache-vencido");
    assert.equal(vencido.valor, 1); // não esperou o banco
    await dormir(60);
    assert.equal((await cache.obter()).valor, 2);
  });

  test("chamadas simultâneas sem cache viram uma só consulta", async () => {
    let consultas = 0;
    const cache = criarCache({ nome: "t3", construir: async () => (await dormir(30), ++consultas) });
    await Promise.all([cache.obter(), cache.obter(), cache.obter()]);
    assert.equal(consultas, 1);
  });

  test("snapshot em disco: um novo processo sobe já com dados", async () => {
    const pasta = pastaTemp();
    await criarCache({ nome: "t4", pastaSnapshot: pasta, construir: async () => ({ ok: 1 }) }).obter();
    const reiniciado = criarCache({ nome: "t4", pastaSnapshot: pasta, construir: async () => { throw new Error("banco fora"); } });
    const r = await reiniciado.obter();
    assert.deepEqual(r.valor, { ok: 1 });
    assert.notEqual(r.origem, "banco");
  });
});

describe("API", () => {
  const { app } = criarApp({ fonte: async () => gerarFrota(new Date("2026-03-10T12:00:00Z")), aquecerACadaMs: 0, pastaSnapshot: pastaTemp() });
  const server = app.listen(0);
  const url = `http://localhost:${server.address().port}`;
  after(() => server.close());

  test("GET /api/painel devolve os quadros e registra métricas", async () => {
    const res = await fetch(`${url}/api/painel`);
    const corpo = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(corpo.quadros), ["PATIO_CD", "INDO_PARA_LOJA", "EM_LOJA", "VOLTANDO", "SEM_SINAL"]);
    assert.equal(Object.values(corpo.contadores).slice(0, 5).reduce((a, b) => a + b, 0), 60);

    const metricas = await (await fetch(`${url}/api/metricas`)).json();
    const nomes = metricas.series.map((s) => `${s.tipo}:${s.nome}`);
    assert.ok(nomes.includes("consulta:frota"));
    assert.ok(nomes.includes("cache:painel"));
  });

  test("a página de métricas existe, mas não tem link no painel", async () => {
    assert.equal((await fetch(`${url}/metricas`)).status, 200);
    const index = await (await fetch(`${url}/`)).text();
    assert.ok(!index.includes("/metricas"));
  });
});

test("percentil", () => {
  assert.equal(percentil([1, 2, 3, 4, 100], 50), 3);
  assert.equal(percentil([1, 2, 3, 4, 100], 95), 100);
});
