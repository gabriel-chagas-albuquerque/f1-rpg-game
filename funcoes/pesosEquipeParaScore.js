const CONFIG_PADRAO = require("../config/operacoes.config");

const pesosEquipeParaScore = (pesosEquipe, config = CONFIG_PADRAO) => {
  if (!config.ATIVAR_BONUS_OPERACOES) {
    return { ...pesosEquipe };
  }

  const filtrados = {};
  let soma = 0;
  for (const [atributo, peso] of Object.entries(pesosEquipe)) {
    if (atributo !== "Operacoes") {
      filtrados[atributo] = peso;
      soma += peso;
    }
  }

  if (soma <= 0) {
    throw new Error(
      "A soma dos pesos de equipe sem Operações deve ser positiva.",
    );
  }

  const normalizados = {};
  for (const [atributo, peso] of Object.entries(filtrados)) {
    normalizados[atributo] = peso / soma;
  }

  return normalizados;
};

module.exports = pesosEquipeParaScore;
