const arredondarScore = require("./arredondarScore");
const arredondarZ = require("./arredondarZ");

const formatarFalhaDurabilidade = (
  falha,
  extremosPenalidadeZ = { minima: null, maxima: null },
) => ({
  taxaOcorrenciaPercentual: arredondarScore(falha.ocorreu * 100),
  taxaDNFPercentual: arredondarScore(falha.dnf * 100),
  probabilidade: arredondarScore(falha.probabilidade),
  penalidade: arredondarZ(falha.penalidade),
  penalidadeZMinima:
    extremosPenalidadeZ.minima === null
      ? null
      : arredondarZ(extremosPenalidadeZ.minima),
  penalidadeZMaxima:
    extremosPenalidadeZ.maxima === null
      ? null
      : arredondarZ(extremosPenalidadeZ.maxima),
});

module.exports = formatarFalhaDurabilidade;