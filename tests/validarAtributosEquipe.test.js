const test = require("node:test");
const assert = require("node:assert/strict");

const equipes = require("../equipes.json");
const configuracoes = require("../pesos.json");
const readJson = require("../funcoes/readJson");
const criarNomeArquivo = require("../funcoes/criarNomeArquivo");
const {
  LIMITE_RESIDUO,
  recuperarAtributos,
} = require("../validar-atributos-equipe");
const { atributosEquipe } = require("../funcoes/configuracoes");

const pesosEquipeParaScore = require("../funcoes/pesosEquipeParaScore");

test("regressão recupera os ratings fornecidos pelos scores sintéticos", () => {
  const resultadosPorGP = configuracoes.map((configuracao) => ({
    GP: configuracao.GP,
    resultadosCorrida: equipes.map((equipe) => ({
      equipe: equipe.equipe,
      scores: {
        corrida: {
          scoreEquipeBruto: Object.entries(
            pesosEquipeParaScore(configuracao.pesos.corrida.equipe),
          ).reduce(
            (total, [atributo, peso]) =>
              total + equipe[atributosEquipe[atributo]] * peso,
            0,
          ),
        },
      },
    })),
  }));

  const resultado = recuperarAtributos(
    equipes,
    configuracoes,
    resultadosPorGP,
  );

  assert.ok(resultado.residuoMaximoRating < LIMITE_RESIDUO);
  assert.ok(resultado.residuoMaximoScore < 1e-9);
  assert.equal(resultado.hierarquias.length, configuracoes.length);
  for (const equipe of equipes) {
    const recuperada = resultado.recuperadas.find(
      (item) => item.equipe === equipe.equipe,
    );
    for (const atributo of Object.values(atributosEquipe)) {
      assert.ok(
        Math.abs(recuperada[atributo] - equipe[atributo]) < LIMITE_RESIDUO,
        `${equipe.equipe}/${atributo} não foi recuperado`,
      );
    }
  }
});

test("regressão dos resultados secos recupera os ratings fornecidos", (t) => {
  const fs = require("node:fs");
  const path = require("node:path");
  const existemTodos = configuracoes.every((configuracao) => {
    const nomeBase = criarNomeArquivo(configuracao.GP).replace(
      /^resultados_/,
      "resultados_secos_",
    );
    const caminhoOutputs = path.join("outputs", "index", nomeBase);
    return (
      fs.existsSync(path.join(__dirname, "..", caminhoOutputs)) ||
      fs.existsSync(path.join(__dirname, "..", nomeBase))
    );
  });

  if (!existemTodos) {
    t.skip("Arquivos de simulação secos não encontrados para todos os GPs");
    return;
  }

  const resultadosPorGP = configuracoes.map((configuracao) => {
    const nomeBase = criarNomeArquivo(configuracao.GP).replace(
      /^resultados_/,
      "resultados_secos_",
    );
    const caminhoOutputs = path.join("outputs", "index", nomeBase);
    return readJson(
      fs.existsSync(path.join(__dirname, "..", caminhoOutputs))
        ? caminhoOutputs
        : nomeBase,
    );
  });
  const resultado = recuperarAtributos(
    equipes,
    configuracoes,
    resultadosPorGP,
  );

  assert.ok(resultado.residuoMaximoRating < LIMITE_RESIDUO);
  assert.ok(resultado.residuoMaximoScore < LIMITE_RESIDUO);
});
