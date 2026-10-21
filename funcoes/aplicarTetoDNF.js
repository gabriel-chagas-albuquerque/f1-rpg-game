const aplicarTetoDNF = (candidatos, teto, rand = Math.random) => {
  if (!Array.isArray(candidatos)) {
    throw new Error("Os candidatos a DNF devem ser uma lista.");
  }
  if (!Number.isInteger(teto) || teto < 0) {
    throw new Error("O teto de DNF deve ser um inteiro não negativo.");
  }
  if (typeof rand !== "function") {
    throw new Error("O gerador aleatório do teto de DNF deve ser uma função.");
  }

  if (candidatos.length <= teto) {
    return { mantidos: candidatos, cortados: [] };
  }

  const embaralhados = [...candidatos];
  for (let indice = embaralhados.length - 1; indice > 0; indice--) {
    const sorteio = rand();
    if (
      typeof sorteio !== "number" ||
      !Number.isFinite(sorteio) ||
      sorteio < 0 ||
      sorteio >= 1
    ) {
      throw new Error("O gerador aleatório do teto de DNF retornou valor inválido.");
    }
    const outroIndice = Math.floor(sorteio * (indice + 1));
    [embaralhados[indice], embaralhados[outroIndice]] = [
      embaralhados[outroIndice],
      embaralhados[indice],
    ];
  }
  return {
    mantidos: embaralhados.slice(0, teto),
    cortados: embaralhados.slice(teto),
  };
};

module.exports = aplicarTetoDNF;
