const acumularValores = (acumulador, valores) => {
  for (const [chave, valor] of Object.entries(valores)) {
    if (typeof valor === "number") {
      acumulador[chave] = (acumulador[chave] || 0) + valor;
    } else if (typeof valor === "boolean") {
      acumulador[chave] = (acumulador[chave] || 0) + Number(valor);
    } else if (valor && typeof valor === "object") {
      acumulador[chave] ||= {};
      acumularValores(acumulador[chave], valor);
    }
  }
};

module.exports = acumularValores;