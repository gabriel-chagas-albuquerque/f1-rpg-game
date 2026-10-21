const readJson = require("./funcoes/readJson");
const criarNomeArquivo = require("./funcoes/criarNomeArquivo");
const { atributosEquipe } = require("./funcoes/configuracoes");
const configOperacoes = require("./config/operacoes.config");
const pesosEquipeParaScore = require("./funcoes/pesosEquipeParaScore");

const ATRIBUTOS = Object.keys(atributosEquipe).filter(
  (atributo) => !configOperacoes.ATIVAR_BONUS_OPERACOES || atributo !== "Operacoes",
);
const LIMITE_RESIDUO = 0.05;

const resolverSistemaLinear = (matriz, valores) => {
  const tamanho = valores.length;
  const aumentado = matriz.map((linha, indice) => [
    ...linha,
    valores[indice],
  ]);

  for (let coluna = 0; coluna < tamanho; coluna++) {
    let linhaPivo = coluna;
    for (let linha = coluna + 1; linha < tamanho; linha++) {
      if (
        Math.abs(aumentado[linha][coluna]) >
        Math.abs(aumentado[linhaPivo][coluna])
      ) {
        linhaPivo = linha;
      }
    }
    if (Math.abs(aumentado[linhaPivo][coluna]) < 1e-12) {
      throw new Error(
        "Os pesos das pistas não permitem recuperar todos os atributos da equipe.",
      );
    }

    [aumentado[coluna], aumentado[linhaPivo]] = [
      aumentado[linhaPivo],
      aumentado[coluna],
    ];
    const divisor = aumentado[coluna][coluna];
    for (let indice = coluna; indice <= tamanho; indice++) {
      aumentado[coluna][indice] /= divisor;
    }

    for (let linha = 0; linha < tamanho; linha++) {
      if (linha === coluna) continue;
      const fator = aumentado[linha][coluna];
      for (let indice = coluna; indice <= tamanho; indice++) {
        aumentado[linha][indice] -= fator * aumentado[coluna][indice];
      }
    }
  }

  return aumentado.map((linha) => linha[tamanho]);
};

const resolverMinimosQuadrados = (matriz, valores) => {
  if (
    !Array.isArray(matriz) ||
    matriz.length !== valores.length ||
    matriz.length < ATRIBUTOS.length ||
    matriz.some(
      (linha) =>
        linha.length !== ATRIBUTOS.length ||
        linha.some((valor) => !Number.isFinite(valor)),
    ) ||
    valores.some((valor) => !Number.isFinite(valor))
  ) {
    throw new Error("Observações inválidas para regressão dos atributos.");
  }

  const normal = ATRIBUTOS.map((_, linha) =>
    ATRIBUTOS.map((__, coluna) =>
      matriz.reduce(
        (total, observacao) =>
          total + observacao[linha] * observacao[coluna],
        0,
      ),
    ),
  );
  const ladoDireito = ATRIBUTOS.map((_, indice) =>
    matriz.reduce(
      (total, observacao, linha) =>
        total + observacao[indice] * valores[linha],
      0,
    ),
  );
  return resolverSistemaLinear(normal, ladoDireito);
};

const recuperarAtributos = (equipes, configuracoes, resultadosPorGP) => {
  const resultadosPorNome = new Map(
    resultadosPorGP.map((resultado) => [resultado.GP, resultado]),
  );
  const matriz = [];
  const observacoesPorEquipe = new Map(
    equipes.map((equipe) => [equipe.equipe, []]),
  );

  for (const configuracao of configuracoes) {
    const resultado = resultadosPorNome.get(configuracao.GP);
    if (!resultado || !Array.isArray(resultado.resultadosCorrida)) {
      throw new Error(`Resultados ausentes para o GP ${configuracao.GP}.`);
    }
    const pesos = pesosEquipeParaScore(configuracao.pesos.corrida.equipe);
    matriz.push(ATRIBUTOS.map((atributo) => pesos[atributo]));

    const scoresPorEquipe = new Map();
    for (const item of resultado.resultadosCorrida) {
      const score = item.scores?.corrida?.scoreEquipeBruto;
      if (typeof score !== "number" || !Number.isFinite(score)) {
        throw new Error(
          `scoreEquipeBruto ausente ou inválido no GP ${configuracao.GP}.`,
        );
      }
      const acumulado = scoresPorEquipe.get(item.equipe) ?? {
        soma: 0,
        quantidade: 0,
      };
      acumulado.soma += score;
      acumulado.quantidade++;
      scoresPorEquipe.set(item.equipe, acumulado);
    }

    for (const equipe of equipes) {
      const acumulado = scoresPorEquipe.get(equipe.equipe);
      if (!acumulado) {
        throw new Error(
          `Score da equipe ${equipe.equipe} ausente no GP ${configuracao.GP}.`,
        );
      }
      observacoesPorEquipe.get(equipe.equipe).push(
        acumulado.soma / acumulado.quantidade,
      );
    }
  }

  let residuoMaximoRating = 0;
  let residuoMaximoScore = 0;
  const recuperadas = equipes.map((equipe) => {
    const scores = observacoesPorEquipe.get(equipe.equipe);
    const ratings = resolverMinimosQuadrados(matriz, scores);
    const recuperada = { equipe: equipe.equipe };
    if (configOperacoes.ATIVAR_BONUS_OPERACOES) {
      recuperada.operacoes = equipe.operacoes;
    }
    ATRIBUTOS.forEach((atributo, indice) => {
      const campo = atributosEquipe[atributo];
      recuperada[campo] = ratings[indice];
      residuoMaximoRating = Math.max(
        residuoMaximoRating,
        Math.abs(ratings[indice] - equipe[campo]),
      );
    });
    matriz.forEach((pesos, indice) => {
      const previsto = pesos.reduce(
        (total, peso, atributo) => total + peso * ratings[atributo],
        0,
      );
      residuoMaximoScore = Math.max(
        residuoMaximoScore,
        Math.abs(previsto - scores[indice]),
      );
    });
    return recuperada;
  });

  const hierarquias = configuracoes.map((configuracao) => {
    const pesos = configuracao.pesos.corrida.equipe;
    const ranking = recuperadas
      .map((equipe) => ({
        equipe: equipe.equipe,
        score: ATRIBUTOS.reduce(
          (total, atributo) =>
            total + pesos[atributo] * equipe[atributosEquipe[atributo]],
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score);
    return { GP: configuracao.GP, equipes: ranking };
  });

  return {
    recuperadas,
    residuoMaximoRating,
    residuoMaximoScore,
    hierarquias,
  };
};

const executar = () => {
  const equipes = readJson("equipes.json");
  const configuracoes = readJson("pesos.json");
  const fs = require("node:fs");
  const path = require("node:path");
  const resultadosPorGP = configuracoes.map((configuracao) => {
    const nomeBase = criarNomeArquivo(configuracao.GP).replace(
      /^resultados_/,
      "resultados_secos_",
    );
    const caminhoOutputs = path.join("outputs", "index", nomeBase);
    return readJson(
      fs.existsSync(path.join(__dirname, caminhoOutputs))
        ? caminhoOutputs
        : nomeBase,
    );
  });
  const resultado = recuperarAtributos(
    equipes,
    configuracoes,
    resultadosPorGP,
  );

  console.log(
    `Resíduo máximo de rating: ${resultado.residuoMaximoRating.toFixed(4)} (limite < ${LIMITE_RESIDUO})`,
  );
  console.log(
    `Resíduo máximo de score: ${resultado.residuoMaximoScore.toFixed(4)}`,
  );
  console.table(
    resultado.recuperadas.map((equipe) => ({
      equipe: equipe.equipe,
      ...Object.fromEntries(
        ATRIBUTOS.map((atributo) => [
          atributo,
          Number(equipe[atributosEquipe[atributo]].toFixed(3)),
        ]),
      ),
    })),
  );

  for (const hierarquia of resultado.hierarquias) {
    console.log(
      `Hierarquia por pista — ${hierarquia.GP}: ${hierarquia.equipes
        .map(
          ({ equipe, score }, indice) =>
            `${indice + 1}. ${equipe} (${score.toFixed(3)})`,
        )
        .join(" > ")}`,
    );
  }

  if (resultado.residuoMaximoRating >= LIMITE_RESIDUO) {
    throw new Error(
      `A recuperação excedeu o resíduo máximo permitido (${LIMITE_RESIDUO}).`,
    );
  }
  return resultado;
};

module.exports = {
  LIMITE_RESIDUO,
  recuperarAtributos,
  resolverMinimosQuadrados,
};

if (require.main === module) {
  executar();
}
