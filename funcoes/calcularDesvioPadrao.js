const calcularDesvioPadrao = (valores) => {
  const media =
    valores.reduce((total, valor) => total + valor, 0) / valores.length;
  const variancia =
    valores.reduce((total, valor) => total + (valor - media) ** 2, 0) /
    valores.length;
  return Math.sqrt(variancia);
};

module.exports = calcularDesvioPadrao;