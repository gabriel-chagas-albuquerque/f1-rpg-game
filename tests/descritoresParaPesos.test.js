const test = require("node:test");
const assert = require("node:assert/strict");

const descritores = require("../gerar-pesos/descritores.json");
const configuracoesExistentes = require("../pesos.json");
const configuracaoFalhaMecanica = require("../configuracaoFalhaMecanica.json");
const pilotos = require("../pilotos.json");
const equipes = require("../equipes.json");
const calcularProbabilidadeFalha = require("../funcoes/calcularProbabilidadeFalha");
const {
  CFG,
  ATRIBUTOS_EQUIPE,
  FATORES_QUALI_PADRAO,
  gerarPesos,
  gerarConfiguracoes,
  normalizarDescritor,
  probFalhaMecEquipe,
} = require("../descritoresParaPesos");

test("gera para cada descritor uma configuração compatível com pesos.json", () => {
  const geradas = gerarConfiguracoes(descritores, configuracoesExistentes);

  assert.equal(geradas.length, descritores.length);
  for (const configuracao of geradas) {
    const existente = configuracoesExistentes.find(
      (item) => item.GP === configuracao.GP,
    );
    const descritor = descritores.find(
      (item) => (item.GP ?? item.gp) === configuracao.GP,
    );
    assert.equal(configuracao.voltas, descritor.voltas);
    assert.equal(configuracao.pct_safety_car, existente?.pct_safety_car ?? 0.1);
    assert.equal(
      configuracao.pesos.corrida.pesosGerais.RngSafetyCar,
      existente?.pesos.corrida.pesosGerais.RngSafetyCar ?? 0.2,
    );
    assert.ok(Number.isFinite(configuracao.pesos.corrida.falhas.ProbFalhaHumanaBase));
    assert.ok(Number.isFinite(configuracao.pesos.qualificacao.pesosGerais.RngPiloto));

    for (const sessao of ["qualificacao", "corrida"]) {
      assert.deepStrictEqual(
        Object.keys(configuracao.pesos[sessao].equipe),
        ATRIBUTOS_EQUIPE,
      );
      assert.equal(configuracao.pesos[sessao].piloto.Consistencia, undefined);
      if (sessao === "qualificacao") {
        assert.equal(configuracao.pesos[sessao].equipe.GestaoPneus, 0);
      }
      assert.ok(
        Object.values(configuracao.pesos[sessao].equipe).every(
          (peso) => peso >= 0,
        ),
      );
      assert.ok(
        Math.abs(
          Object.values(configuracao.pesos[sessao].equipe).reduce(
            (total, peso) => total + peso,
            0,
          ) - 1,
        ) < 0.00051,
      );
      for (const categoria of ["piloto", "equipe"]) {
        const soma = Object.values(configuracao.pesos[sessao][categoria]).reduce(
          (total, peso) => total + peso,
          0,
        );
        assert.ok(
          Math.abs(soma - 1) <= 0.001,
          `${configuracao.GP}/${sessao}/${categoria} soma ${soma}`,
        );
      }
    }
  }
});

test("usa faixas de PenalidadeZ específicas da pista e metade na qualificação", () => {
  const faixasEsperadas = {
    Monaco: [0.5, 1.5],
    Singapura: [1, 2.5],
    Suzuka: [1.5, 3],
    Barcelona: [2, 4],
    Silvestone: [2, 4.5],
    "Spa-Francorchamps": [2.5, 5],
    Monza: [3, 6],
    Baku: [3, 6],
    LasVegas: [3, 6],
    Australia: [3, 6],
    Interlagos: [2.5, 5],
    Austria: [2, 5],
  };
  const geradas = gerarConfiguracoes(descritores, configuracoesExistentes);

  for (const [gp, [min, max]] of Object.entries(faixasEsperadas)) {
    const configuracao = geradas.find((item) => item.GP === gp);
    assert.ok(configuracao, `descritor ausente para ${gp}`);
    assert.equal(configuracao.pesos.corrida.falhas.PenalidadeZMin, min);
    assert.equal(configuracao.pesos.corrida.falhas.PenalidadeZMax, max);
    assert.equal(configuracao.pesos.qualificacao.falhas.PenalidadeZMin, min / 2);
    assert.equal(configuracao.pesos.qualificacao.falhas.PenalidadeZMax, max / 2);
  }
});

test("overrides de faixa de PenalidadeZ prevalecem sobre os valores por pista", () => {
  const monza = descritores.find((item) => item.GP === "Monza");
  const configuracaoCorridaCustomizada = gerarConfiguracoes(
    [{ ...monza, penalidade_z_corrida: [4, 8] }],
    configuracoesExistentes,
  )[0];

  assert.equal(configuracaoCorridaCustomizada.pesos.corrida.falhas.PenalidadeZMin, 4);
  assert.equal(configuracaoCorridaCustomizada.pesos.corrida.falhas.PenalidadeZMax, 8);
  assert.equal(configuracaoCorridaCustomizada.pesos.qualificacao.falhas.PenalidadeZMin, 2);
  assert.equal(configuracaoCorridaCustomizada.pesos.qualificacao.falhas.PenalidadeZMax, 4);

  const configuracaoQualiCustomizada = gerarConfiguracoes(
    [{ ...monza, penalidade_z_corrida: [4, 8], penalidade_z_quali: [1, 1.5] }],
    configuracoesExistentes,
  )[0];
  assert.equal(configuracaoQualiCustomizada.pesos.qualificacao.falhas.PenalidadeZMin, 1);
  assert.equal(configuracaoQualiCustomizada.pesos.qualificacao.falhas.PenalidadeZMax, 1.5);
});

test("gera os pesos de referência dos atributos de equipe", () => {
  const geradas = gerarConfiguracoes(descritores, configuracoesExistentes);
  const peso = (gp, sessao) =>
    geradas.find((configuracao) => configuracao.GP === gp).pesos[sessao]
      .equipe;
  const conferir = (atual, esperado) => {
    assert.deepStrictEqual(Object.keys(atual), ATRIBUTOS_EQUIPE);
    for (let indice = 0; indice < ATRIBUTOS_EQUIPE.length; indice++) {
      assert.ok(
        Math.abs(atual[ATRIBUTOS_EQUIPE[indice]] - esperado[indice]) <= 0.01,
        `${ATRIBUTOS_EQUIPE[indice]}: ${atual[ATRIBUTOS_EQUIPE[indice]]} != ${esperado[indice]}`,
      );
    }
  };

  conferir(peso("Monza", "corrida"), [0.038, 0.298, 0.095, 0.081, 0.298, 0.124, 0.066]);
  conferir(peso("Monaco", "corrida"), [0.156, 0.022, 0.278, 0.251, 0.022, 0.210, 0.062]);
  conferir(peso("Monza", "qualificacao"), [0.021, 0.414, 0.066, 0.056, 0.374, 0.069, 0]);
  assert.deepStrictEqual(FATORES_QUALI_PADRAO, {
    AeroCarga: 0.8,
    AeroEficiencia: 0.6,
    Chassi: 0.8,
    Tracao: 0.7,
    Potencia: 0.9,
    Operacoes: 0.3,
    GestaoPneus: 0,
  });
});

test("pesos de qualificação usam fatores específicos de cada pista", () => {
  const geradas = gerarConfiguracoes(descritores, configuracoesExistentes);
  const potencia = (gp) =>
    geradas.find((configuracao) => configuracao.GP === gp).pesos.qualificacao
      .equipe.Potencia;

  assert.ok(potencia("Monza") >= 0.36 && potencia("Monza") <= 0.38);
  assert.ok(potencia("Monaco") >= 0.005 && potencia("Monaco") <= 0.015);
  assert.equal(
    normalizarDescritor({
      ...descritores[0],
      fatores_quali: { potencia: 0.25 },
    }).fatores_quali.Potencia,
    0.25,
  );
  assert.equal(
    normalizarDescritor({
      ...descritores[0],
      fatores_quali: { potencia: 0.25 },
    }).fatores_quali.AeroCarga,
    FATORES_QUALI_PADRAO.AeroCarga,
  );

  const semFatores = normalizarDescritor({
    ...descritores[0],
    fatores_quali: undefined,
  });
  const pesosSemFatores = gerarPesos(semFatores, {
    mediaConsistencia: 80,
    nPilotos: pilotos.length,
  });
  const brutos = {
    AeroCarga: semFatores.aero_carga,
    AeroEficiencia: semFatores.aero_eficiencia,
    Chassi: semFatores.chassi,
    Tracao: semFatores.tracao,
    Potencia: semFatores.potencia,
    Operacoes: semFatores.operacoes,
    GestaoPneus: semFatores.pneus,
  };
  const ajustados = Object.fromEntries(
    Object.entries(FATORES_QUALI_PADRAO).map(([atributo, fator]) => [
      atributo,
      (brutos[atributo] + CFG.pisoEquipe) * fator,
    ]),
  );
  const somaAjustados = Object.values(ajustados).reduce(
    (total, valor) => total + valor,
    0,
  );
  for (const atributo of ATRIBUTOS_EQUIPE) {
    assert.ok(
      Math.abs(
        pesosSemFatores.pesos.qualificacao.equipe[atributo] -
          ajustados[atributo] / somaAjustados,
      ) < 0.001,
    );
  }
});

test("rejeita fatores_quali inválidos", () => {
  const descritor = descritores[0];
  assert.throws(
    () => normalizarDescritor({ ...descritor, fatores_quali: [] }),
    /deve ser um objeto.*Monza/,
  );
  assert.throws(
    () =>
      normalizarDescritor({
        ...descritor,
        fatores_quali: { potencia: Number.NaN },
      }),
    /Fator de quali "potencia" inválido.*Monza/,
  );
  assert.throws(
    () =>
      normalizarDescritor({
        ...descritor,
        fatores_quali: { potencia: 1.01 },
      }),
    /entre 0 e 1.*Monza/,
  );
});

test("curva sigmoide mecânica tem limites, centro e ordem monotônica", () => {
  assert.equal(configuracaoFalhaMecanica.algoritmo, "sigmoide");
  assert.equal(CFG.durabilidadePiso, configuracaoFalhaMecanica.porcentagemMinima / 100);
  assert.equal(CFG.durabilidadeTeto, configuracaoFalhaMecanica.porcentagemMaxima / 100);
  assert.equal(probFalhaMecEquipe(CFG.durabilidadeMax), 0.15);
  assert.ok(Math.abs(probFalhaMecEquipe(CFG.durabilidadeMin) - 0.45) < 1e-12);
  assert.ok(Math.abs(probFalhaMecEquipe(64.5) - 0.3) < 1e-12);
  assert.ok(probFalhaMecEquipe(80) > 0.15);
  assert.ok(probFalhaMecEquipe(80) < 0.3);
  assert.ok(probFalhaMecEquipe(54) > 0.3);
  assert.ok(probFalhaMecEquipe(54) < 0.45);
  const porDurabilidade = [...equipes].sort(
    (a, b) => a.durabilidade - b.durabilidade,
  );
  assert.ok(
    porDurabilidade.every(
      (equipe, indice) =>
        indice === 0 ||
        probFalhaMecEquipe(porDurabilidade[indice - 1].durabilidade) >=
          probFalhaMecEquipe(equipe.durabilidade),
    ),
  );
  assert.throws(() => probFalhaMecEquipe(Number.NaN), /durabilidade/i);
});

test("limites configurados controlam as falhas e a fração reduz DNFs mecânicos", () => {
  const austria = gerarConfiguracoes(
    descritores,
    configuracoesExistentes,
  ).find((configuracao) => configuracao.GP === "Austria");
  const { falhas } = austria.pesos.corrida;
  const taxas = equipes.map((equipe) => ({
    equipe: equipe.equipe,
    durabilidade: equipe.durabilidade,
    probabilidade:
      falhas.ProbFalhaMecanicaBase *
      falhas.FracaoDNFMecanica *
      probFalhaMecEquipe(equipe.durabilidade),
  }));
  const melhor = taxas.find((item) => item.equipe === "Mercedes");
  const pior = taxas.find((item) => item.equipe === "Cadillac");

  assert.ok(
    Math.abs(
      falhas.ProbFalhaMecanicaBase *
        probFalhaMecEquipe(melhor.durabilidade) -
        CFG.durabilidadePiso,
    ) < 0.001,
  );
  assert.ok(
    Math.abs(
      falhas.ProbFalhaMecanicaBase *
        probFalhaMecEquipe(pior.durabilidade) -
        CFG.durabilidadeTeto,
    ) < 0.001,
  );
  assert.ok(falhas.FracaoDNFMecanica < 0.355);
});

test("normaliza base mecânica pela média sigmoide fixa do grid", () => {
  const geradas = gerarConfiguracoes(descritores, configuracoesExistentes);
  const descritorAustria = descritores.find(
    (descritor) => descritor.GP === "Austria",
  );
  const austria = geradas.find(
    (configuracao) => configuracao.GP === "Austria",
  );
  const { falhas } = austria.pesos.corrida;
  const shareHum =
    descritorAustria.risco_erro /
    (descritorAustria.risco_erro + descritorAustria.estresse_mecanico);
  const falhasMecanicasEsperadas = pilotos.reduce((total, piloto) => {
    const equipe = equipes.find((item) => item.equipe === piloto.equipe);
    return (
      total +
      falhas.ProbFalhaMecanicaBase *
        probFalhaMecEquipe(equipe.durabilidade) *
        falhas.FracaoDNFMecanica
    );
  }, 0);
  const alvoMecanico =
    descritorAustria.dnf_alvo * (1 - shareHum);

  assert.ok(Math.abs(falhasMecanicasEsperadas - alvoMecanico) < 0.01);
});

test("pneus alimenta Gestão de Pneus e os pesos de piloto ligados ao desgaste", () => {
  const geradas = gerarConfiguracoes(descritores, configuracoesExistentes);

  for (const descritor of descritores) {
    const configuracao = geradas.find(
      (item) => item.GP === descritor.GP,
    );
    const pesosEquipe = configuracao.pesos.corrida.equipe;
    assert.ok(pesosEquipe.GestaoPneus > 0);
    const pesosSemEscala = gerarPesos(
      {
        ...descritor,
        precisao: 0,
        fisico: 0,
        dificuldade_ultrapassagem: 0,
      },
      { mediaConsistencia: 90, mediaDurabilidade: 70, nPilotos: 22 },
    );
    assert.ok(
      Math.abs(
        pesosSemEscala.pesos.corrida.piloto.Gerenciamento -
          (CFG.gerenciamentoBase +
            CFG.gerenciamentoPorPneus * descritor.pneus),
      ) < 0.00051,
    );
    assert.ok(
      Math.abs(
        pesosSemEscala.pesos.corrida.piloto.Adaptabilidade -
          (CFG.adaptabilidadeBase +
            CFG.adaptabilidadePorDesgaste * descritor.pneus),
      ) < 0.00051,
    );
    assert.ok(
      Math.abs(
        pesosSemEscala.pesos.qualificacao.piloto.Adaptabilidade -
          (CFG.adaptabilidadeQualiBase +
            CFG.adaptabilidadeQualiPorDesgaste * descritor.pneus),
      ) < 0.00051,
    );
  }
});

test("consistência não participa dos pesos de score de piloto", () => {
  const geradas = gerarConfiguracoes(descritores, configuracoesExistentes);

  for (const configuracao of geradas) {
    for (const sessao of ["qualificacao", "corrida"]) {
      const pesosPiloto = configuracao.pesos[sessao].piloto;
      assert.equal(Object.hasOwn(pesosPiloto, "Consistencia"), false);
      assert.ok(
        Math.abs(
          Object.values(pesosPiloto).reduce((soma, peso) => soma + peso, 0) - 1,
        ) <= 0.001,
      );
    }
  }
});

test("soma as contribuições esperadas de DNF humana e mecânica por pista", () => {
  const geradas = gerarConfiguracoes(descritores, configuracoesExistentes);

  for (const configuracao of geradas) {
    const { falhas } = configuracao.pesos.corrida;
    const contribuicoes = pilotos.reduce((total, piloto) => {
      const equipe = equipes.find(
        (item) => item.equipe === piloto.equipe,
      );
      const probabilidadeHumana = calcularProbabilidadeFalha(
        falhas.ProbFalhaHumanaBase,
        piloto.consistencia,
      );
      const probabilidadeMecanica =
        falhas.ProbFalhaMecanicaBase *
        probFalhaMecEquipe(equipe.durabilidade);
      return (
        total +
        probabilidadeHumana * falhas.FracaoDNFHumana +
        probabilidadeMecanica * falhas.FracaoDNFMecanica
      );
    }, 0);
    const alvo = descritores.find(
      (descritor) => descritor.GP === configuracao.GP,
    ).dnf_alvo;
    assert.ok(
      Math.abs(contribuicoes - alvo) <= 0.05,
      `${configuracao.GP}: ${contribuicoes} != ${alvo}`,
    );
  }
});

test("usa bases globais de RNG escaladas apenas pela imprevisibilidade", () => {
  const geradas = gerarConfiguracoes(descritores, configuracoesExistentes);
  for (const gp of ["Monaco", "Singapura", "Suzuka"]) {
    const configuracao = geradas.find((item) => item.GP === gp);
    const rngCorrida = configuracao.pesos.corrida.pesosGerais;
    const rngQuali = configuracao.pesos.qualificacao.pesosGerais;

    assert.equal(rngCorrida.RngPiloto, 1.4);
    assert.equal(rngCorrida.RngCarro, 1.4);
    assert.equal(rngCorrida.RngOperacoes, 4);
    assert.equal(rngCorrida.RngLargada, 0.5);
    assert.equal(rngQuali.RngPiloto, 1.2);
    assert.equal(rngQuali.RngCarro, 0.85);
    assert.equal(rngQuali.RngOperacoes, 3);
  }

  const descritor = { ...descritores[0], imprevisibilidade: 0.8 };
  const rngAumentado = gerarConfiguracoes([descritor], configuracoesExistentes)[0];
  assert.equal(
    rngAumentado.pesos.corrida.pesosGerais.RngPiloto,
    CFG.rngBases.corrida.piloto * 1.12,
  );
  assert.ok(
    Math.abs(
      rngAumentado.pesos.qualificacao.pesosGerais.RngOperacoes -
        CFG.rngBases.quali.operacoes * 1.12,
    ) < 1e-12,
  );
});

test("normaliza gp minúsculo e faixas pelos pontos médios", () => {
  const singapura = descritores.find(
    (item) => (item.GP ?? item.gp) === "Singapura",
  );
  const normalizado = normalizarDescritor({
    ...singapura,
    GP: undefined,
    gp: "Singapura",
    pct_chuva: [0.2, 0.4],
  });

  assert.equal(normalizado.GP, "Singapura");
  assert.ok(Math.abs(normalizado.pct_chuva - 0.3) < Number.EPSILON);
  const pneusEmFaixa = normalizarDescritor({
    ...singapura,
    pneus: [0.4, 0.6],
  });
  assert.equal(pneusEmFaixa.pneus, 0.5);
});

test("rejeita faixas e descritores inválidos com indicação do GP", () => {
  const base = descritores[0];
  assert.throws(
    () => normalizarDescritor({ ...base, aero_carga: [0.8, 0.2] }),
    /Faixa inválida.*Monza/,
  );
  assert.throws(
    () => normalizarDescritor({ ...base, potencia: 1.1 }),
    /entre 0 e 1.*Monza/,
  );
  assert.throws(
    () => normalizarDescritor({ ...base, operacoes: -0.1 }),
    /entre 0 e 1.*Monza/,
  );
});
