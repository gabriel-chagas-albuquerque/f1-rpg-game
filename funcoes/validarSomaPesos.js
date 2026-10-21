const validarSomaPesos = (pesos, descricao) => {
  const valores = Object.values(pesos);
  const soma = valores.reduce((total, peso) => total + peso, 0);

  if (
    valores.length === 0 ||
    valores.some((peso) => typeof peso !== "number") ||
    Math.abs(soma - 1) > 0.001
  ) {
    throw new Error(`Os pesos de ${descricao} devem somar 1,00.`);
  }
};

module.exports = validarSomaPesos;