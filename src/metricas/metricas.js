// Métricas de tempo em memória, para achar o que está lento sem ferramenta externa.
// Tipos: "consulta" (ida ao banco), "cache" (montagem do payload), "http" (resposta ao navegador).
const MAX_AMOSTRAS = 200;

export function criarMetricas() {
  const series = new Map(); // "tipo|nome" -> { tipo, nome, total, erros, amostras[] }
  const desde = Date.now();

  function registrar(tipo, nome, ms, { ok = true } = {}) {
    const chave = `${tipo}|${nome}`;
    let s = series.get(chave);
    if (!s) series.set(chave, (s = { tipo, nome, total: 0, erros: 0, amostras: [] }));
    s.total++;
    if (!ok) s.erros++;
    s.amostras.push(ms);
    if (s.amostras.length > MAX_AMOSTRAS) s.amostras.shift();
  }

  /** Mede uma função assíncrona. */
  async function medir(tipo, nome, fn) {
    const inicio = performance.now();
    try {
      const r = await fn();
      registrar(tipo, nome, performance.now() - inicio);
      return r;
    } catch (e) {
      registrar(tipo, nome, performance.now() - inicio, { ok: false });
      throw e;
    }
  }

  function resumo() {
    return {
      desde: new Date(desde).toISOString(),
      series: [...series.values()]
        .map((s) => ({
          tipo: s.tipo,
          nome: s.nome,
          total: s.total,
          erros: s.erros,
          p50: percentil(s.amostras, 50),
          p95: percentil(s.amostras, 95),
          max: Math.round(Math.max(...s.amostras)),
        }))
        .sort((a, b) => b.p95 - a.p95), // o mais lento primeiro
    };
  }

  return { registrar, medir, resumo };
}

export function percentil(valores, p) {
  if (!valores.length) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const i = Math.min(ord.length - 1, Math.ceil((p / 100) * ord.length) - 1);
  return Math.round(ord[Math.max(0, i)]);
}
