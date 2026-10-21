const test = require("node:test");
const assert = require("node:assert/strict");

const configuracoes = require("../pesos.json");
const aplicarEfeitosChuva = require("../funcoes/aplicarEfeitosChuva");
const calcularFalha = require("../funcoes/calcularFalha");
const calcularScoreQualificacao = require("../funcoes/calcularScoreQualificacao");
const calcularScoreCorrida = require("../funcoes/calcularScoreCorrida");
const compararResultadosCorrida = require("../funcoes/compararResultadosCorrida");
const calcularPenalidadeScoreFalhas = require("../funcoes/calcularPenalidadeScoreFalhas");
const CONFIG_FALHAS = require("../funcoes/configFalhas");
const determinarDNF = require("../funcoes/determinarDNF");
const { sortearChuva, sortearClima } = require("../funcoes/sortearClima");
const { probFalhaMecEquipe } = require("../descritoresParaPesos");

const clonar = (valor) => JSON.parse(JSON.stringify(valor));
const soma = (valores) =>
  Object.values(valores).reduce((total, valor) => total + valor, 0);

test("cada pista define uma quantidade válida de voltas", () => {
  for (const configuracao of configuracoes) {
    assert.ok(Number.isInteger(configuracao.voltas));
    assert.ok(configuracao.voltas > 0);
  }
});

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

const comValoresAleatorios = (valores, executar) => {
  const randomOriginal = Math.random;
  const fila = [...valores];
  Math.random = () => (fila.length > 0 ? fila.shift() : 0.5);
  try {
    return executar();
  } finally {
    Math.random = randomOriginal;
  }
};

const comPesosReferenciaFalha = (pesoQualificacao, pesoCorrida, executar) => {
  const pesoQualificacaoOriginal = CONFIG_FALHAS.pesoReferenciaQualificacao;
  const pesoCorridaOriginal = CONFIG_FALHAS.pesoReferenciaCorrida;
  CONFIG_FALHAS.pesoReferenciaQualificacao = pesoQualificacao;
  CONFIG_FALHAS.pesoReferenciaCorrida = pesoCorrida;
  try {
    return executar();
  } finally {
    CONFIG_FALHAS.pesoReferenciaQualificacao = pesoQualificacaoOriginal;
    CONFIG_FALHAS.pesoReferenciaCorrida = pesoCorridaOriginal;
  }
};

test("pesos permanecem normalizados e não negativos em todas as pistas", () => {
  for (const configuracao of configuracoes) {
    for (const sessao of ["qualificacao", "corrida"]) {
      for (const pc of [0, 0.3, 0.6, 1]) {
        const pesosOriginais = configuracao.pesos[sessao];
        const ajustados = aplicarEfeitosChuva(
          pesosOriginais,
          sessao === "qualificacao",
          pc,
        );
        const somaGeral =
          sessao === "qualificacao"
            ? ajustados.pesosGerais.WPiloto + ajustados.pesosGerais.WEquipe
            : ajustados.pesosGerais.WPosInicial +
              ajustados.pesosGerais.WPiloto +
              ajustados.pesosGerais.WEquipe;

        assert.ok(
          Object.values(ajustados.piloto).every((peso) => peso >= 0),
          `${configuracao.GP}/${sessao}/pc=${pc}: peso de piloto negativo`,
        );
        assert.ok(
          Object.values(ajustados.equipe).every((peso) => peso >= 0),
          `${configuracao.GP}/${sessao}/pc=${pc}: peso de equipe negativo`,
        );
        assert.ok(Math.abs(soma(ajustados.piloto) - 1) < 1e-12);
        assert.ok(Math.abs(soma(ajustados.equipe) - 1) < 1e-12);
        assert.ok(Math.abs(somaGeral - 1) <= 0.001);
      }
    }
  }
});

test("pc zero preserva exatamente os valores e devolve cópias", () => {
  for (const configuracao of configuracoes) {
    for (const sessao of ["qualificacao", "corrida"]) {
      const pesos = configuracao.pesos[sessao];
      const ajustados = aplicarEfeitosChuva(
        pesos,
        sessao === "qualificacao",
        0,
      );

      assert.deepStrictEqual(ajustados, pesos);
      assert.notStrictEqual(ajustados, pesos);
      assert.notStrictEqual(ajustados.pesosGerais, pesos.pesosGerais);
      assert.notStrictEqual(ajustados.piloto, pesos.piloto);
      assert.notStrictEqual(ajustados.equipe, pesos.equipe);
      assert.notStrictEqual(ajustados.falhas, pesos.falhas);
    }
  }
});

test("aplicarEfeitosChuva não altera os pesos de entrada", () => {
  for (const configuracao of configuracoes) {
    for (const sessao of ["qualificacao", "corrida"]) {
      const pesos = configuracao.pesos[sessao];
      const copiaAntes = clonar(pesos);
      aplicarEfeitosChuva(pesos, sessao === "qualificacao", 0.6);
      assert.deepStrictEqual(pesos, copiaAntes);
    }
  }
});

test("Suzuka na chuva produz os pesos de referência", () => {
  const pesosSecos = configuracoes.find(
    (configuracao) => configuracao.GP === "Suzuka",
  ).pesos.corrida;
  const pesos = aplicarEfeitosChuva(pesosSecos, false, 1);

  assert.ok(Math.abs(pesos.pesosGerais.WPosInicial - 0.525) <= 0.005);
  assert.ok(Math.abs(pesos.pesosGerais.WPiloto - 0.339) <= 0.005);
  assert.ok(Math.abs(pesos.pesosGerais.WEquipe - 0.136) <= 0.005);
  assert.equal(pesos.piloto.Consistencia, undefined);
  for (const [atributo, esperado] of Object.entries({
    VelocidadeCorrida: 0.421,
    Racecraft: 0.095,
    Gerenciamento: 0.087,
    Adaptabilidade: 0.239,
    Fisico: 0.158,
  })) {
    assert.ok(Math.abs(pesos.piloto[atributo] - esperado) <= 0.01);
  }
  for (const [atributo, esperado] of Object.entries({
    AeroCarga: 0.221,
    AeroEficiencia: 0.131,
    Chassi: 0.221,
    Tracao: 0.119,
    Potencia: 0,
    Operacoes: 0.156,
    GestaoPneus: 0.153,
  })) {
    assert.ok(Math.abs(pesos.equipe[atributo] - esperado) <= 0.005);
  }
  assert.ok(Math.abs(soma(pesos.equipe) - 1) < 1e-12);
});

test("Monaco mantém pesos de equipe normalizados com potência zerada", () => {
  const pesosSecos = configuracoes.find(
    (configuracao) => configuracao.GP === "Monaco",
  ).pesos.corrida;
  const pesos = aplicarEfeitosChuva(pesosSecos, false, 1);

  assert.equal(pesos.equipe.Potencia, 0);
  assert.ok(Math.abs(soma(pesos.equipe) - 1) < 1e-12);
});

test("chuva amplifica RNG e probabilidades de falha conforme a sessão", () => {
  const pesosSecos = configuracoes.find(
    (configuracao) => configuracao.GP === "Suzuka",
  ).pesos;
  const qualy = aplicarEfeitosChuva(pesosSecos.qualificacao, true, 1);
  const corrida = aplicarEfeitosChuva(pesosSecos.corrida, false, 1);

  assert.equal(
    qualy.pesosGerais.RngPiloto,
    pesosSecos.qualificacao.pesosGerais.RngPiloto * 1.4,
  );
  assert.equal(
    corrida.pesosGerais.RngOperacoes,
    pesosSecos.corrida.pesosGerais.RngOperacoes * 1.75,
  );
  assert.equal(
    corrida.pesosGerais.RngLargada,
    pesosSecos.corrida.pesosGerais.RngLargada * 2,
  );
  assert.equal(
    qualy.falhas.ProbFalhaHumanaBase,
    pesosSecos.qualificacao.falhas.ProbFalhaHumanaBase * 1.4,
  );
  assert.equal(
    corrida.falhas.ProbFalhaHumanaBase,
    pesosSecos.corrida.falhas.ProbFalhaHumanaBase * 1.2,
  );
  assert.equal(
    corrida.falhas.ProbFalhaMecanicaBase,
    pesosSecos.corrida.falhas.ProbFalhaMecanicaBase * 1.1,
  );
  assert.equal(
    corrida.falhas.FracaoDNFHumana,
    pesosSecos.corrida.falhas.FracaoDNFHumana * 1.3,
  );
});

test("ajustes de chuva conservam normalizados os sete pesos de equipe", () => {
  for (const configuracao of configuracoes) {
    for (const isQualy of [true, false]) {
      for (const pc of [0, 0.25, 0.5, 0.75, 1]) {
        const sessao = isQualy ? "qualificacao" : "corrida";
        const ajustados = aplicarEfeitosChuva(
          configuracao.pesos[sessao],
          isQualy,
          pc,
        );
        assert.ok(Object.values(ajustados.equipe).every((peso) => peso >= 0));
        assert.ok(Math.abs(soma(ajustados.equipe) - 1) < 1e-12);
        if (isQualy) assert.equal(ajustados.equipe.GestaoPneus, 0);
      }
    }
  }
});

test("calcularFalha separa ocorrência, DNF e penalidade z moderada", () => {
  const falhas = {
    ProbFalhaMecanicaBase: 10,
    FracaoDNFMecanica: 1,
    PenalidadeZMin: 2,
    PenalidadeZMax: 5,
  };
  const dnf = comValoresAleatorios([0.1, 0.75], () =>
    calcularFalha(falhas, "Mecanica", 0, "teste de falha", 80),
  );

  assert.deepStrictEqual(dnf, {
    ocorreu: true,
    dnf: true,
    voltaAbandono: null,
    probabilidade: 0.18,
    penalidade: 0,
  });

  const moderada = comValoresAleatorios([0.1, 0.9, 0.5], () =>
    calcularFalha(
      { ...falhas, FracaoDNFMecanica: 0 },
      "Mecanica",
      0,
      "teste de falha",
      80,
    ),
  );
  assert.equal(moderada.dnf, false);
  assert.equal(moderada.voltaAbandono, null);
  assert.equal(moderada.penalidade, 3.5);

  const primeiraVolta = comValoresAleatorios([0.1, 0], () =>
    calcularFalha(falhas, "Mecanica", 0, "teste de primeira volta", 53),
  );
  assert.equal(primeiraVolta.voltaAbandono, null);

  const ultimaVolta = comValoresAleatorios([0.1, 0], () =>
    calcularFalha(falhas, "Mecanica", 0, "teste de última volta", 53),
  );
  assert.equal(ultimaVolta.voltaAbandono, null);
  assert.throws(
    () => calcularFalha(falhas, "Mecanica", 0, "teste de voltas inválidas", 0),
    /quantidade de voltas inválida/i,
  );
});

test("apenas a falha mecânica usa a curva de durabilidade sigmoide", () => {
  const falhas = {
    ProbFalhaMecanicaBase: 1,
    FracaoDNFMecanica: 0,
    ProbFalhaHumanaBase: 1,
    FracaoDNFHumana: 0,
    PenalidadeZMin: 2,
    PenalidadeZMax: 5,
  };
  const mecanica = comValoresAleatorios([0.99], () =>
    calcularFalha(falhas, "Mecanica", 94, "teste mecânico sigmoide", 80),
  );
  const humana = comValoresAleatorios([0.99], () =>
    calcularFalha(falhas, "Humana", 94, "teste humano linear", 80),
  );

  assert.equal(mecanica.probabilidade, probFalhaMecEquipe(94));
  assert.equal(humana.probabilidade, 0.06);
});

test("probabilidade de falha é limitada a um e configuração inválida falha explicitamente", () => {
  const sempreFalha = comValoresAleatorios([0, 0.9, 0], () =>
    calcularFalha(
      {
        ProbFalhaHumanaBase: 2,
        FracaoDNFHumana: 0,
        PenalidadeZMin: 2,
        PenalidadeZMax: 5,
      },
      "Humana",
      0,
      "teste de falha humana",
      80,
    ),
  );
  assert.equal(sempreFalha.probabilidade, 1);
  assert.equal(sempreFalha.ocorreu, true);
  assert.throws(
    () =>
      calcularFalha(
        {
          ProbFalhaHumanaBase: 1,
          FracaoDNFHumana: 1.1,
          PenalidadeZMin: 2,
          PenalidadeZMax: 5,
        },
        "Humana",
        50,
        "teste de configuração inválida",
        80,
      ),
    /configuração de falhas inválida/i,
  );
});

test("DNF duplo mantém a primeira causa sem sortear volta na fase de status", () => {
  assert.deepStrictEqual(
    determinarDNF(
      { dnf: true, voltaAbandono: 0.7 },
      { dnf: true, voltaAbandono: 0.2 },
    ),
    {
      ocorreu: true,
      causa: "falhaDurabilidade",
      voltaAbandono: null,
    },
  );
});

test("penalidade moderada é independente dos pesos e usa referência e severidade", () => {
  const mecanica = { penalidade: 3, dnf: false };
  const humana = { penalidade: 4, dnf: false };
  const penalidade = calcularPenalidadeScoreFalhas(
    mecanica,
    humana,
    1.2,
    false,
    0.25,
  );
  assert.equal(penalidade, (3 + 4) * 0.25 * 1.2);
  assert.equal(
    calcularPenalidadeScoreFalhas(mecanica, humana, 1, false, 0.25),
    1.75,
  );
  assert.equal(
    calcularPenalidadeScoreFalhas(mecanica, humana, 1.2, true, 0.25),
    0,
  );
});

test("cada sessão aplica seu próprio peso de referência de falha", () => {
  comPesosReferenciaFalha(0.15, 0.35, () => {
    const falha = { penalidade: 3.5 };
    assert.equal(
      calcularPenalidadeScoreFalhas(
        falha,
        falha,
        1.2,
        false,
        CONFIG_FALHAS.pesoReferenciaQualificacao,
      ),
      7 * 0.15 * 1.2,
    );
    assert.equal(
      calcularPenalidadeScoreFalhas(
        falha,
        falha,
        1.2,
        false,
        CONFIG_FALHAS.pesoReferenciaCorrida,
      ),
      7 * 0.35 * 1.2,
    );
  });
});

test("score de qualificação desconta a falha depois dos pesos gerais", () => {
  const pesosQualificacao = {
    pesosGerais: {
      WPiloto: 0.8,
      WEquipe: 0.2,
      RngPiloto: 0,
      RngCarro: 0,
      RngOperacoes: 0,
    },
    falhas: {
      ProbFalhaMecanicaBase: 1,
      ProbFalhaHumanaBase: 1,
      FracaoDNFMecanica: 0,
      FracaoDNFHumana: 0,
      PenalidadeZMin: 2,
      PenalidadeZMax: 5,
    },
    equipe: { Operacoes: 0.2 },
  };
  const score = comPesosReferenciaFalha(0.15, 0.35, () =>
    comValoresAleatorios(
      [0.1, 0.9, 0.5, 0.1, 0.9, 0.5],
      () =>
        calcularScoreQualificacao(
          { consistencia: 0 },
          { durabilidade: 0, operacoes: 50 },
          0,
          0,
          1,
          2,
          pesosQualificacao,
          1.2,
          80,
        ),
    ),
  );

  assert.equal(score.scorePiloto, 1);
  assert.equal(score.scoreEquipe, 2);
  assert.equal(
    score.penalidadeFalhas,
    (3.5 + 3.5) * 0.15 * 1.2,
  );
  assert.equal(
    score.scoreTotal,
    score.contribuicaoPiloto +
      score.contribuicaoEquipe +
      score.fatorRNG.valor -
      score.penalidadeFalhas,
  );
});

test("score de corrida aplica severidade fixa fora dos pesos dos componentes", () => {
  const pesosCorrida = {
    pesosGerais: {
      WPosInicial: 0.5,
      WPiloto: 0.1,
      WEquipe: 0.4,
      RngPiloto: 0,
      RngCarro: 0,
      RngOperacoes: 0,
      RngLargada: 0,
    },
    falhas: {
      ProbFalhaMecanicaBase: 1,
      ProbFalhaHumanaBase: 1,
      FracaoDNFMecanica: 0,
      FracaoDNFHumana: 0,
      PenalidadeZMin: 2,
      PenalidadeZMax: 5,
    },
    equipe: { Operacoes: 0.2 },
  };
  const score = comPesosReferenciaFalha(0.15, 0.35, () =>
    comValoresAleatorios(
      [0.1, 0.9, 0.5, 0.1, 0.9, 0.5],
      () =>
        calcularScoreCorrida(
          { consistencia: 0, velocidade_corrida: 50 },
          { durabilidade: 0, operacoes: 50 },
          0.5,
          0,
          0,
          1,
          2,
          pesosCorrida,
          1.2,
          80,
        ),
    ),
  );

  assert.equal(score.scorePiloto, 1);
  assert.equal(score.scoreEquipe, 2);
  assert.equal(
    score.penalidadeFalhas,
    (3.5 + 3.5) * 0.35 * 1.2,
  );
  assert.equal(
    score.scoreTotal,
    score.scoreAntesRNG + score.fatorRNG.valor - score.penalidadeFalhas,
  );
});

test("abandono não recebe penalidade de score e ordena após finalizados", () => {
  const pesosCorrida = {
    pesosGerais: {
      WPosInicial: 0.5,
      WPiloto: 0.25,
      WEquipe: 0.25,
      RngPiloto: 0,
      RngCarro: 0,
      RngOperacoes: 0,
      RngLargada: 0,
    },
    falhas: {
      ProbFalhaMecanicaBase: 1,
      ProbFalhaHumanaBase: 1,
      FracaoDNFMecanica: 1,
      FracaoDNFHumana: 0,
      PenalidadeZMin: 2,
      PenalidadeZMax: 5,
    },
    equipe: { Operacoes: 0.2 },
  };
  const abandonado = comValoresAleatorios(
    [0.1, 0.1, 0.2, 0.1, 0.9, 0.5],
    () =>
      calcularScoreCorrida(
        { consistencia: 0, velocidade_corrida: 50 },
        { durabilidade: 0, operacoes: 50 },
        0,
        0,
        0,
        1,
        2,
        pesosCorrida,
        1,
        80,
      ),
  );

  assert.equal(abandonado.dnf.ocorreu, true);
  assert.equal(abandonado.dnf.voltaAbandono, null);
  assert.equal(abandonado.scoreEquipe, 2);
  assert.equal(abandonado.scorePiloto, 1);
  assert.equal(abandonado.penalidadeFalhas, 0);

  const finalizado = { dnf: { ocorreu: false }, scoreTotal: -100 };
  const abandonoTardio = {
    dnf: { ocorreu: true, voltaAbandono: 64 },
    posicaoLargada: 10,
  };
  const abandonoCedo = {
    dnf: { ocorreu: true, voltaAbandono: 16 },
    posicaoLargada: 1,
  };
  assert.ok(compararResultadosCorrida(finalizado, abandonoTardio) < 0);
  assert.ok(compararResultadosCorrida(abandonoTardio, abandonoCedo) < 0);
});

test("sorteio mantém as marginais e a correlação previstas em 20.000 amostras", () => {
  const pctChuva = 0.41;
  const quantidade = 20000;
  const estatisticas = comSemente(123456789, () => {
    let qualyMolhada = 0;
    let corridaMolhada = 0;
    let ambasMolhadas = 0;

    for (let indice = 0; indice < quantidade; indice++) {
      const clima = sortearClima(pctChuva);
      for (const pc of [clima.pcQualy, clima.pcCorrida]) {
        assert.ok(Number.isFinite(pc));
        assert.ok(pc === 0 || (pc >= 0.1 && pc <= 1));
      }
      const qMolhada = clima.pcQualy > 0;
      const cMolhada = clima.pcCorrida > 0;
      qualyMolhada += Number(qMolhada);
      corridaMolhada += Number(cMolhada);
      ambasMolhadas += Number(qMolhada && cMolhada);
    }

    return { qualyMolhada, corridaMolhada, ambasMolhadas };
  });
  const percentual = (quantidadeMolhada) =>
    (quantidadeMolhada / quantidade) * 100;

  assert.ok(Math.abs(percentual(estatisticas.qualyMolhada) - 41) <= 1);
  assert.ok(Math.abs(percentual(estatisticas.corridaMolhada) - 41) <= 1);
  assert.ok(
    Math.abs(
      (estatisticas.ambasMolhadas / estatisticas.qualyMolhada) * 100 - 75,
    ) <= 1,
  );
});

test("sorteio respeita os limites seco e sempre molhado", () => {
  assert.deepStrictEqual(sortearClima(0), { pcQualy: 0, pcCorrida: 0 });
  comSemente(987654321, () => {
    for (let indice = 0; indice < 1000; indice++) {
      const clima = sortearClima(1);
      assert.ok(clima.pcQualy >= 0.1 && clima.pcQualy <= 1);
      assert.ok(clima.pcCorrida >= 0.1 && clima.pcCorrida <= 1);
      assert.ok(Number.isFinite(clima.pcQualy));
      assert.ok(Number.isFinite(clima.pcCorrida));
      assert.ok(Number.isFinite(sortearChuva(1)));
    }
  });
});

test("sorteio rejeita probabilidade inválida", () => {
  for (const pctChuva of [-0.1, 1.1, Number.NaN, Infinity]) {
    assert.throws(() => sortearClima(pctChuva), /entre 0 e 1/);
    assert.throws(() => sortearChuva(pctChuva), /entre 0 e 1/);
  }
});
