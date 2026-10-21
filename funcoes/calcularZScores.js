const calcularDesvioPadrao = require("./calcularDesvioPadrao");

const calcularZScores = (valores) => {
  const media =
    valores.reduce((total, valor) => total + valor, 0) / valores.length;
  const desvioPadrao = calcularDesvioPadrao(valores);

  if (desvioPadrao === 0) {
    return valores.map(() => 0);
  }

  return valores.map((valor) => (valor - media) / desvioPadrao);
};

module.exports = calcularZScores;