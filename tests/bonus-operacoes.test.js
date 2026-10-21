const test = require("node:test");
const assert = require("node:assert/strict");

const calcularBonusOperacoes = require("../funcoes/calcularBonusOperacoes");
const pesosEquipeParaScore = require("../funcoes/pesosEquipeParaScore");
const calcularScore = require("../funcoes/calcularScore");
const calcularZScores = require("../funcoes/calcularZScores");
const calcularGridDeLargada = require("../funcoes/calcularGridDeLargada");
const calcularOrdemDeChegada = require("../funcoes/calcularOrdemDeChegada");
const { normalizarDescritor } = require("../descritoresParaPesos");
const CONFIG_OPS = require("../config/operacoes.config");
const { atributosEquipe } = require("../funcoes/configuracoes");

const equipes = require("../equipes.json");
const pilotos = require("../pilotos.json");
const pesos = require("../pesos.json");

const equipePorNome = new Map(equipes.map((e) => [e.equipe, e]));

test("1. calcularBonusOperacoes respeita regras matemáticas e validações", () => {
  // z = 0 ou flag false retorna 0
  assert.equal(
    calcularBonusOperacoes({
      zOperacoes: 0,
      intensidadeOperacoes: 1.0,
      sessao: "corrida",
    }).bonus,
    0,
  );
  assert.equal(
    calcularBonusOperacoes(
      {
        zOperacoes: 1.5,
        intensidadeOperacoes: 1.2,
        sessao: "corrida",
      },
      { config: { ATIVAR_BONUS_OPERACOES: false } },
    ).bonus,
    0,
  );

  // Sinal do bônus acompanha o sinal de z
  assert.ok(
    calcularBonusOperacoes({
      zOperacoes: 1.2,
      intensidadeOperacoes: 1.0,
      sessao: "corrida",
    }).bonus > 0,
  );
  assert.ok(
    calcularBonusOperacoes({
      zOperacoes: -1.2,
      intensidadeOperacoes: 1.0,
      sessao: "corrida",
    }).bonus < 0,
  );

  // Proporcional à intensidade da pista (1.35 produz 35% mais que 1.0)
  const bBase = calcularBonusOperacoes({
    zOperacoes: 1.0,
    intensidadeOperacoes: 1.0,
    sessao: "corrida",
  }).bonus;
  const bIntensa = calcularBonusOperacoes({
    zOperacoes: 1.0,
    intensidadeOperacoes: 1.35,
    sessao: "corrida",
  }).bonus;
  assert.ok(
    Math.abs(bIntensa - bBase * 1.35) < 1e-9,
    `Esperado ~${bBase * 1.35}, obtido ${bIntensa}`,
  );

  // Fator SC só escala na corrida (na qualificacao, possuiSafetyCar: true não altera o resultado)
  const bQualySemSC = calcularBonusOperacoes({
    zOperacoes: 1.0,
    sessao: "qualificacao",
    possuiSafetyCar: false,
  }).bonus;
  const bQualyComSC = calcularBonusOperacoes({
    zOperacoes: 1.0,
    sessao: "qualificacao",
    possuiSafetyCar: true,
  }).bonus;
  assert.equal(bQualySemSC, bQualyComSC);

  const bCorridaSemSC = calcularBonusOperacoes({
    zOperacoes: 1.0,
    sessao: "corrida",
    possuiSafetyCar: false,
  }).bonus;
  const bCorridaComSC = calcularBonusOperacoes({
    zOperacoes: 1.0,
    sessao: "corrida",
    possuiSafetyCar: true,
  }).bonus;
  assert.ok(bCorridaComSC > bCorridaSemSC);
  assert.ok(
    Math.abs(bCorridaComSC - bCorridaSemSC * (1 + CONFIG_OPS.BONUS_SC)) < 1e-9,
  );

  // Fator chuva escala em ambas as sessões
  const bQualySeco = calcularBonusOperacoes({
    zOperacoes: 1.0,
    sessao: "qualificacao",
    intensidadeChuva: 0,
  }).bonus;
  const bQualyChuva = calcularBonusOperacoes({
    zOperacoes: 1.0,
    sessao: "qualificacao",
    intensidadeChuva: 0.5,
  }).bonus;
  assert.ok(bQualyChuva > bQualySeco);
  assert.ok(
    Math.abs(
      bQualyChuva - bQualySeco * (1 + CONFIG_OPS.BONUS_CHUVA * 0.5),
    ) < 1e-9,
  );

  const bCorridaSeco = calcularBonusOperacoes({
    zOperacoes: 1.0,
    sessao: "corrida",
    intensidadeChuva: 0,
  }).bonus;
  const bCorridaChuva = calcularBonusOperacoes({
    zOperacoes: 1.0,
    sessao: "corrida",
    intensidadeChuva: 0.5,
  }).bonus;
  assert.ok(bCorridaChuva > bCorridaSeco);

  // Fator qualy reduz o bônus na proporção configurada (FATOR_QUALI = 0.3)
  assert.ok(
    Math.abs(bQualySeco - bCorridaSeco * CONFIG_OPS.FATOR_QUALI) < 1e-9,
  );

  // Clamp no LIMITE_BONUS (±0.35)
  assert.equal(
    calcularBonusOperacoes({
      zOperacoes: 100,
      intensidadeOperacoes: 2.0,
      sessao: "corrida",
      possuiSafetyCar: true,
      intensidadeChuva: 1.0,
    }).bonus,
    CONFIG_OPS.LIMITE_BONUS,
  );
  assert.equal(
    calcularBonusOperacoes({
      zOperacoes: -100,
      intensidadeOperacoes: 2.0,
      sessao: "corrida",
      possuiSafetyCar: true,
      intensidadeChuva: 1.0,
    }).bonus,
    -CONFIG_OPS.LIMITE_BONUS,
  );

  // Inputs inválidos lançam erro
  assert.throws(() =>
    calcularBonusOperacoes({ zOperacoes: 1.0, intensidadeOperacoes: 0 }),
  );
  assert.throws(() =>
    calcularBonusOperacoes({ zOperacoes: 1.0, intensidadeOperacoes: -1 }),
  );
  assert.throws(() =>
    calcularBonusOperacoes({ zOperacoes: 1.0, intensidadeChuva: -0.1 }),
  );
  assert.throws(() =>
    calcularBonusOperacoes({ zOperacoes: 1.0, sessao: "invalida" }),
  );
});

test("2. Score de equipe sem Operações quando ativo e preservado quando inativo", () => {
  const pesosCorrida = pesos[0].pesos.corrida.equipe;

  const equipeA = {
    aero_carga: 85,
    aero_eficiencia: 85,
    chassi: 85,
    tracao: 85,
    potencia: 85,
    gestao_pneus: 85,
    operacoes: 95,
  };
  const equipeB = {
    aero_carga: 85,
    aero_eficiencia: 85,
    chassi: 85,
    tracao: 85,
    potencia: 85,
    gestao_pneus: 85,
    operacoes: 65,
  };

  // Com bônus ativo:
  const pesosAtivos = pesosEquipeParaScore(pesosCorrida, {
    ATIVAR_BONUS_OPERACOES: true,
  });
  assert.equal(pesosAtivos.Operacoes, undefined);
  assert.equal(Object.keys(pesosAtivos).length, 6);

  const somaPesosAtivos = Object.values(pesosAtivos).reduce((s, p) => s + p, 0);
  assert.ok(
    Math.abs(somaPesosAtivos - 1.0) < 1e-9,
    `Pesos devem somar 1.0, soma=${somaPesosAtivos}`,
  );

  const scoreAAtivo = calcularScore(
    equipeA,
    pesosAtivos,
    atributosEquipe,
  );
  const scoreBAtivo = calcularScore(
    equipeB,
    pesosAtivos,
    atributosEquipe,
  );
  assert.ok(
    Math.abs(scoreAAtivo - scoreBAtivo) < 1e-9,
    "Equipes com carros idênticos devem ter mesmo score bruto quando operações é separada",
  );

  // Com bônus inativo:
  const pesosInativos = pesosEquipeParaScore(pesosCorrida, {
    ATIVAR_BONUS_OPERACOES: false,
  });
  assert.ok(pesosInativos.Operacoes !== undefined);
  assert.equal(Object.keys(pesosInativos).length, 7);

  const scoreAInativo = calcularScore(
    equipeA,
    pesosInativos,
    atributosEquipe,
  );
  const scoreBInativo = calcularScore(
    equipeB,
    pesosInativos,
    atributosEquipe,
  );
  assert.ok(
    scoreAInativo > scoreBInativo,
    "Com bônus inativo, Operações afeta diretamente o score bruto",
  );
});

test("3. Soma do bônus no grid sem eventos é aproximadamente zero", () => {
  const zScores = calcularZScores(equipes.map((e) => e.operacoes));
  let somaBonus = 0;

  for (const z of zScores) {
    const res = calcularBonusOperacoes({
      zOperacoes: z,
      intensidadeOperacoes: 1.25,
      sessao: "corrida",
      possuiSafetyCar: false,
      intensidadeChuva: 0,
    });
    somaBonus += res.bonus;
  }

  assert.ok(
    Math.abs(somaBonus) < 1e-9,
    `Soma dos bônus no grid deve ser zero, obtido ${somaBonus}`,
  );
});

test("4. Gerador de pesos (descritoresParaPesos) gera intensidadeOperacoes válida", () => {
  for (const gp of pesos) {
    assert.ok(
      typeof gp.intensidadeOperacoes === "number",
      `GP ${gp.GP} deve ter intensidadeOperacoes`,
    );
    assert.ok(
      gp.intensidadeOperacoes >= 0.5 && gp.intensidadeOperacoes <= 1.5,
      `GP ${gp.GP} intensidadeOperacoes fora do range esperado: ${gp.intensidadeOperacoes}`,
    );
    // Pesos de equipe continuam somando 1.0 e com 7 atributos
    const somaCorrida = Object.values(gp.pesos.corrida.equipe).reduce(
      (s, p) => s + p,
      0,
    );
    assert.ok(Math.abs(somaCorrida - 1.0) < 1e-9);
    assert.equal(Object.keys(gp.pesos.corrida.equipe).length, 7);
  }

  // Fórmula respeitada e override manual funciona
  const readJson = require("../funcoes/readJson");
  const descritores = readJson("gerar-pesos/descritores.json");
  const baseDesc = descritores[0];

  const normalizadoAuto = normalizarDescritor({
    ...baseDesc,
    GP: "TesteAuto",
    operacoes: 0.75,
    intensidade_operacoes: undefined,
  });
  assert.equal(
    normalizadoAuto.intensidade_operacoes,
    0.5 + 1.0 * 0.75,
  );

  const normalizadoOverride = normalizarDescritor({
    ...baseDesc,
    GP: "TesteOverride",
    operacoes: 0.75,
    intensidade_operacoes: 1.42,
  });
  assert.equal(normalizadoOverride.intensidade_operacoes, 1.42);
});

test("5. Fallback gracioso com aviso quando intensidadeOperacoes estiver ausente", () => {
  const gpSemIntensidade = {
    ...pesos[0],
    intensidadeOperacoes: undefined,
  };

  const avisos = [];
  const warnOriginal = console.warn;
  console.warn = (...args) => avisos.push(args.join(" "));

  try {
    const grid = calcularGridDeLargada(
      gpSemIntensidade,
      pilotos,
      equipePorNome,
      0,
    );
    assert.ok(grid.length === pilotos.length);
    assert.ok(
      avisos.some((m) => m.includes("intensidadeOperacoes ausente")),
      "calcularGridDeLargada deve emitir aviso quando intensidadeOperacoes estiver ausente",
    );

    avisos.length = 0;
    const chegada = calcularOrdemDeChegada(
      grid,
      gpSemIntensidade.pesos.corrida,
      0,
      0.2,
      50,
      {},
    );
    assert.ok(chegada.length === pilotos.length);
    assert.ok(
      avisos.some((m) => m.includes("intensidadeOperacoes ausente")),
      "calcularOrdemDeChegada deve emitir aviso quando intensidadeOperacoes estiver ausente",
    );
  } finally {
    console.warn = warnOriginal;
  }
});

test("6. Corrida com SC produz bônus de magnitude maior do que corrida idêntica sem SC", () => {
  const zPositivo = 1.2;
  const zNegativo = -1.2;

  const bonusPosSemSC = calcularBonusOperacoes({
    zOperacoes: zPositivo,
    sessao: "corrida",
    possuiSafetyCar: false,
  }).bonus;
  const bonusPosComSC = calcularBonusOperacoes({
    zOperacoes: zPositivo,
    sessao: "corrida",
    possuiSafetyCar: true,
  }).bonus;

  const bonusNegSemSC = calcularBonusOperacoes({
    zOperacoes: zNegativo,
    sessao: "corrida",
    possuiSafetyCar: false,
  }).bonus;
  const bonusNegComSC = calcularBonusOperacoes({
    zOperacoes: zNegativo,
    sessao: "corrida",
    possuiSafetyCar: true,
  }).bonus;

  assert.ok(
    bonusPosComSC > bonusPosSemSC,
    "Bônus positivo deve ser maior com SC",
  );
  assert.ok(
    bonusNegComSC < bonusNegSemSC,
    "Penalidade negativa deve ser mais severa com SC",
  );
  assert.ok(
    Math.abs(bonusPosComSC) > Math.abs(bonusPosSemSC),
    "Magnitude deve ser estritamente maior com SC",
  );
  assert.ok(
    Math.abs(bonusNegComSC) > Math.abs(bonusNegSemSC),
    "Magnitude deve ser estritamente maior com SC",
  );
});

test("7. Em Mônaco, equipe com maior Operações (Mercedes) ganha posições médias com bônus ON vs OFF", () => {
  const gpMonaco = pesos.find((p) => p.GP === "Monaco");
  assert.ok(gpMonaco, "Monaco deve existir em pesos.json");

  const SIMULACOES = 1500;
  let somaPosicaoMercedesON = 0;
  let somaPosicaoMercedesOFF = 0;
  let totalPilotosMercedes = 0;

  for (let i = 0; i < SIMULACOES; i++) {
    // Modo ON
    const gridON = calcularGridDeLargada(
      gpMonaco,
      pilotos,
      equipePorNome,
      0,
      { ATIVAR_BONUS_OPERACOES: true },
    );
    const ordemON = calcularOrdemDeChegada(
      gridON,
      gpMonaco.pesos.corrida,
      0,
      gpMonaco.multiplicadorSeveridadeFalha,
      gpMonaco.voltas,
      {
        intensidadeOperacoes: gpMonaco.intensidadeOperacoes,
        configOperacoes: { ATIVAR_BONUS_OPERACOES: true },
      },
    );

    // Modo OFF
    const gridOFF = calcularGridDeLargada(
      gpMonaco,
      pilotos,
      equipePorNome,
      0,
      { ATIVAR_BONUS_OPERACOES: false },
    );
    const ordemOFF = calcularOrdemDeChegada(
      gridOFF,
      gpMonaco.pesos.corrida,
      0,
      gpMonaco.multiplicadorSeveridadeFalha,
      gpMonaco.voltas,
      {
        intensidadeOperacoes: gpMonaco.intensidadeOperacoes,
        configOperacoes: { ATIVAR_BONUS_OPERACOES: false },
      },
    );

    ordemON.forEach((r, idx) => {
      if (r.equipe === "Mercedes") {
        somaPosicaoMercedesON += idx + 1;
        totalPilotosMercedes++;
      }
    });
    ordemOFF.forEach((r, idx) => {
      if (r.equipe === "Mercedes") somaPosicaoMercedesOFF += idx + 1;
    });
  }

  const mediaMercedesON = somaPosicaoMercedesON / totalPilotosMercedes;
  const mediaMercedesOFF = somaPosicaoMercedesOFF / totalPilotosMercedes;

  // Com bônus ativo, média de chegada da Mercedes deve ser menor (melhor posição)
  assert.ok(
    mediaMercedesON < mediaMercedesOFF,
    `Mercedes média ON (${mediaMercedesON.toFixed(2)}) deve ser melhor que OFF (${mediaMercedesOFF.toFixed(2)}) em Mônaco`,
  );
});
