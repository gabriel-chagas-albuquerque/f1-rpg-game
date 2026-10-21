const test = require("node:test");
const assert = require("node:assert/strict");

const CONFIG_PE = require("../config/pe.config");
const {
  aplicarRetornosDecrescentes,
  calcularPE,
  custoSubirAtributo,
  gastarPE,
  normalizar,
  obterExpectativa,
} = require("../funcoes/sistemaPE");

const expectativas = {
  Monaco: {
    seco: {
      EQ: { Williams: 10 },
      EC: { Williams: 10 },
      modeloCorrida: { a: 0, b: 0, c: 1 },
    },
    chuva: {
      EQ: { Williams: 10 },
      EC: { Williams: 10 },
      modeloCorrida: { a: 0, b: 0, c: 1 },
    },
  },
};
const entradaBase = {
  pista: "Monaco",
  clima: "seco",
  safetyCar: false,
  piloto: {
    piloto: "Piloto Jogador",
    equipe: "Williams",
    pilotoJogador: true,
  },
  qualificacao: { posicao: 10 },
  corrida: {
    posicaoLargada: 10,
    posicaoFinal: 10,
    pontos: 1,
    dnf: null,
    falhaHumanaModerada: false,
    falhaMecanicaModerada: false,
  },
};

test("normalizar preserva sinal, limites, alcance mínimo e posição esperada", () => {
  assert.equal(normalizar(0, 1), 0);
  assert.ok(normalizar(1, 10) > 0);
  assert.equal(normalizar(-1, 11.5), -normalizar(1, 11.5));
  assert.equal(normalizar(100, 2), 1);
  assert.equal(normalizar(-100, 21), -1);
  assert.equal(
    normalizar(0.1, 1),
    (0.1 / CONFIG_PE.ALCANCE_MINIMO) ** CONFIG_PE.EXPOENTE,
  );
  assert.ok(
    Math.abs(normalizar(-1, 1) + (1 / (CONFIG_PE.N_PILOTOS - 1)) ** 0.7) <
      1e-10,
  );
});

test("retornos decrescentes mantêm sinal e expoente", () => {
  assert.equal(aplicarRetornosDecrescentes(0), 0);
  assert.equal(
    aplicarRetornosDecrescentes(-0.25),
    -(0.25 ** CONFIG_PE.EXPOENTE),
  );
});

test("obterExpectativa seleciona equipe e clima e rejeita dados ausentes", () => {
  assert.equal(obterExpectativa(expectativas, "Monaco", "chuva", "Williams").EQ, 10);
  assert.throws(
    () => obterExpectativa(expectativas, "Monaco", "chuva", "Mercedes"),
    /Expectativa incompleta/,
  );
});

test("calcularPE aplica a base, retorno relativo e o teto", () => {
  const resultado = calcularPE(entradaBase, expectativas);
  assert.equal(resultado.pe, CONFIG_PE.PE_BASE);
  assert.equal(resultado.componentes.Q, 0);
  assert.equal(resultado.componentes.R, 0);
  assert.ok(resultado.log.length >= 4);
  assert.ok(resultado.pe >= 0 && resultado.pe <= CONFIG_PE.PE_MAX_FIM_DE_SEMANA);
  const melhorResultado = calcularPE(
    {
      ...entradaBase,
      qualificacao: { posicao: 8 },
      corrida: { ...entradaBase.corrida, posicaoFinal: 8 },
    },
    expectativas,
  );
  assert.ok(melhorResultado.pe > resultado.pe);

  const expectativasChuva = {
    ...expectativas,
    Monaco: {
      ...expectativas.Monaco,
      chuva: {
        EQ: { Williams: 12 },
        EC: { Williams: 9 },
        modeloCorrida: { a: 1, b: 0, c: 0 },
      },
    },
  };
  const resultadoChuva = calcularPE(
    { ...entradaBase, clima: "chuva" },
    expectativasChuva,
  );
  assert.notEqual(resultadoChuva.pe, resultado.pe);
  assert.ok(resultadoChuva.log[0].includes("(chuva)"));
});

test("DNF, falhas moderadas e safety car seguem as proteções", () => {
  const dnfMecanico = calcularPE(
    {
      ...entradaBase,
      corrida: { ...entradaBase.corrida, dnf: "mecanico", posicaoFinal: 20 },
    },
    expectativas,
  );
  assert.equal(dnfMecanico.componentes.R, 0);
  assert.equal(dnfMecanico.componentes.CF, 0);

  const dnfHumano = calcularPE(
    {
      ...entradaBase,
      corrida: { ...entradaBase.corrida, dnf: "humano", posicaoFinal: 20 },
    },
    expectativas,
  );
  assert.equal(dnfHumano.componentes.R, 0);
  assert.equal(dnfHumano.componentes.CF, -CONFIG_PE.PENAL_DNF_HUMANO);

  const falhaHumanaModerada = calcularPE(
    {
      ...entradaBase,
      corrida: {
        ...entradaBase.corrida,
        falhaHumanaModerada: true,
      },
    },
    expectativas,
  );
  assert.equal(
    falhaHumanaModerada.componentes.CF,
    -CONFIG_PE.PENAL_FALHA_HUMANA,
  );

  const falhaMecanica = calcularPE(
    {
      ...entradaBase,
      corrida: {
        ...entradaBase.corrida,
        posicaoFinal: 12,
        falhaMecanicaModerada: true,
      },
    },
    expectativas,
  );
  assert.equal(falhaMecanica.componentes.R, 0);

  const sc = calcularPE({ ...entradaBase, safetyCar: true }, expectativas);
  assert.equal(sc.protecoes.safetyCar, CONFIG_PE.FATOR_R_COM_SC);
  const resultadoSemSC = calcularPE(
    {
      ...entradaBase,
      corrida: { ...entradaBase.corrida, posicaoFinal: 8 },
    },
    expectativas,
  );
  const resultadoComSC = calcularPE(
    {
      ...entradaBase,
      safetyCar: true,
      corrida: { ...entradaBase.corrida, posicaoFinal: 8 },
    },
    expectativas,
  );
  assert.equal(
    resultadoComSC.componentes.R,
    resultadoSemSC.componentes.R * CONFIG_PE.FATOR_R_COM_SC,
  );
});

test("PE só é calculado para pilotoJogador", () => {
  assert.throws(
    () =>
      calcularPE(
        {
          ...entradaBase,
          piloto: { ...entradaBase.piloto, pilotoJogador: false },
        },
        expectativas,
      ),
    /não está marcado/,
  );
  assert.throws(
    () => calcularPE(entradaBase, expectativas, { config: { ATIVAR_PE: false } }),
    /sistema de PE está desativado/,
  );
});

test("custo crescente corresponde aos pontos de referência", () => {
  const custo = (nivel) => custoSubirAtributo(nivel, "Fisico");
  assert.ok(Math.abs(custo(70) - 8.8) < 0.1);
  assert.ok(Math.abs(custo(80) - 10.7) < 0.1);
  assert.ok(Math.abs(custo(90) - 12.8) < 0.1);
  assert.ok(custo(71) > custo(70));
});

test("gastarPE compra níveis sem mutar estado e recusa violações", () => {
  const estado = {
    pe: 30,
    atributos: { Fisico: 70 },
    gastoTemporada: { Fisico: 0 },
  };
  const resultado = gastarPE(estado, "Fisico", 1);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.estado.atributos.Fisico, 71);
  assert.equal(estado.atributos.Fisico, 70);

  assert.equal(gastarPE({ ...estado, pe: 1 }, "Fisico", 1).motivo, "pe_insuficiente");
  assert.equal(
    gastarPE(
      { ...estado, gastoTemporada: { Fisico: 29 } },
      "Fisico",
      1,
    ).motivo,
    "teto_atributo_temporada",
  );
  assert.equal(
    gastarPE(
      { ...estado, gastoTemporada: { Fisico: 29 } },
      "Fisico",
      1,
      { config: { ATIVAR_TETO_PE_POR_ATRIBUTO: false } },
    ).ok,
    true,
  );
  assert.equal(
    gastarPE(
      { ...estado, atributos: { Fisico: 99 } },
      "Fisico",
      1,
    ).motivo,
    "nivel_maximo",
  );
  assert.equal(
    gastarPE(estado, "Fisico", 1, { config: { ATIVAR_PE: false } }).motivo,
    "sistema_desativado",
  );
});

test("catch-up e teto de PE sazonal são configuráveis", () => {
  const input = {
    ...entradaBase,
    qualificacao: { posicao: 5 },
    corrida: { ...entradaBase.corrida, posicaoFinal: 5 },
  };
  const semCatchUp = calcularPE(input, expectativas);
  const comCatchUp = calcularPE(input, expectativas, {
    config: { ATIVAR_CATCH_UP: true },
    catchUp: { zRating: 2 },
  });
  const catchUpPositivo = calcularPE(input, expectativas, {
    config: { ATIVAR_CATCH_UP: true },
    catchUp: { zRating: -2 },
  });
  assert.ok(comCatchUp.pe < semCatchUp.pe);
  assert.ok(catchUpPositivo.pe > semCatchUp.pe);

  const cap = calcularPE(input, expectativas, { peGanhoNaTemporada: 119 });
  assert.ok(cap.pe <= 1);
});

test("cálculo é reprodutível para a mesma entrada", () => {
  assert.deepEqual(
    calcularPE(entradaBase, expectativas),
    calcularPE(entradaBase, expectativas),
  );
});
