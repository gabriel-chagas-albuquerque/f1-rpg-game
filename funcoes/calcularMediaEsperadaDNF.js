const calcularProbabilidadeFalha = require("./calcularProbabilidadeFalha");

const calcularMediaEsperadaDNF = (gridDeLargada, falhas) => {
  if (!Array.isArray(gridDeLargada) || gridDeLargada.length === 0) {
    throw new Error("O grid de largada deve ser uma lista não vazia.");
  }
  if (!falhas || typeof falhas !== "object") {
    throw new Error("Configuração de falhas ausente para calcular a média de DNF.");
  }

  const fracaoHumana = falhas.FracaoDNFHumana;
  const fracaoMecanica = falhas.FracaoDNFMecanica;
  if (
    typeof fracaoHumana !== "number" ||
    !Number.isFinite(fracaoHumana) ||
    fracaoHumana < 0 ||
    fracaoHumana > 1 ||
    typeof fracaoMecanica !== "number" ||
    !Number.isFinite(fracaoMecanica) ||
    fracaoMecanica < 0 ||
    fracaoMecanica > 1
  ) {
    throw new Error("Frações de DNF ausentes ou inválidas.");
  }

  return gridDeLargada.reduce((media, { piloto, equipe }) => {
    // Mesma função e mesma regra do calcularFalha: min(1, fatorBase x faixa(atributo)).
    const probabilidadeHumana = calcularProbabilidadeFalha(
      falhas.FatorBaseFalhaHumana,
      piloto.consistencia,
      "humana",
    );
    const probabilidadeMecanica = calcularProbabilidadeFalha(
      falhas.FatorBaseFalhaMecanica,
      equipe.durabilidade,
      "mecanica",
    );
    const probabilidadeDNF =
      1 -
      (1 - probabilidadeHumana * fracaoHumana) *
        (1 - probabilidadeMecanica * fracaoMecanica);

    return media + probabilidadeDNF;
  }, 0);
};

module.exports = calcularMediaEsperadaDNF;