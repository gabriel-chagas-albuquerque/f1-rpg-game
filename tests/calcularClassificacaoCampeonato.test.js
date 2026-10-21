const test = require("node:test");
const assert = require("node:assert/strict");

const calcularClassificacaoCampeonato = require("../funcoes/calcularClassificacaoCampeonato");

test("soma pontos de pilotos e equipes pela tabela F1", () => {
  const resultado = calcularClassificacaoCampeonato([
    {
      GP: "GP A",
      classificacao: [
        { piloto: "Piloto A", equipe: "Equipe X", posicao: 1, status: "finalizado" },
        { piloto: "Piloto B", equipe: "Equipe Y", posicao: 2, status: "finalizado" },
        { piloto: "Piloto C", equipe: "Equipe X", posicao: 11, status: "finalizado" },
      ],
    },
    {
      GP: "GP B",
      classificacao: [
        { piloto: "Piloto B", equipe: "Equipe Y", posicao: 1, status: "finalizado" },
        { piloto: "Piloto A", equipe: "Equipe X", posicao: 10, status: "finalizado" },
        { piloto: "Piloto C", equipe: "Equipe X", posicao: 2, status: "finalizado" },
      ],
    },
  ]);

  assert.deepEqual(resultado.classificacaoPilotos, [
    { posicao: 1, piloto: "Piloto B", equipe: "Equipe Y", pontos: 43 },
    { posicao: 2, piloto: "Piloto A", equipe: "Equipe X", pontos: 26 },
    { posicao: 3, piloto: "Piloto C", equipe: "Equipe X", pontos: 18 },
  ]);
  assert.deepEqual(resultado.classificacaoEquipes, [
    { posicao: 1, equipe: "Equipe X", pontos: 44 },
    { posicao: 2, equipe: "Equipe Y", pontos: 43 },
  ]);
});

test("DNF não pontua, mesmo quando a posição ficaria entre as dez primeiras", () => {
  const resultado = calcularClassificacaoCampeonato([
    {
      GP: "GP A",
      classificacao: [
        { piloto: "Finalizado", equipe: "Equipe A", posicao: 1, status: "finalizado" },
        { piloto: "DNF", equipe: "Equipe B", posicao: 2, status: "dnf" },
      ],
    },
  ]);

  assert.deepEqual(resultado.classificacaoPilotos, [
    { posicao: 1, piloto: "Finalizado", equipe: "Equipe A", pontos: 25 },
    { posicao: 2, piloto: "DNF", equipe: "Equipe B", pontos: 0 },
  ]);
  assert.deepEqual(resultado.classificacaoEquipes[1], {
    posicao: 2,
    equipe: "Equipe B",
    pontos: 0,
  });
});

test("desempata pelo maior número de melhores posições", () => {
  const resultado = calcularClassificacaoCampeonato([
    {
      GP: "GP A",
      classificacao: [
        { piloto: "Vitórias", equipe: "Equipe A", posicao: 1, status: "finalizado" },
        { piloto: "Pódios", equipe: "Equipe B", posicao: 2, status: "finalizado" },
      ],
    },
    {
      GP: "GP B",
      classificacao: [
        { piloto: "Pódios", equipe: "Equipe B", posicao: 6, status: "finalizado" },
        { piloto: "Vitórias", equipe: "Equipe A", posicao: 10, status: "finalizado" },
      ],
    },
  ]);

  assert.deepEqual(
    resultado.classificacaoPilotos.map(({ piloto }) => piloto),
    ["Vitórias", "Pódios"],
  );
});

test("rejeita entrada sem lista de circuitos ou classificação", () => {
  assert.throws(() => calcularClassificacaoCampeonato(null), /lista/);
  assert.throws(
    () => calcularClassificacaoCampeonato([{ GP: "GP A" }]),
    /Classificação ausente ou inválida/,
  );
});
