const test = require("node:test");
const assert = require("node:assert/strict");

const configuracoes = require("../pesos.json");
const calcularLambdaSafetyCar = require("../funcoes/calcularLambdaSafetyCar");
const calcularScoreCorrida = require("../funcoes/calcularScoreCorrida");
const aplicarSafetyCarAoScore = require("../funcoes/aplicarSafetyCarAoScore");
const calcularOrdemDeChegada = require("../funcoes/calcularOrdemDeChegada");
const aplicarEfeitosChuva = require("../funcoes/aplicarEfeitosChuva");
const sortearSafetyCar = require("../funcoes/sortearSafetyCar");
const pilotos = require("../pilotos.json");
const equipes = require("../equipes.json");

const comSemente = (semente, executar) => {
  const randomOriginal = Math.random;
  let estado = semente >>> 0;
  Math.random = () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0x100000000;
  };
  try {
    return executar();
  } finally {
    Math.random = randomOriginal;
  }
};

const sequencia = (valores, executar) => {
  const randomOriginal = Math.random;
  let indice = 0;
  Math.random = () => valores[indice++] ?? 0.5;
  try {
    return executar();
  } finally {
    Math.random = randomOriginal;
  }
};

test("lambda comprime o sinal conforme a volta do último Safety Car", () => {
  for (const [voltaInicio, esperado] of [
    [10, 43 / 53],
    [26, 27 / 53],
    [40, 13 / 53],
    [50, 0.15],
  ]) {
    assert.ok(
      Math.abs(
        calcularLambdaSafetyCar([{ voltaInicio }], 53) - esperado,
      ) < 0.001,
    );
  }
  assert.equal(calcularLambdaSafetyCar([], 53), 1);
});

test("Safety Cars são válidos, ordenados e não se sobrepõem", () => {
  const eventos = sortearSafetyCar({
    dnfs: [
      { volta: 4, tipo: "humana" },
      { volta: 5, tipo: "mecanica" },
      { volta: 40, tipo: "humana" },
    ],
    voltas: 53,
    rand: () => 0,
  });

  assert.equal(eventos.length, 2);
  assert.deepEqual(
    eventos.map((evento) => evento.voltaInicio),
    [4, 40],
  );
  for (const [indice, evento] of eventos.entries()) {
    assert.ok(evento.voltaInicio >= 1 && evento.voltaInicio < 53);
    assert.ok(evento.duracao >= 1 && evento.duracao <= 6);
    if (indice > 0) {
      assert.ok(
        evento.voltaInicio >=
          eventos[indice - 1].voltaInicio + eventos[indice - 1].duracao,
      );
    }
  }

  const incidente = sortearSafetyCar({
    dnfs: [],
    voltas: 53,
    pctSafetyCar: 1,
    rand: () => 0.5,
  });
  assert.deepEqual(incidente, []);
});

test("probabilidade de SC por DNF humano segue o processo Bernoulli", () => {
  const quantidadeDNF = 4;
  const dnfs = Array.from({ length: quantidadeDNF }, () => ({
    volta: 10,
    tipo: "humana",
  }));
  let estado = 20261004;
  const rand = () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0x100000000;
  };
  let corridasComSafetyCar = 0;
  const repeticoes = 20000;
  for (let indice = 0; indice < repeticoes; indice++) {
    if (
      sortearSafetyCar({
        dnfs,
        voltas: 53,
        rand,
      }).length > 0
    ) {
      corridasComSafetyCar++;
    }
  }
  const percentual = corridasComSafetyCar / repeticoes;
  const esperado = 1 - (1 - 0.1) ** quantidadeDNF;
  assert.ok(Math.abs(percentual - esperado) <= 0.01);
});

test("frequência de SC depende dos DNFs alocados e não de incidentes de base", () => {
  const dnfs = [
    { volta: 8, tipo: "humana" },
    { volta: 18, tipo: "mecanica" },
    { volta: 30, tipo: "humana" },
  ];
  const esperado = 1 - (1 - 0.1) * (1 - 0.05) * (1 - 0.1);
  let estado = 8072026;
  const rand = () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0x100000000;
  };
  let corridasComSafetyCar = 0;
  const repeticoes = 20000;

  for (let indice = 0; indice < repeticoes; indice++) {
    if (
      sortearSafetyCar({
        dnfs,
        voltas: 53,
        pctSafetyCar: 1,
        rand,
      }).length > 0
    ) {
      corridasComSafetyCar++;
    }
  }

  assert.ok(
    Math.abs(corridasComSafetyCar / repeticoes - esperado) <= 0.01,
  );
});

test("RngSafetyCar só existe com evento, é direto no score e não escala com chuva", () => {
  const pesos = {
    pesosGerais: {
      WPosInicial: 0.5,
      WPiloto: 0.1,
      WEquipe: 0.4,
      RngPiloto: 0,
      RngCarro: 0,
      RngOperacoes: 0,
      RngLargada: 0,
      RngSafetyCar: 0.76,
    },
    falhas: {
      ProbFalhaMecanicaBase: 0,
      ProbFalhaHumanaBase: 0,
      FracaoDNFMecanica: 0,
      FracaoDNFHumana: 0,
      PenalidadeZMin: 2,
      PenalidadeZMax: 5,
    },
    equipe: { Operacoes: 0.2 },
  };
  const piloto = { consistencia: 50, velocidade_corrida: 50 };
  const equipe = { durabilidade: 50, operacoes: 50 };
  const semEvento = sequencia(
    Array(12).fill(0.5),
    () =>
      calcularScoreCorrida(
        piloto,
        equipe,
        0.5,
        0,
        0,
        1,
        2,
        pesos,
        1,
        53,
        { eventosSafetyCar: [], lambdaSafetyCar: 1 },
      ),
  );
  assert.equal(semEvento.fatorRNG.safetyCar, undefined);
  assert.equal(
    semEvento.scoreTotal,
    semEvento.scoreAntesRNG + semEvento.fatorRNG.valor -
      semEvento.penalidadeFalhas,
  );

  const comEvento = (pesoEquipe, pesoPiloto) =>
    comSemente(19, () =>
      aplicarSafetyCarAoScore(
        calcularScoreCorrida(
          piloto,
          equipe,
          0.5,
          0,
          0,
          1,
          2,
          {
            ...pesos,
            pesosGerais: {
              ...pesos.pesosGerais,
              WEquipe: pesoEquipe,
              WPiloto: pesoPiloto,
            },
          },
          1,
          53,
        ),
        equipe,
        {
          ...pesos.pesosGerais,
          WEquipe: pesoEquipe,
          WPiloto: pesoPiloto,
        },
        [{ voltaInicio: 30, duracao: 4 }],
        53,
        0.5,
      ),
    );
  const score1 = comEvento(0.05, 0.1);
  const score2 = comEvento(0.8, 0.8);
  assert.equal(
    score1.fatorRNG.safetyCar.valor,
    score2.fatorRNG.safetyCar.valor,
  );
  assert.equal(
    score1.scoreTotal,
    score1.scoreAntesRNG * 0.5 +
      score1.fatorRNG.valor -
      score1.penalidadeFalhas,
  );

  for (const configuracao of configuracoes) {
    const corrida = configuracao.pesos.corrida;
    assert.equal(
      aplicarEfeitosChuva(corrida, false, 0.8).pesosGerais.RngSafetyCar,
      corrida.pesosGerais.RngSafetyCar,
    );
  }
});

test("todas as falhas da corrida são sorteadas antes do primeiro score", () => {
  const configuracao = configuracoes[0];
  const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));
  const grid = pilotos.slice(0, 3).map((piloto, indice) => ({
    piloto: { ...piloto },
    equipe: { ...equipePorNome.get(piloto.equipe) },
    posicaoLargada: indice + 1,
  }));
  let falhasSorteadas = 0;
  for (const item of grid) {
    const valor = item.piloto.consistencia;
    Object.defineProperty(item.piloto, "consistencia", {
      configurable: true,
      get() {
        falhasSorteadas++;
        return valor;
      },
    });
  }
  const velocidadeCorrida = grid[0].piloto.velocidade_corrida;
  Object.defineProperty(grid[0].piloto, "velocidade_corrida", {
    configurable: true,
    get() {
      assert.ok(falhasSorteadas >= grid.length);
      return velocidadeCorrida;
    },
  });

  comSemente(73, () =>
    calcularOrdemDeChegada(
      grid,
      configuracao.pesos.corrida,
      0,
      configuracao.multiplicadorSeveridadeFalha,
      configuracao.voltas,
      { pctSafetyCar: 0 },
    ),
  );
  assert.equal(falhasSorteadas, grid.length * 2);
});

test("voltas configuradas e percentuais de SC são válidos para todas as pistas", () => {
  for (const configuracao of configuracoes) {
    assert.ok(Number.isInteger(configuracao.voltas));
    assert.ok(configuracao.voltas > 0);
    assert.ok(
      configuracao.pct_safety_car >= 0 &&
        configuracao.pct_safety_car <= 1,
    );
    assert.ok(
      Number.isFinite(configuracao.pesos.corrida.pesosGerais.RngSafetyCar),
    );
  }
  assert.deepEqual(
    sortearSafetyCar({
      dnfs: [],
      voltas: 1,
      pctSafetyCar: 1,
      rand: () => 0,
    }),
    [],
  );
  assert.equal(calcularLambdaSafetyCar([], 1), 1);
});
