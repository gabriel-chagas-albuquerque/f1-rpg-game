const arredondarZ = require("./arredondarZ");

const calcularComparativoScorePiloto = (scoresPorCondicao) => {
  const mediaSeca =
    scoresPorCondicao.seco.quantidade > 0
      ? scoresPorCondicao.seco.soma / scoresPorCondicao.seco.quantidade
      : null;
  const mediaChuva =
    scoresPorCondicao.chuva.quantidade > 0
      ? scoresPorCondicao.chuva.soma / scoresPorCondicao.chuva.quantidade
      : null;

  return {
    scorePilotoMedioSeco:
      mediaSeca === null ? null : arredondarZ(mediaSeca),
    scorePilotoMedioChuva:
      mediaChuva === null ? null : arredondarZ(mediaChuva),
    diferencaMediaScorePilotoChuvaMenosSeco:
      mediaSeca === null || mediaChuva === null
        ? null
        : arredondarZ(mediaChuva - mediaSeca),
  };
};

module.exports = calcularComparativoScorePiloto;