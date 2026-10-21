const { SC_LAMBDA_MIN } = require("./configuracoes");

const calcularLambdaSafetyCar = (eventos, voltas) => {
  if (!Number.isInteger(voltas) || voltas <= 0) {
    throw new Error("Quantidade de voltas inválida para calcular lambda do SC.");
  }
  if (eventos.length === 0) return 1;

  const ultimoEvento = eventos[eventos.length - 1];
  return Math.max(
    SC_LAMBDA_MIN,
    (voltas - ultimoEvento.voltaInicio) / voltas,
  );
};

module.exports = calcularLambdaSafetyCar;
