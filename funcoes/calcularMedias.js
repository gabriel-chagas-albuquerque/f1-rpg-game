const calcularMedias = (acumulador, quantidade) =>
  Object.fromEntries(
    Object.entries(acumulador).map(([chave, valor]) => [
      chave,
      typeof valor === "number"
        ? valor / quantidade
        : calcularMedias(valor, quantidade),
    ]),
  );

module.exports = calcularMedias;