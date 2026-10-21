const normalizarPesos = (pesosCategoria) => {
  let soma = 0;
  for (const key in pesosCategoria) {
    if (
      typeof pesosCategoria[key] !== "number" ||
      !Number.isFinite(pesosCategoria[key])
    ) {
      throw new Error(`Peso "${key}" ausente ou inválido.`);
    }
    if (pesosCategoria[key] < 0) pesosCategoria[key] = 0;
    soma += pesosCategoria[key];
  }
  if (soma === 0) {
    throw new Error(
      "Não é possível normalizar uma categoria sem pesos positivos.",
    );
  }
  for (const key in pesosCategoria) {
    pesosCategoria[key] /= soma;
  }
};

module.exports = normalizarPesos;