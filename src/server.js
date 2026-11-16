import { criarApp } from "./app.js";

const porta = Number(process.env.PORT ?? 3000);
const { app, painel } = criarApp();

painel.iniciarAquecimento(); // o primeiro acesso já encontra o cache quente
app.listen(porta, () => {
  console.log(`Torre de controle em http://localhost:${porta}  ·  métricas em /metricas`);
});
