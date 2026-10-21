const arredondarZ = require("./arredondarZ");

const calcularResultadosEquipes = (ordemDeChegada) => {
  const equipesAgrupadas = new Map();

  for (const resultado of ordemDeChegada) {
    if (!equipesAgrupadas.has(resultado.equipe)) {
      equipesAgrupadas.set(resultado.equipe, {
        equipe: resultado.equipe,
        pilotos: [],
        scoreEquipeQualySomado: 0,
        contribuicaoEquipeQualySomada: 0,
        scoreEquipeCorridaSomado: 0,
        contribuicaoEquipeCorridaSomada: 0,
      });
    }

    const equipe = equipesAgrupadas.get(resultado.equipe);
    equipe.pilotos.push(resultado.piloto);
    equipe.scoreEquipeQualySomado += resultado.scoreQualificacao.scoreEquipe;
    equipe.contribuicaoEquipeQualySomada +=
      resultado.scoreQualificacao.contribuicaoEquipe;
    equipe.scoreEquipeCorridaSomado += resultado.scoreEquipe;
    equipe.contribuicaoEquipeCorridaSomada += resultado.contribuicaoEquipe;
  }

  return [...equipesAgrupadas.values()]
    .sort(
      (a, b) =>
        b.contribuicaoEquipeCorridaSomada - a.contribuicaoEquipeCorridaSomada,
    )
    .map((equipe, indice) => ({
      posicao: indice + 1,
      equipe: equipe.equipe,
      pilotos: equipe.pilotos,
      scores: {
        qualificacao: {
          scoreEquipeSomado: arredondarZ(equipe.scoreEquipeQualySomado),
          contribuicaoEquipeSomada: arredondarZ(
            equipe.contribuicaoEquipeQualySomada,
          ),
        },
        corrida: {
          scoreEquipeSomado: arredondarZ(equipe.scoreEquipeCorridaSomado),
          contribuicaoEquipeSomada: arredondarZ(
            equipe.contribuicaoEquipeCorridaSomada,
          ),
        },
      },
    }));
};

module.exports = calcularResultadosEquipes;