// Normalização por percentil: compara o resultado do piloto com a distribuição esperada para o carro
// (obtida com pilotos neutros em calibrar-expectativas.js). Um piloto neutro tem média exatamente 0.
const CONFIG_PE = require("../config/pe.config");

const validarHistograma = (histograma) => {
  if (
    !Array.isArray(histograma) ||
    histograma.length < 2 ||
    histograma.some((valor) => !Number.isFinite(valor) || valor < 0)
  ) {
    throw new Error("Histograma de posições inválido.");
  }
  const total = histograma.reduce((soma, valor) => soma + valor, 0);
  if (total <= 0) throw new Error("Histograma de posições sem amostras.");
  return total;
};

const validarQuantis = (quantis) => {
  if (
    !Array.isArray(quantis) ||
    quantis.length < 2 ||
    quantis.some((valor, indice) => !Number.isFinite(valor) || (indice > 0 && valor < quantis[indice - 1]))
  ) {
    throw new Error("Tabela de quantis inválida (deve ser finita e não decrescente).");
  }
};

// Percentil de uma posição com posto médio: 0 = melhor possível, 1 = pior possível.
const percentilPosicao = (histograma, posicao) => {
  const total = validarHistograma(histograma);
  if (!Number.isInteger(posicao) || posicao < 1 || posicao > histograma.length) {
    throw new Error(`Posição fora do intervalo 1..${histograma.length}: ${posicao}.`);
  }
  const indice = posicao - 1;
  let menores = 0;
  for (let i = 0; i < indice; i++) menores += histograma[i];
  return (menores + 0.5 * histograma[indice]) / total;
};

// Percentil de um resíduo (final - esperado) na tabela de quantis; negativo = melhor que o esperado.
const percentilResiduo = (quantis, valor) => {
  validarQuantis(quantis);
  if (!Number.isFinite(valor)) throw new Error("O resíduo deve ser finito.");
  const ultimo = quantis.length - 1;
  if (valor < quantis[0]) return 0;
  if (valor > quantis[ultimo]) return 1;
  let inicio = 0;
  let fim = ultimo;
  while (inicio < fim) {
    const meio = (inicio + fim) >> 1;
    if (quantis[meio] >= valor) fim = meio;
    else inicio = meio + 1;
  }
  const primeiro = inicio;
  if (quantis[primeiro] === valor) {
    let ultimoIgual = primeiro;
    while (ultimoIgual < ultimo && quantis[ultimoIgual + 1] === valor) ultimoIgual++;
    return (primeiro + ultimoIgual) / 2 / ultimo;
  }
  const anterior = primeiro - 1;
  const fracao = (valor - quantis[anterior]) / (quantis[primeiro] - quantis[anterior]);
  return (anterior + fracao) / ultimo;
};

// 1 - 2p leva o percentil para [-1, 1] (positivo = melhor); depois, retornos decrescentes.
const transformarPercentil = (percentil, expoente = CONFIG_PE.EXPOENTE) => {
  const x = 1 - 2 * percentil;
  return Math.sign(x) * Math.abs(x) ** expoente;
};

const calcularQuantis = (valores, pontos = CONFIG_PE.QUANTIS_RESIDUO) => {
  if (!Array.isArray(valores) || valores.length === 0) {
    throw new Error("Não há valores para calcular os quantis.");
  }
  if (!Number.isInteger(pontos) || pontos < 2) {
    throw new Error("A quantidade de quantis deve ser um inteiro maior que 1.");
  }
  const ordenados = [...valores].sort((a, b) => a - b);
  return Array.from({ length: pontos }, (_, indice) => {
    const posicao = (indice / (pontos - 1)) * (ordenados.length - 1);
    const inferior = Math.floor(posicao);
    const superior = Math.min(ordenados.length - 1, inferior + 1);
    return ordenados[inferior] + (ordenados[superior] - ordenados[inferior]) * (posicao - inferior);
  });
};

// Média do valor transformado sob a própria distribuição neutra (usada para centralizar em 0).
const viesPosicoes = (histograma, expoente = CONFIG_PE.EXPOENTE) => {
  const total = validarHistograma(histograma);
  let soma = 0;
  let menores = 0;
  histograma.forEach((contagem) => {
    const percentil = (menores + 0.5 * contagem) / total;
    soma += (contagem / total) * transformarPercentil(percentil, expoente);
    menores += contagem;
  });
  return soma;
};

const viesResiduos = (residuos, quantis, expoente = CONFIG_PE.EXPOENTE) => {
  if (residuos.length === 0) return 0;
  return (
    residuos.reduce(
      (soma, residuo) => soma + transformarPercentil(percentilResiduo(quantis, residuo), expoente),
      0,
    ) / residuos.length
  );
};

module.exports = {
  calcularQuantis,
  percentilPosicao,
  percentilResiduo,
  transformarPercentil,
  viesPosicoes,
  viesResiduos,
};
