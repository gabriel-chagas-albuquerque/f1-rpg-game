const CONFIG_CHUVA = require("./configChuva");

const validarProbabilidadeChuva = (pctChuva) => {
  if (
    typeof pctChuva !== "number" ||
    !Number.isFinite(pctChuva) ||
    pctChuva < 0 ||
    pctChuva > 1
  ) {
    throw new Error("A probabilidade de chuva deve estar entre 0 e 1.");
  }
};

const sortearChuva = (pctChuva) => {
  validarProbabilidadeChuva(pctChuva);
  if (Math.random() >= pctChuva) return 0;

  const distribuicao = CONFIG_CHUVA.distribuicaoIntensidade;
  const sorteio = Math.random();
  let base = distribuicao.tempestade;
  if (sorteio < distribuicao.probabilidadeGaroa) {
    base = distribuicao.garoa;
  } else if (
    sorteio <
    distribuicao.probabilidadeGaroa + distribuicao.probabilidadeChuva
  ) {
    base = distribuicao.chuva;
  }
  const jitter =
    (Math.random() - distribuicao.centroJitter) *
    distribuicao.variacaoIntensidade;
  return Math.min(
    distribuicao.intensidadeMaxima,
    Math.max(distribuicao.intensidadeMinima, base + jitter),
  );
};

const sortearClima = (pctChuva) => {
  validarProbabilidadeChuva(pctChuva);
  if (pctChuva <= 0) return { pcQualy: 0, pcCorrida: 0 };

  const pcQualy = sortearChuva(pctChuva);
  const qualyMolhada = pcQualy > 0;
  const correlacao = CONFIG_CHUVA.correlacaoSessoes;

  if (pctChuva >= 1) return { pcQualy, pcCorrida: sortearChuva(1) };

  const probabilidadeCorridaMolhada = qualyMolhada
    ? correlacao.corridaMolhadaAposQualyMolhada
    : Math.min(
        1,
        (pctChuva * (1 - correlacao.corridaMolhadaAposQualyMolhada)) /
          (1 - pctChuva),
      );
  const corridaMolhada = Math.random() < probabilidadeCorridaMolhada;

  if (!corridaMolhada) return { pcQualy, pcCorrida: 0 };

  const pcCorrida = qualyMolhada
    ? Math.min(
        1,
        Math.max(
          CONFIG_CHUVA.distribuicaoIntensidade.intensidadeMinima,
          pcQualy +
            (Math.random() -
              CONFIG_CHUVA.distribuicaoIntensidade.centroJitter) *
              correlacao.variacaoEntreSessoes,
        ),
      )
    : sortearChuva(1);

  return { pcQualy, pcCorrida };
};

module.exports = { sortearChuva, sortearClima };
