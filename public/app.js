// Front sem framework: busca o payload uma vez por ciclo e filtra TUDO no navegador.
// Trocar um filtro não volta ao servidor — a resposta é instantânea.
import { TIPOS_TRACAO } from "./tipos.js";

const $ = (id) => document.getElementById(id);
let dados = null;
let proximaEm = 0;

const fmtDuracao = (min) => (min < 1 ? "1m" : min >= 1440 ? `${Math.floor(min / 1440)}d` : min >= 60 ? `${Math.floor(min / 60)}h` : `${min}m`);
const fmtData = (iso) => {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function carregar() {
  const res = await fetch("/api/painel");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  dados = await res.json();
  proximaEm = Date.now() + (dados.proximaAtualizacaoMs || 60_000);
  render();
}

// ---------- filtros (no navegador) ----------
function filtros() {
  const busca = $("busca").value.trim().toUpperCase();
  const frios = new Set([...document.querySelectorAll('input[name="frio"]:checked')].map((i) => i.value));
  const soAlertas = $("soAlertas").checked;
  return (v) =>
    (!busca || v.placa.includes(busca) || (v.sub ?? "").includes(busca) || (v.loja ?? "").includes(busca)) &&
    frios.has(v.frio ? "frigo" : "seco") &&
    (!soAlertas || v.alerta);
}

// ---------- render ----------
function cartao(v, { tempos = false } = {}) {
  const classe = v.alerta ? "alerta" : v.indisponivel ? "indisp" : v.programado ? "prog" : "";
  const prev = tempos && v.previstoEm ? `<span class="prev">PREV.:<b>${fmtData(v.previstoEm)}</b></span>` : "";
  const agend = tempos && v.agendadoEm ? `<span class="agend">AGEND.:<b>${fmtData(v.agendadoEm)}</b></span>` : "";
  return `
    <article class="pill ${classe} ${v.loja ? "com-loja" : ""}" title="${esc(v.tipo)}">
      <div class="pill__linha">
        <span class="placa">${esc(v.placa)}</span>
        <span class="ha">há ${fmtDuracao(v.minutos)}</span>
        ${prev || agend ? `<span class="tempos">${prev}${agend}</span>` : ""}
      </div>
      ${v.sub ? `<div class="sub">${esc(v.sub)}</div>` : ""}
      ${v.frio ? '<span class="frio" aria-label="refrigerado">❄</span>' : ""}
      ${v.loja ? `<span class="loja">${esc(v.loja)}</span>` : ""}
    </article>`;
}

function preencher(id, itens, opcoes) {
  $(id).innerHTML = itens.length ? itens.map((v) => cartao(v, opcoes)).join("") : '<p class="vazio">Nenhum veículo</p>';
}

function kpis(id, itens) {
  const cont = Object.fromEntries(TIPOS_TRACAO.map((t) => [t, 0]));
  for (const v of itens) if (v.tipo in cont) cont[v.tipo]++;
  $(id).innerHTML = TIPOS_TRACAO.map(
    (t) => `<div class="kpi"><span>${/Frigo/.test(t) ? '<i class="neve">❄</i> ' : ""}${t.replace("Conj.", "Conj.")}</span><strong>${cont[t]}</strong></div>`,
  ).join("");
}

function matriz(itens) {
  const linhas = { disp: "Disp.", prog: "Prog.", indisp: "Indisp." };
  const m = { disp: {}, prog: {}, indisp: {} };
  for (const v of itens) {
    const st = v.indisponivel ? "indisp" : v.programado ? "prog" : "disp";
    const k = `${v.frio ? "frigo" : "seco"}-${v.equipamento}`;
    m[st][k] = (m[st][k] ?? 0) + 1;
  }
  const cols = ["seco-cavalo", "seco-carreta", "seco-truck", "frigo-cavalo", "frigo-carreta", "frigo-truck"];
  $("matrizPatio").innerHTML = Object.entries(linhas)
    .map(([st, rot]) => `<tr class="${st}"><td>${rot}</td>${cols.map((c) => `<td>${m[st][c] ?? 0}</td>`).join("")}</tr>`)
    .join("");
}

function render() {
  const ok = filtros();
  const q = Object.fromEntries(Object.entries(dados.quadros).map(([k, v]) => [k, v.filter(ok)]));
  const por = (lista, grupo) => lista.filter((v) => v.grupo === grupo);

  matriz(q.PATIO_CD);
  preencher("PATIO_CD-tracao", por(q.PATIO_CD, "tracao"));
  preencher("PATIO_CD-carreta", por(q.PATIO_CD, "carreta"));

  for (const quadro of ["TRANSITO_LOJA", "DOCA_LOJA", "TRANSITO_CD"]) {
    $(`total-${quadro}`).textContent = q[quadro].length;
    kpis(`kpis-${quadro}`, q[quadro]);
  }
  preencher("TRANSITO_LOJA", q.TRANSITO_LOJA, { tempos: true });
  preencher("DOCA_LOJA-tracao", por(q.DOCA_LOJA, "tracao"));
  preencher("DOCA_LOJA-carreta", por(q.DOCA_LOJA, "carreta"));
  preencher("TRANSITO_CD", q.TRANSITO_CD, { tempos: true });

  const semSinal = dados.quadros.SEM_SINAL.length;
  $("semSinal").textContent = `Sem sinal: ${semSinal}`;
  $("semSinal").classList.toggle("tem", semSinal > 0);
}

// ---------- interação ----------
$("btnFiltros").addEventListener("click", () => {
  const painel = $("painelFiltros");
  painel.hidden = !painel.hidden;
  $("btnFiltros").setAttribute("aria-expanded", String(!painel.hidden));
});
$("painelFiltros").addEventListener("input", () => dados && render());

// Contagem regressiva; ao zerar, busca o payload de novo (o servidor responde do cache).
setInterval(() => {
  const seg = Math.max(0, Math.round((proximaEm - Date.now()) / 1000));
  $("contagem").textContent = seg;
  if (dados && seg === 0) carregar().catch(console.error);
}, 1000);

carregar().catch((e) => (document.querySelector(".raias").textContent = `Erro ao carregar: ${e.message}`));
