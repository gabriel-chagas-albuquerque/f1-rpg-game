const PONTOS_POR_POSICAO = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

const calcularPontos = (resultado) => {
  if (resultado.status !== "finalizado") return 0;
  return PONTOS_POR_POSICAO[resultado.posicao - 1] ?? 0;
};

const compararPosicoes = (a, b) => {
  const maiorPosicao = Math.max(
    0,
    ...Object.keys(a.posicoes).map(Number),
    ...Object.keys(b.posicoes).map(Number),
  );
  for (
    let indice = 1;
    indice <= maiorPosicao;
    indice++
  ) {
    const diferenca =
      (b.posicoes[indice] ?? 0) - (a.posicoes[indice] ?? 0);
    if (diferenca !== 0) return diferenca;
  }
  return a.nome.localeCompare(b.nome);
};

const calcularClassificacaoCampeonato = (circuitos) => {
  if (!Array.isArray(circuitos)) {
    throw new Error("Os resultados dos circuitos devem ser uma lista.");
  }

  const pilotos = new Map();
  const equipes = new Map();

  for (const circuito of circuitos) {
    if (!Array.isArray(circuito.classificacao)) {
      throw new Error(
        `Classificação ausente ou inválida para ${circuito.GP ?? "circuito"}.`,
      );
    }

    for (const resultado of circuito.classificacao) {
      const pontos = calcularPontos(resultado);
      const piloto = pilotos.get(resultado.piloto) ?? {
        nome: resultado.piloto,
        equipe: resultado.equipe,
        pontos: 0,
        posicoes: {},
      };
      piloto.pontos += pontos;
      piloto.posicoes[resultado.posicao] =
        (piloto.posicoes[resultado.posicao] ?? 0) + 1;
      pilotos.set(resultado.piloto, piloto);

      const equipe = equipes.get(resultado.equipe) ?? {
        nome: resultado.equipe,
        pontos: 0,
        posicoes: {},
      };
      equipe.pontos += pontos;
      equipe.posicoes[resultado.posicao] =
        (equipe.posicoes[resultado.posicao] ?? 0) + 1;
      equipes.set(resultado.equipe, equipe);
    }
  }

  const ordenar = (a, b) =>
    b.pontos - a.pontos || compararPosicoes(a, b);
  const classificacaoPilotos = [...pilotos.values()]
    .sort(ordenar)
    .map(({ nome, equipe, pontos }, indice) => ({
      posicao: indice + 1,
      piloto: nome,
      equipe,
      pontos,
    }));
  const classificacaoEquipes = [...equipes.values()]
    .sort(ordenar)
    .map(({ nome, pontos }, indice) => ({
      posicao: indice + 1,
      equipe: nome,
      pontos,
    }));

  return { classificacaoPilotos, classificacaoEquipes };
};

module.exports = calcularClassificacaoCampeonato;
module.exports.calcularPontos = calcularPontos;
