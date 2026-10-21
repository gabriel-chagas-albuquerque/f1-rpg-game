const calcularScore = (dados, pesosPorAtributo, mapaAtributos) =>
  Object.entries(pesosPorAtributo).reduce((total, [atributo, peso]) => {
    const campo = mapaAtributos[atributo];
    const valor = dados[campo];

    if (campo === undefined || typeof valor !== "number") {
      throw new Error(`Atributo "${atributo}" ausente ou inválido nos dados.`);
    }

    return total + valor * peso;
  }, 0);

module.exports = calcularScore;