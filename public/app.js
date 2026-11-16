// Front sem framework: busca o payload uma vez por ciclo e filtra TUDO no navegador.
// Trocar um filtro não volta ao servidor — a resposta é instantânea.

const TITULOS = {
  PATIO_CD: "Pátio CD",
  INDO_PARA_LOJA: "Indo para loja",
  EM_LOJA: "Em loja",
  VOLTANDO: "Voltando",
  SEM_SINAL: "Sem sinal",
};

const el = (id) => document.getElementById(id);
let dados = null;
let proximaEm = 0;

async function carregar() {
  const res = await fetch("/api/painel");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  dados = await res.json();
  proximaEm = Date.now() + dados.proximaAtualizacaoMs;
  preencherTipos();
  render();
  const idadeSeg = Math.round((Date.now() - new Date(dados.geradoEm)) / 1000);
  el("idade").textContent = `dados de ${idadeSeg}s atrás (${res.headers.get("x-cache")})`;
}

function preencherTipos() {
  const tipos = new Set(Object.values(dados.quadros).flat().map((v) => v.tipo));
  const sel = el("tipo");
  if (sel.options.length > 1) return;
  for (const t of [...tipos].sort()) sel.add(new Option(t, t));
}

function filtrar(itens, quadro) {
  const busca = el("busca").value.trim().toLowerCase();
  const tipo = el("tipo").value;
  const soAlertas = el("soAlertas").checked;
  return itens.filter(
    (v) =>
      (!busca || v.placa.toLowerCase().includes(busca) || (v.loja ?? "").toLowerCase().includes(busca)) &&
      (!tipo || v.tipo === tipo) &&
      (!soAlertas || quadro !== "PATIO_CD" || v.atrasoSaida || v.indisponivel),
  );
}

const formatarMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`);

function render() {
  const raiz = el("quadros");
  raiz.replaceChildren();
  for (const [quadro, itens] of Object.entries(dados.quadros)) {
    const visiveis = filtrar(itens, quadro);
    const node = el("tpl-quadro").content.cloneNode(true);
    node.querySelector(".titulo").textContent = TITULOS[quadro];
    node.querySelector(".contador").textContent = visiveis.length;
    node.querySelector(".vazio").hidden = visiveis.length > 0;
    const corpo = node.querySelector("tbody");
    for (const v of visiveis) {
      const tr = corpo.insertRow();
      if (v.atrasoSaida) tr.className = "atraso";
      else if (v.indisponivel) tr.className = "indisp";
      tr.insertCell().textContent = v.placa;
      tr.insertCell().textContent = v.tipo;
      tr.insertCell().textContent = v.indisponivel ? "Indisponível" : v.loja ?? "—";
      tr.insertCell().textContent = formatarMin(v.minutos);
    }
    raiz.append(node);
  }
}

// Contagem regressiva; ao zerar, busca o payload de novo (o servidor responde do cache).
setInterval(() => {
  const seg = Math.max(0, Math.round((proximaEm - Date.now()) / 1000));
  el("relogio").textContent = `Tempo para próxima atualização: ${seg}s`;
  if (dados && seg === 0) carregar().catch(console.error);
}, 1000);

for (const id of ["busca", "tipo", "soAlertas"]) el(id).addEventListener("input", () => dados && render());

carregar().catch((e) => (el("quadros").textContent = `Erro ao carregar: ${e.message}`));
