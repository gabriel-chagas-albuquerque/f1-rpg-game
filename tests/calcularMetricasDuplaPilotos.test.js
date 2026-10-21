const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calcularMetricasDuplaPilotos,
  encontrarCompanheiroEquipe,
} = require("../funcoes/calcularMetricasDuplaPilotos");

const circuitos = [
  {
    GP: "GP A",
    classificacao: [
      {
        piloto: "Gabriel Albuquerque",
        equipe: "Williams",
        largada: 1,
        posicao: 3,
        status: "finalizado",
        falhaHumana: false,
        motivo: undefined,
      },
      {
        piloto: "Carlos Sainz",
        equipe: "Williams",
        largada: 2,
        posicao: 22,
        status: "dnf",
        falhaHumana: false,
        motivo: "falha mecânica",
      },
    ],
  },
  {
    GP: "GP B",
    classificacao: [
      {
        piloto: "Gabriel Albuquerque",
        equipe: "Williams",
        largada: 12,
        posicao: 22,
        status: "dnf",
        falhaHumana: true,
        motivo: "erro humano",
      },
      {
        piloto: "Carlos Sainz",
        equipe: "Williams",
        largada: 8,
        posicao: 7,
        status: "finalizado",
        falhaHumana: true,
        motivo: undefined,
      },
    ],
  },
];

test("encontra o companheiro pelo nome da equipe do piloto", () => {
  const { piloto, companheiro } = encontrarCompanheiroEquipe(
    [
      { piloto: "Gabriel Albuquerque", equipe: "Williams" },
      { piloto: "Carlos Sainz", equipe: "Williams" },
      { piloto: "Piloto de outra equipe", equipe: "Alpine" },
    ],
    "Gabriel Albuquerque",
  );

  assert.equal(piloto.piloto, "Gabriel Albuquerque");
  assert.equal(companheiro.piloto, "Carlos Sainz");
});

test("calcula comparativo de qualy, corrida, falhas e pontos sem XP legado", () => {
  const { piloto, companheiro } = encontrarCompanheiroEquipe(
    [
      { piloto: "Gabriel Albuquerque", equipe: "Williams" },
      { piloto: "Carlos Sainz", equipe: "Williams" },
    ],
    "Gabriel Albuquerque",
  );
  const metricas = calcularMetricasDuplaPilotos(
    circuitos,
    piloto,
    companheiro,
  );
  const [gabriel, carlos] = metricas.pilotos;

  assert.equal(metricas.corridas, 2);
  assert.equal(gabriel.qualificacao.diferencaMediaPosicao, 1.5);
  assert.equal(gabriel.qualificacao.vitorias, 1);
  assert.equal(gabriel.qualificacao.taxaVitoriasPercentual, 50);
  assert.equal(gabriel.qualificacao.aparicoesQ2, 2);
  assert.equal(gabriel.qualificacao.aparicoesQ3, 1);
  assert.equal(gabriel.corrida.diferencaMediaPosicao, -2);
  assert.equal(gabriel.corrida.vitorias, 1);
  assert.equal(gabriel.corrida.ganhoPosicaoMedio, -6);
  assert.equal(gabriel.corrida.pontos, 15);
  assert.equal(gabriel.corrida.top5, 1);
  assert.equal(gabriel.corrida.top10, 1);
  assert.equal(gabriel.falhas.corridasComFalhaHumana, 1);
  assert.equal(gabriel.falhas.taxaFalhasHumanasPercentual, 50);
  assert.equal(gabriel.falhas.dnfsErroHumano, 1);
  assert.equal(gabriel.falhas.dnfsFalhaMecanica, 0);
  assert.equal(carlos.corrida.pontos, 6);
  assert.equal(carlos.falhas.dnfsFalhaMecanica, 1);
  assert.equal(gabriel.xp, undefined);
  assert.equal(carlos.xp, undefined);
});

test("rejeita piloto inexistente ou equipe sem exatamente um companheiro", () => {
  assert.throws(
    () => encontrarCompanheiroEquipe([], "Gabriel Albuquerque"),
    /não encontrado/,
  );
  assert.throws(
    () =>
      encontrarCompanheiroEquipe(
        [{ piloto: "Gabriel Albuquerque", equipe: "Williams" }],
        "Gabriel Albuquerque",
      ),
    /exatamente um companheiro/,
  );
});
