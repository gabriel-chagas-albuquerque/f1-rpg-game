const calcularValorMedio = (array, atributo) => {
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error("O array deve ser não vazio.");
  }
  const soma = array.reduce((acc, item) => acc + item[atributo], 0);
  return soma / array.length;
};

module.exports = calcularValorMedio;