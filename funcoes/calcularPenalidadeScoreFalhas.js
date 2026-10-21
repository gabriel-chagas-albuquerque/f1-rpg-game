const CONFIG_FALHAS = require("./configFalhas");

const calcularPenalidadeScoreFalhas = (
  falhaDurabilidade,
  falhaHumana,
  multiplicadorSeveridade,
  dnfOcorreu = false,
  pesoReferencia,
) => {
  if (
    typeof multiplicadorSeveridade !== "number" ||
    !Number.isFinite(multiplicadorSeveridade) ||
    multiplicadorSeveridade <= 0
  ) {
    throw new Error("Multiplicador de severidade de falha inválido.");
  }

  if (
    typeof pesoReferencia !== "number" ||
    !Number.isFinite(pesoReferencia) ||
    pesoReferencia < 0
  ) {
    throw new Error("Peso de referência de falha inválido.");
  }

  if (dnfOcorreu) return 0;

  return (
    (falhaDurabilidade.penalidade + falhaHumana.penalidade) *
    pesoReferencia *
    multiplicadorSeveridade
  );
};

module.exports = calcularPenalidadeScoreFalhas;
