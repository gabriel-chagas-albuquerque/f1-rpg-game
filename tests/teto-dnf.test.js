const test = require("node:test");
const assert = require("node:assert/strict");

const pilotos = require("../pilotos.json");
const equipes = require("../equipes.json");
const configuracoes = require("../pesos.json");
const aplicarTetoDNF = require("../funcoes/aplicarTetoDNF");
const calcularMediaEsperadaDNF = require("../funcoes/calcularMediaEsperadaDNF");
const calcularTetoDNF = require("../funcoes/calcularTetoDNF");
const calcularOrdemDeChegada = require("../funcoes/calcularOrdemDeChegada");
const { DNF_TETO } = require("../funcoes/configuracoes");
const { CFG, probFalhaMecEquipe } = require("../descritoresParaPesos");

const usarAleatorio = (valor, executar) => {
  const original = Math.random;
  Math.random = () => valor;
  try {
    return executar();
  } finally {
    Math.random = original;
  }
};

const usarSequenciaAleatoria = (valores, executar) => {
  const original = Math.random;
  const fila = [...valores];
  Math.random = () => (fila.length > 0 ? fila.shift() : 0.5);
  try {
    return executar();
  } finally {
    Math.random = original;
  }
};

test("teto dinâmico segue os valores de referência e valida a configuração", () => {
  const configuracao = {
    modo: "dinamico",
    minimoDinamico: 5,
    desviosDinamico: 2,
  };
  assert.equal(calcularTetoDNF(1.79, configuracao), 5);
  assert.equal(calcularTetoDNF(3.27, configuracao), 7);
  assert.equal(calcularTetoDNF(4.74, configuracao), 9);
  assert.equal(calcularTetoDNF(100), DNF_TETO.fixo);
  assert.throws(() => calcularTetoDNF(-1, configuracao), /média esperada/i);
});

test("média esperada combina probabilidades efetivas mecânica e humana", () => {
  const grid = [
    {
      piloto: { consistencia: 50 },
      equipe: { durabilidade: 50 },
    },
  ];
  const media = calcularMediaEsperadaDNF(grid, {
    ProbFalhaHumanaBase: 1,
    FracaoDNFHumana: 0.4,
    ProbFalhaMecanicaBase: 2,
    FracaoDNFMecanica: 0.5,
  });
  const probabilidadeMecanica = Math.min(
    CFG.durabilidadeTeto,
    2 * probFalhaMecEquipe(50),
  );
  const probabilidadeDNF =
    1 - (1 - 0.2) * (1 - probabilidadeMecanica * 0.5);
  assert.ok(Math.abs(media - probabilidadeDNF) < 1e-12);
});

test("candidatos excedentes são selecionados uniformemente sem alterar a entrada", () => {
  const candidatos = ["A", "B", "C", "D"];
  let sorteios = 0;
  const { mantidos, cortados } = aplicarTetoDNF(
    candidatos,
    2,
    () => {
      sorteios++;
      return 0;
    },
  );
  assert.deepEqual(mantidos, ["B", "C"]);
  assert.deepEqual(cortados, ["D", "A"]);
  assert.equal(sorteios, 3);
  assert.deepEqual(candidatos, ["A", "B", "C", "D"]);
  assert.deepEqual(aplicarTetoDNF(candidatos, 4), {
    mantidos: candidatos,
    cortados: [],
  });
});

test("DNFs cortados viram falhas moderadas e deixam de gerar Safety Car", () => {
  const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));
  const grid = pilotos.slice(0, 2).map((piloto, indice) => {
    const pilotoTeste = { ...piloto, consistencia: 0 };
    const equipeTeste = {
      ...equipePorNome.get(piloto.equipe),
      durabilidade: 0,
    };
    return {
      piloto: pilotoTeste,
      equipe: equipeTeste,
      posicaoLargada: indice + 1,
      scoreQualificacao: 0,
    };
  });
  const pesosCorrida = JSON.parse(
    JSON.stringify(configuracoes[0].pesos.corrida),
  );
  Object.assign(pesosCorrida.falhas, {
    ProbFalhaHumanaBase: 2,
    FracaoDNFHumana: 1,
    ProbFalhaMecanicaBase: 10,
    FracaoDNFMecanica: 1,
    PenalidadeZMin: 2,
    PenalidadeZMax: 5,
  });

  const resultados = usarSequenciaAleatoria(
    Array(grid.length * 4).fill(0),
    () =>
    calcularOrdemDeChegada(
      grid,
      pesosCorrida,
      0,
      1,
      53,
      { teto_dnf: 0 },
    ),
  );

  assert.equal(resultados.length, 2);
  for (const resultado of resultados) {
    assert.equal(resultado.dnf.ocorreu, false);
    assert.equal(resultado.dnfCortadoPeloTeto, true);
    assert.equal(resultado.falhaDurabilidade.dnf, false);
    assert.equal(resultado.falhaDurabilidade.dnfCortadoPeloTeto, true);
    assert.equal(resultado.falhaDurabilidade.voltaAbandono, null);
    assert.equal(resultado.falhaDurabilidade.penalidade, 3.5);
    assert.equal(resultado.falhaHumana.dnf, false);
    assert.equal(resultado.falhaHumana.dnfCortadoPeloTeto, true);
    assert.equal(resultado.falhaHumana.penalidade, 3.5);
    assert.equal(resultado.eventosSafetyCar.length, 0);
  }
});

test("modo dinâmico calcula mu por participante antes de limitar os DNFs", () => {
  const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));
  const grid = pilotos.map((piloto, indice) => ({
    piloto: { ...piloto, consistencia: 0 },
    equipe: {
      ...equipePorNome.get(piloto.equipe),
      durabilidade: 0,
    },
    posicaoLargada: indice + 1,
    scoreQualificacao: 0,
  }));
  const pesosCorrida = JSON.parse(
    JSON.stringify(configuracoes[0].pesos.corrida),
  );
  Object.assign(pesosCorrida.falhas, {
    ProbFalhaHumanaBase: 0.1,
    FracaoDNFHumana: 1,
    ProbFalhaMecanicaBase: 0.1 / probFalhaMecEquipe(0),
    FracaoDNFMecanica: 1,
  });
  const modoAnterior = DNF_TETO.modo;
  DNF_TETO.modo = "dinamico";
  try {
    const original = Math.random;
    let sorteios = 0;
    Math.random = () => (sorteios++ < grid.length * 6 ? 0.001 : 0.5);
    let resultados;
    try {
      resultados = calcularOrdemDeChegada(
        grid,
        pesosCorrida,
        0,
        1,
        53,
        {},
      );
    } finally {
      Math.random = original;
    }
    const mu = grid.length * (1 - (1 - 0.1) ** 2);
    const tetoEsperado = Math.max(5, Math.round(mu + 2 * Math.sqrt(mu)));
    assert.ok(resultados.every((resultado) => resultado.tetoDNF === tetoEsperado));
    assert.equal(
      resultados.filter((resultado) => resultado.dnf.ocorreu).length,
      tetoEsperado,
    );
    assert.equal(
      resultados.filter((resultado) => resultado.dnfCortadoPeloTeto).length,
      grid.length - tetoEsperado,
    );
  } finally {
    DNF_TETO.modo = modoAnterior;
  }
});
