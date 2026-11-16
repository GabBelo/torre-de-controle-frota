// Cache "frio" (stale-while-revalidate) com aquecimento em segundo plano.
//
// Problema que resolve: a consulta do painel leva segundos e cada recarga do
// navegador esperava o banco. Agora:
// - a requisição SEMPRE recebe o último payload pronto, na hora (mesmo que velho);
// - se o payload estiver vencido, dispara uma atualização em segundo plano;
// - um "warmer" reconstrói o payload periodicamente, sem depender de acesso;
// - consultas simultâneas são agrupadas (uma só ida ao banco);
// - o último payload vai para disco, então um restart já sobe com dados.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export function criarCache({ nome, construir, ttlMs = 60_000, aquecerACadaMs = 0, pastaSnapshot = null, metricas = null }) {
  const estado = { valor: null, atualizadoEm: 0, emAndamento: null, ultimoErro: null, timer: null };
  const arquivo = pastaSnapshot ? path.join(pastaSnapshot, `${nome}.json`) : null;

  // Sobe servindo o último snapshot conhecido, se existir.
  if (arquivo && fs.existsSync(arquivo)) {
    try {
      const salvo = JSON.parse(fs.readFileSync(arquivo, "utf8"));
      estado.valor = salvo.valor;
      estado.atualizadoEm = salvo.atualizadoEm;
    } catch {
      /* snapshot corrompido: ignora e reconstrói */
    }
  }

  async function atualizar() {
    if (estado.emAndamento) return estado.emAndamento; // agrupa chamadas simultâneas
    const inicio = performance.now();
    estado.emAndamento = (async () => {
      try {
        const valor = await construir();
        estado.valor = valor;
        estado.atualizadoEm = Date.now();
        estado.ultimoErro = null;
        metricas?.registrar("cache", nome, performance.now() - inicio);
        if (arquivo) {
          await fsp.mkdir(path.dirname(arquivo), { recursive: true });
          await fsp.writeFile(arquivo, JSON.stringify({ atualizadoEm: estado.atualizadoEm, valor }));
        }
        return valor;
      } catch (erro) {
        estado.ultimoErro = erro.message;
        metricas?.registrar("cache", nome, performance.now() - inicio, { ok: false });
        throw erro;
      } finally {
        estado.emAndamento = null;
      }
    })();
    return estado.emAndamento;
  }

  return {
    nome,
    /** Devolve { valor, idadeMs, origem }. Só espera o banco se ainda não houver nenhum dado. */
    async obter({ forcar = false } = {}) {
      if (forcar || !estado.valor) {
        const valor = await atualizar();
        return { valor, idadeMs: 0, origem: "banco" };
      }
      const idadeMs = Date.now() - estado.atualizadoEm;
      if (idadeMs > ttlMs) atualizar().catch(() => {}); // vencido: atualiza em segundo plano
      return { valor: estado.valor, idadeMs, origem: idadeMs > ttlMs ? "cache-vencido" : "cache" };
    },
    iniciarAquecimento() {
      if (!aquecerACadaMs || estado.timer) return;
      atualizar().catch(() => {});
      estado.timer = setInterval(() => atualizar().catch(() => {}), aquecerACadaMs);
      estado.timer.unref?.();
    },
    parar() {
      clearInterval(estado.timer);
      estado.timer = null;
    },
    status() {
      return {
        nome,
        temValor: Boolean(estado.valor),
        idadeMs: estado.valor ? Date.now() - estado.atualizadoEm : null,
        atualizando: Boolean(estado.emAndamento),
        ultimoErro: estado.ultimoErro,
      };
    },
  };
}
