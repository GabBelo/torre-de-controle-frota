import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { criarCache } from "./cache/swrCache.js";
import { montarPainel } from "./dominio/classificacao.js";
import { consultarFrota, LOCAIS } from "./fonte/simulador.js";
import { criarMetricas } from "./metricas/metricas.js";

const raiz = path.dirname(fileURLToPath(import.meta.url));

export function criarApp({
  fonte = consultarFrota,
  ttlMs = Number(process.env.PAINEL_TTL_MS ?? 60_000),
  aquecerACadaMs = Number(process.env.PAINEL_AQUECER_MS ?? 60_000),
  pastaSnapshot = process.env.SNAPSHOT_DIR ?? path.join(raiz, "..", ".snapshots"),
} = {}) {
  const metricas = criarMetricas();
  const painel = criarCache({
    nome: "painel",
    ttlMs,
    aquecerACadaMs,
    pastaSnapshot,
    metricas,
    construir: async () => {
      const frota = await metricas.medir("consulta", "frota", () => fonte());
      return montarPainel(frota, LOCAIS);
    },
  });

  const app = express();

  // Mede o tempo de cada resposta de API.
  app.use("/api", (req, res, next) => {
    const inicio = performance.now();
    res.on("finish", () =>
      metricas.registrar("http", `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`, performance.now() - inicio, {
        ok: res.statusCode < 500,
      }),
    );
    next();
  });

  app.get("/api/saude", (_req, res) => res.json({ status: "ok", cache: painel.status() }));

  app.get("/api/painel", async (req, res) => {
    try {
      const { valor, idadeMs, origem } = await painel.obter({ forcar: req.query.forcar === "1" });
      res.set("x-cache", origem).json({ ...valor, idadeMs, proximaAtualizacaoMs: aquecerACadaMs });
    } catch (e) {
      res.status(503).json({ erro: "Fonte de dados indisponível", detalhe: e.message });
    }
  });

  // Métricas internas: sem link no painel, acessadas só pela URL.
  app.get("/api/metricas", (_req, res) => res.json(metricas.resumo()));
  app.get("/metricas", (_req, res) => res.sendFile(path.join(raiz, "..", "public", "metricas.html")));

  app.use(express.static(path.join(raiz, "..", "public")));

  return { app, painel, metricas };
}
