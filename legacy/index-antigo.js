const fs = require("node:fs");
const path = require("node:path");

const readJson = (filename) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, filename), "utf8"));

const pilotos = readJson("pilotos.json");
const equipes = readJson("equipes.json");
const configuracoesGP = readJson("pesos.json");

const atributosPiloto = {
  VelocidadeQualificacao: "velocidade_qualificacao",
  VelocidadeCorrida: "velocidade_corrida",
  Consistencia: "consistencia",
  Racecraft: "racecraft",
  Gerenciamento: "gerenciamento",
  Adaptabilidade: "adaptabilidade",
  Fisico: "fisico",
};

const atributosEquipe = {
  AeroCarga: "aero_carga",
  AeroEficiencia: "aero_eficiencia",
  Chassi: "chassi",
  Tracao: "tracao",
  Potencia: "potencia",
  Operacoes: "operacoes",
  GestaoPneus: "gestao_pneus",
};

const aplicarEfeitosChuva = (pesosOriginais, isQualy, pesoChuva) => {
  // Clona os objetos para não modificar os pesos base originais
  const novosPesos = {
    ...pesosOriginais,
    piloto: { ...pesosOriginais.piloto },
    equipe: { ...pesosOriginais.equipe },
  };

  // Modificadores de Piloto proporcionais à intensidade da chuva
  novosPesos.piloto.Adaptabilidade += 0.10 * pesoChuva;
  novosPesos.piloto.Consistencia += 0.05 * pesoChuva;

  if (isQualy) {
    novosPesos.piloto.VelocidadeQualificacao += 0.05 * pesoChuva;
  } else {
    novosPesos.piloto.VelocidadeCorrida += 0.05 * pesoChuva;
  }

  novosPesos.piloto.Gerenciamento -= 0.10 * pesoChuva;
  novosPesos.piloto.Racecraft -= 0.05 * pesoChuva;
  novosPesos.piloto.Fisico -= 0.05 * pesoChuva;

  // Modificadores de Equipe proporcionais à intensidade da chuva
  novosPesos.equipe.Operacoes += 0.10 * pesoChuva;
  novosPesos.equipe.Tracao += 0.05 * pesoChuva;
  novosPesos.equipe.GestaoPneus += 0.03 * pesoChuva;
  novosPesos.equipe.AeroEficiencia -= 0.06 * pesoChuva;
  novosPesos.equipe.Potencia -= 0.12 * pesoChuva;

  // Função interna para evitar pesos negativos e garantir que a soma seja 1.0
  const normalizarPesos = (pesosCategoria) => {
    let soma = 0;
    for (const key in pesosCategoria) {
      if (pesosCategoria[key] < 0) pesosCategoria[key] = 0;
      soma += pesosCategoria[key];
    }
    for (const key in pesosCategoria) {
      pesosCategoria[key] /= soma;
    }
  };

  normalizarPesos(novosPesos.piloto);
  normalizarPesos(novosPesos.equipe);

  return novosPesos;
};

const calcularScore = (dados, pesosPorAtributo, mapaAtributos) =>
  Object.entries(pesosPorAtributo).reduce((total, [atributo, peso]) => {
    const campo = mapaAtributos[atributo];
    const valor = dados[campo];

    if (campo === undefined || typeof valor !== "number") {
      throw new Error(`Atributo "${atributo}" ausente ou inválido nos dados.`);
    }

    return total + valor * peso;
  }, 0);

const arredondarScore = (score) => Number(score.toFixed(2));
const arredondarZ = (score) => Number(score.toFixed(3));

const calcularDesvioPadrao = (valores) => {
  const media =
    valores.reduce((total, valor) => total + valor, 0) / valores.length;
  const variancia =
    valores.reduce((total, valor) => total + (valor - media) ** 2, 0) /
    valores.length;
  return Math.sqrt(variancia);
};

const calcularZScores = (valores) => {
  const media =
    valores.reduce((total, valor) => total + valor, 0) / valores.length;
  const desvioPadrao = calcularDesvioPadrao(valores);

  if (desvioPadrao === 0) {
    return valores.map(() => 0);
  }

  return valores.map((valor) => (valor - media) / desvioPadrao);
};

const validarSomaPesos = (pesos, descricao) => {
  const valores = Object.values(pesos);
  const soma = valores.reduce((total, peso) => total + peso, 0);

  if (
    valores.length === 0 ||
    valores.some((peso) => typeof peso !== "number") ||
    Math.abs(soma - 1) > 0.001
  ) {
    throw new Error(`Os pesos de ${descricao} devem somar 1,00.`);
  }
};

const validarConfiguracaoRuido = (
  pesosGerais,
  pesosEquipe,
  descricao,
  exigeLargada = false,
) => {
  const campos = ["RngPiloto", "RngCarro", "RngOperacoes"];

  if (exigeLargada) {
    campos.push("RngLargada");
  }

  for (const campo of campos) {
    const valor = pesosGerais[campo];

    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
      throw new Error(`${campo} ausente ou inválido em ${descricao}.`);
    }
  }

  if (
    typeof pesosEquipe.Operacoes !== "number" ||
    pesosEquipe.Operacoes < 0 ||
    pesosEquipe.Operacoes > 1
  ) {
    throw new Error(`Peso de Operacoes ausente ou inválido em ${descricao}/equipe.`);
  }
};

for (const configuracao of configuracoesGP) {
  if (
    typeof configuracao.pct_chuva !== "number" ||
    configuracao.pct_chuva < 0 ||
    configuracao.pct_chuva > 1
  ) {
    throw new Error(`Probabilidade de chuva inválida no ${configuracao.GP}.`);
  }

  const pesosQualificacao = configuracao.pesos.qualificacao;
  const pesosCorrida = configuracao.pesos.corrida;
  const pesosGeraisQualificacao = pesosQualificacao.pesosGerais;
  const pesosGeraisCorrida = pesosCorrida.pesosGerais;

  validarSomaPesos(
    pesosQualificacao.piloto,
    `${configuracao.GP} qualificação/piloto`,
  );
  validarSomaPesos(
    pesosQualificacao.equipe,
    `${configuracao.GP} qualificação/equipe`,
  );
  validarSomaPesos(pesosCorrida.piloto, `${configuracao.GP} corrida/piloto`);
  validarSomaPesos(pesosCorrida.equipe, `${configuracao.GP} corrida/equipe`);

  if (
    Math.abs(
      pesosGeraisQualificacao.WPiloto + pesosGeraisQualificacao.WEquipe - 1,
    ) > 0.001
  ) {
    throw new Error(
      `Os pesos gerais de qualificação do ${configuracao.GP} devem somar 1,00.`,
    );
  }

  if (
    Math.abs(
      pesosGeraisCorrida.WPosInicial +
        pesosGeraisCorrida.WPiloto +
        pesosGeraisCorrida.WEquipe -
        1,
    ) > 0.001
  ) {
    throw new Error(
      `Os pesos gerais de corrida do ${configuracao.GP} devem somar 1,00.`,
    );
  }

  validarConfiguracaoRuido(
    pesosGeraisQualificacao,
    pesosQualificacao.equipe,
    `${configuracao.GP} qualificação`,
  );
  validarConfiguracaoRuido(
    pesosGeraisCorrida,
    pesosCorrida.equipe,
    `${configuracao.GP} corrida`,
    true,
  );
}

// Cada ruído é um valor entre -limite e +limite, com distribuição normal
// truncada: o desvio-padrão é limite / SIGMAS_NO_LIMITE_RNG.
// limite = RngBase * (TETO - atributo) / (TETO - REFERENCIA), ou seja, RngBase
// é o limite para um atributo igual à referência (85). Atributo maior, limite menor.
// Com teto 105, um atributo 100 ainda tem 25% do limite base.
const TETO_ATRIBUTO_RNG = 105;
const ATRIBUTO_REFERENCIA_RNG = 85;
const SIGMAS_NO_LIMITE_RNG = 3;

const gerarNormalPadrao = () => {
  let u = 0;

  while (u === 0) {
    u = Math.random();
  }

  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const gerarNormalTruncada = () => {
  let normal = gerarNormalPadrao();

  while (Math.abs(normal) > SIGMAS_NO_LIMITE_RNG) {
    normal = gerarNormalPadrao();
  }

  return normal;
};

const gerarRuido = (atributo, rngBase, descricao) => {
  if (typeof atributo !== "number" || atributo < 0 || atributo > 100) {
    throw new Error(
      `Atributo de ${descricao} ausente ou fora do intervalo de 0 a 100.`,
    );
  }

  const limite =
    (rngBase * (TETO_ATRIBUTO_RNG - atributo)) /
    (TETO_ATRIBUTO_RNG - ATRIBUTO_REFERENCIA_RNG);
  const valor = (limite / SIGMAS_NO_LIMITE_RNG) * gerarNormalTruncada();

  return { limite, valor };
};

// Ruídos independentes por piloto, em unidades de z de cada componente:
// piloto (consistência), carro (durabilidade), operações e, na corrida,
// largada (velocidade de corrida). Companheiros de equipe sorteiam
// valores diferentes. O ruído da equipe usa o peso interno de Operacoes do
// score de equipe; o da largada entra no componente de posição inicial.
const gerarFatorRNG = (
  piloto,
  equipe,
  pesosGerais,
  pesosEquipe,
  comLargada = false,
) => {
  const pesoOperacoes = pesosEquipe.Operacoes;
  const ruidoPiloto = gerarRuido(
    piloto.consistencia,
    pesosGerais.RngPiloto,
    "piloto",
  );
  const ruidoCarro = gerarRuido(
    equipe.durabilidade,
    pesosGerais.RngCarro,
    "carro",
  );
  const ruidoOperacoes = gerarRuido(
    equipe.operacoes,
    pesosGerais.RngOperacoes,
    "operações",
  );
  const ruidoEquipe =
    (1 - pesoOperacoes) * ruidoCarro.valor +
    pesoOperacoes * ruidoOperacoes.valor;
  const contribuicaoPiloto = ruidoPiloto.valor * pesosGerais.WPiloto;
  const contribuicaoEquipe = ruidoEquipe * pesosGerais.WEquipe;
  const fatorRNG = {
    piloto: ruidoPiloto,
    carro: ruidoCarro,
    operacoes: ruidoOperacoes,
    contribuicaoPiloto,
    contribuicaoEquipe,
    valor: contribuicaoPiloto + contribuicaoEquipe,
  };

  if (comLargada) {
    const ruidoLargada = gerarRuido(
      piloto.velocidade_corrida,
      pesosGerais.RngLargada,
      "largada",
    );
    const contribuicaoLargada = ruidoLargada.valor * pesosGerais.WPosInicial;

    fatorRNG.largada = ruidoLargada;
    fatorRNG.contribuicaoLargada = contribuicaoLargada;
    fatorRNG.valor += contribuicaoLargada;
  }

  return fatorRNG;
};

const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));

const calcularScoreQualificacao = (
  piloto,
  equipe,
  scorePilotoBruto,
  scoreEquipeBruto,
  zPiloto,
  zEquipe,
  desvioPadraoEquipeBruto,
  pesosQualificacao,
) => {
  const pesosGeraisQualificacao = pesosQualificacao.pesosGerais;
  const falhas = pesosQualificacao.falhas;

  if (falhas) {
    if (
      typeof falhas.ProbFalhaBase !== "number" ||
      typeof falhas.PenalidadeMin !== "number" ||
      typeof falhas.PenalidadeMax !== "number" ||
      typeof falhas.FracaoDNF !== "number" ||
      falhas.ProbFalhaBase < 0 ||
      falhas.ProbFalhaBase > 1 ||
      falhas.PenalidadeMin < 0 ||
      falhas.PenalidadeMax < falhas.PenalidadeMin ||
      falhas.FracaoDNF < 0
    ) {
      throw new Error(
        "Configuração de falhas ausente ou inválida na qualificação.",
      );
    }

    if (falhas.FracaoDNF > 0) {
      throw new Error("DNF ainda não está implementado.");
    }
  }

  let scoreEquipe = zEquipe;
  let falhaDurabilidade = {
    ocorreu: false,
    probabilidade: 0,
    penalidade: 0,
  };

  if (falhas) {
    if (typeof equipe.durabilidade !== "number") {
      throw new Error("Durabilidade da equipe ausente ou inválida.");
    }

    if (desvioPadraoEquipeBruto === 0) {
      throw new Error(
        "Desvio padrão do score da equipe é zero; não é possível normalizar a penalidade.",
      );
    }

    const probabilidadeFalha =
      (falhas.ProbFalhaBase * (100 - equipe.durabilidade)) / 100;
    const ocorreuFalha = Math.random() < probabilidadeFalha;
    const penalidadeBruta = ocorreuFalha
      ? falhas.PenalidadeMin +
        Math.random() * (falhas.PenalidadeMax - falhas.PenalidadeMin)
      : 0;
    const penalidadeZ = penalidadeBruta / desvioPadraoEquipeBruto;

    scoreEquipe -= penalidadeZ;
    falhaDurabilidade = {
      ocorreu: ocorreuFalha,
      probabilidade: probabilidadeFalha,
      penalidade: penalidadeZ,
    };
  }

  const contribuicaoPiloto = zPiloto * pesosGeraisQualificacao.WPiloto;
  const contribuicaoEquipe = scoreEquipe * pesosGeraisQualificacao.WEquipe;
  const fatorRNG = gerarFatorRNG(
    piloto,
    equipe,
    pesosGeraisQualificacao,
    pesosQualificacao.equipe,
  );
  const scoreAntesRNG = contribuicaoPiloto + contribuicaoEquipe;

  return {
    scorePiloto: zPiloto,
    scoreEquipe,
    scorePilotoBruto,
    scoreEquipeBruto,
    contribuicaoPiloto,
    contribuicaoEquipe,
    falhaDurabilidade,
    scoreAntesRNG,
    fatorRNG,
    scoreTotal: scoreAntesRNG + fatorRNG.valor,
  };
};

const calcularScoreCorrida = (
  piloto,
  equipe,
  zPosicaoInicial,
  scorePilotoBruto,
  scoreEquipeBruto,
  zPiloto,
  zEquipe,
  desvioPadraoEquipeBruto,
  pesosCorrida,
) => {
  const pesosGeraisCorrida = pesosCorrida.pesosGerais;
  if (
    typeof pesosGeraisCorrida.WPosInicial !== "number" ||
    typeof pesosGeraisCorrida.WPiloto !== "number" ||
    typeof pesosGeraisCorrida.WEquipe !== "number"
  ) {
    throw new Error("Pesos da corrida ausentes ou inválidos na configuração.");
  }

  const falhas = pesosCorrida.falhas;
  if (falhas) {
    if (
      typeof falhas.ProbFalhaBase !== "number" ||
      typeof falhas.PenalidadeMin !== "number" ||
      typeof falhas.PenalidadeMax !== "number" ||
      typeof falhas.FracaoDNF !== "number" ||
      falhas.ProbFalhaBase < 0 ||
      falhas.ProbFalhaBase > 1 ||
      falhas.PenalidadeMin < 0 ||
      falhas.PenalidadeMax < falhas.PenalidadeMin ||
      falhas.FracaoDNF < 0
    ) {
      throw new Error("Configuração de falhas ausente ou inválida na corrida.");
    }

    if (falhas.FracaoDNF > 0) {
      throw new Error("DNF ainda não está implementado.");
    }
  }

  let scoreEquipe = zEquipe;
  let falhaDurabilidade = {
    ocorreu: false,
    probabilidade: 0,
    penalidade: 0,
  };

  if (falhas) {
    if (typeof equipe.durabilidade !== "number") {
      throw new Error("Durabilidade da equipe ausente ou inválida.");
    }

    if (desvioPadraoEquipeBruto === 0) {
      throw new Error(
        "Desvio padrão do score da equipe é zero; não é possível normalizar a penalidade.",
      );
    }

    const probabilidadeFalha =
      (falhas.ProbFalhaBase * (100 - equipe.durabilidade)) / 100;
    const ocorreuFalha = Math.random() < probabilidadeFalha;
    const penalidadeBruta = ocorreuFalha
      ? falhas.PenalidadeMin +
        Math.random() * (falhas.PenalidadeMax - falhas.PenalidadeMin)
      : 0;
    const penalidadeZ = penalidadeBruta / desvioPadraoEquipeBruto;

    scoreEquipe -= penalidadeZ;
    falhaDurabilidade = {
      ocorreu: ocorreuFalha,
      probabilidade: probabilidadeFalha,
      penalidade: penalidadeZ,
    };
  }

  const contribuicaoPosInicial =
    zPosicaoInicial * pesosGeraisCorrida.WPosInicial;
  const contribuicaoPiloto = zPiloto * pesosGeraisCorrida.WPiloto;
  const contribuicaoEquipe = scoreEquipe * pesosGeraisCorrida.WEquipe;
  const fatorRNG = gerarFatorRNG(
    piloto,
    equipe,
    pesosGeraisCorrida,
    pesosCorrida.equipe,
    true,
  );
  const scoreAntesRNG =
    contribuicaoPosInicial + contribuicaoPiloto + contribuicaoEquipe;

  return {
    scorePosInicial: zPosicaoInicial,
    contribuicaoPosInicial,
    scorePiloto: zPiloto,
    scoreEquipe,
    scorePilotoBruto,
    scoreEquipeBruto,
    contribuicaoPiloto,
    contribuicaoEquipe,
    falhaDurabilidade,
    scoreAntesRNG,
    fatorRNG,
    scoreTotal: scoreAntesRNG + fatorRNG.valor,
  };
};

const calcularGridDeLargada = (configuracao) => {
  const pesosQualificacao = configuracao.pesos.qualificacao;

  const scoresBrutos = pilotos.map((piloto) => {
    const equipe = equipePorNome.get(piloto.equipe);

    if (!equipe) {
      throw new Error(
        `Equipe "${piloto.equipe}" não encontrada para ${piloto.piloto}.`,
      );
    }

    return {
      piloto,
      equipe,
      scorePilotoBruto: calcularScore(
        piloto,
        pesosQualificacao.piloto,
        atributosPiloto,
      ),
      scoreEquipeBruto: calcularScore(
        equipe,
        pesosQualificacao.equipe,
        atributosEquipe,
      ),
    };
  });
  const zPilotos = calcularZScores(
    scoresBrutos.map((resultado) => resultado.scorePilotoBruto),
  );
  const zEquipes = calcularZScores(
    scoresBrutos.map((resultado) => resultado.scoreEquipeBruto),
  );
  const desvioPadraoEquipeBruto = calcularDesvioPadrao(
    scoresBrutos.map((resultado) => resultado.scoreEquipeBruto),
  );

  return scoresBrutos
    .map((resultado, indice) => ({
      ...resultado,
      scoreQualificacao: calcularScoreQualificacao(
        resultado.piloto,
        resultado.equipe,
        resultado.scorePilotoBruto,
        resultado.scoreEquipeBruto,
        zPilotos[indice],
        zEquipes[indice],
        desvioPadraoEquipeBruto,
        pesosQualificacao,
      ),
    }))
    .sort(
      (a, b) => b.scoreQualificacao.scoreTotal - a.scoreQualificacao.scoreTotal,
    )
    .map((resultado, indice) => ({ ...resultado, posicaoLargada: indice + 1 }));
};

const calcularOrdemDeChegada = (gridDeLargada, pesosCorrida) => {
  const scoresBrutos = gridDeLargada.map(({ piloto, equipe }) => ({
    piloto,
    equipe,
    scorePilotoBruto: calcularScore(
      piloto,
      pesosCorrida.piloto,
      atributosPiloto,
    ),
    scoreEquipeBruto: calcularScore(
      equipe,
      pesosCorrida.equipe,
      atributosEquipe,
    ),
  }));
  const zPilotos = calcularZScores(
    scoresBrutos.map((resultado) => resultado.scorePilotoBruto),
  );
  const zEquipes = calcularZScores(
    scoresBrutos.map((resultado) => resultado.scoreEquipeBruto),
  );
  const desvioPadraoEquipeBruto = calcularDesvioPadrao(
    scoresBrutos.map((resultado) => resultado.scoreEquipeBruto),
  );
  const zPosicoes = calcularZScores(
    gridDeLargada.map((resultado) => -resultado.posicaoLargada),
  );

  return gridDeLargada
    .map(({ piloto, equipe, scoreQualificacao, posicaoLargada }, indice) => ({
      piloto: piloto.piloto,
      equipe: equipe.equipe,
      posicaoLargada,
      scoreQualificacao,
      ...calcularScoreCorrida(
        piloto,
        equipe,
        zPosicoes[indice],
        scoresBrutos[indice].scorePilotoBruto,
        scoresBrutos[indice].scoreEquipeBruto,
        zPilotos[indice],
        zEquipes[indice],
        desvioPadraoEquipeBruto,
        pesosCorrida,
      ),
    }))
    .sort((a, b) => b.scoreTotal - a.scoreTotal);
};

const criarNomeArquivo = (nomeGP) => {
  const slug = nomeGP
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  return `resultados_${slug}.json`;
};

const calcularResultadosEquipes = (ordemDeChegada) => {
  const equipesAgrupadas = new Map();

  for (const resultado of ordemDeChegada) {
    if (!equipesAgrupadas.has(resultado.equipe)) {
      equipesAgrupadas.set(resultado.equipe, {
        equipe: resultado.equipe,
        pilotos: [],
        scoreEquipeQualySomado: 0,
        contribuicaoEquipeQualySomada: 0,
        scoreEquipeCorridaSomado: 0,
        contribuicaoEquipeCorridaSomada: 0,
      });
    }

    const equipe = equipesAgrupadas.get(resultado.equipe);
    equipe.pilotos.push(resultado.piloto);
    equipe.scoreEquipeQualySomado += resultado.scoreQualificacao.scoreEquipe;
    equipe.contribuicaoEquipeQualySomada +=
      resultado.scoreQualificacao.contribuicaoEquipe;
    equipe.scoreEquipeCorridaSomado += resultado.scoreEquipe;
    equipe.contribuicaoEquipeCorridaSomada += resultado.contribuicaoEquipe;
  }

  return [...equipesAgrupadas.values()]
    .sort(
      (a, b) =>
        b.contribuicaoEquipeCorridaSomada - a.contribuicaoEquipeCorridaSomada,
    )
    .map((equipe, indice) => ({
      posicao: indice + 1,
      equipe: equipe.equipe,
      pilotos: equipe.pilotos,
      scores: {
        qualificacao: {
          scoreEquipeSomado: arredondarZ(equipe.scoreEquipeQualySomado),
          contribuicaoEquipeSomada: arredondarZ(
            equipe.contribuicaoEquipeQualySomada,
          ),
        },
        corrida: {
          scoreEquipeSomado: arredondarZ(equipe.scoreEquipeCorridaSomado),
          contribuicaoEquipeSomada: arredondarZ(
            equipe.contribuicaoEquipeCorridaSomada,
          ),
        },
      },
    }));
};

const quantidadeSimulacoes = 10000;

const acumularValores = (acumulador, valores) => {
  for (const [chave, valor] of Object.entries(valores)) {
    if (typeof valor === "number") {
      acumulador[chave] = (acumulador[chave] || 0) + valor;
    } else if (typeof valor === "boolean") {
      acumulador[chave] = (acumulador[chave] || 0) + Number(valor);
    } else if (valor && typeof valor === "object") {
      acumulador[chave] ||= {};
      acumularValores(acumulador[chave], valor);
    }
  }
};

const calcularMedias = (acumulador, quantidade) =>
  Object.fromEntries(
    Object.entries(acumulador).map(([chave, valor]) => [
      chave,
      typeof valor === "number"
        ? valor / quantidade
        : calcularMedias(valor, quantidade),
    ]),
  );

const resultadosEquipesPorGP = [];

const formatarRuido = (ruido) => ({
  limite: arredondarZ(ruido.limite),
  valor: arredondarZ(ruido.valor),
});

const formatarFatorRNG = (fatorRNG) => ({
  piloto: formatarRuido(fatorRNG.piloto),
  carro: formatarRuido(fatorRNG.carro),
  operacoes: formatarRuido(fatorRNG.operacoes),
  ...(fatorRNG.largada && {
    largada: formatarRuido(fatorRNG.largada),
    contribuicaoLargada: arredondarZ(fatorRNG.contribuicaoLargada),
  }),
  contribuicaoPiloto: arredondarZ(fatorRNG.contribuicaoPiloto),
  contribuicaoEquipe: arredondarZ(fatorRNG.contribuicaoEquipe),
  valor: arredondarZ(fatorRNG.valor),
});

const formatarFalhaDurabilidade = (falha) => ({
  taxaOcorrenciaPercentual: arredondarScore(falha.ocorreu * 100),
  probabilidade: arredondarScore(falha.probabilidade),
  penalidade: arredondarZ(falha.penalidade),
});

const formatarScoreQualificacao = (score) => ({
  scorePiloto: arredondarZ(score.scorePiloto),
  scoreEquipe: arredondarZ(score.scoreEquipe),
  scorePilotoBruto: arredondarScore(score.scorePilotoBruto),
  scoreEquipeBruto: arredondarScore(score.scoreEquipeBruto),
  contribuicaoPiloto: arredondarZ(score.contribuicaoPiloto),
  contribuicaoEquipe: arredondarZ(score.contribuicaoEquipe),
  falhaDurabilidade: formatarFalhaDurabilidade(score.falhaDurabilidade),
  scoreAntesRNG: arredondarZ(score.scoreAntesRNG),
  fatorRNG: formatarFatorRNG(score.fatorRNG),
  scoreTotal: arredondarZ(score.scoreTotal),
});

for (const configuracao of configuracoesGP) {
  const acumuladores = new Map(
    pilotos.map((piloto) => [
      piloto.piloto,
      {
        piloto: piloto.piloto,
        equipe: piloto.equipe,
        somaPosicaoLargada: 0,
        somaPosicaoFinal: 0,
        somaVariacaoPosicoes: 0,
        melhorPosicaoLargada: Infinity,
        piorPosicaoLargada: 0,
        melhorPosicaoFinal: Infinity,
        piorPosicaoFinal: 0,
        scoresQualificacao: {},
        scoresCorrida: {},
      },
    ]),
  );
  let totalUltrapassagens = 0;
  let totalFalhas = 0;
  let totalFalhasQualificacao = 0;
  let totalCorridasComChuva = 0;
  const vitoriasPorPosicaoLargada = new Array(pilotos.length).fill(0);
  const vitoriasPorPiloto = new Map();

  for (let simulacao = 0; simulacao < quantidadeSimulacoes; simulacao++) {
    if (Math.random() < configuracao.pct_chuva) {
      totalCorridasComChuva++;
    }

    const gridDeLargada = calcularGridDeLargada(configuracao);
    const ordemDeChegada = calcularOrdemDeChegada(
      gridDeLargada,
      configuracao.pesos.corrida,
    ).map((resultado, indice) => ({
      ...resultado,
      posicaoFinal: indice + 1,
      variacaoPosicoes: resultado.posicaoLargada - (indice + 1),
    }));

    for (const resultado of gridDeLargada) {
      const acumulador = acumuladores.get(resultado.piloto.piloto);
      acumulador.somaPosicaoLargada += resultado.posicaoLargada;
      acumulador.melhorPosicaoLargada = Math.min(
        acumulador.melhorPosicaoLargada,
        resultado.posicaoLargada,
      );
      acumulador.piorPosicaoLargada = Math.max(
        acumulador.piorPosicaoLargada,
        resultado.posicaoLargada,
      );
      acumularValores(acumulador.scoresQualificacao, resultado.scoreQualificacao);
      totalFalhasQualificacao += Number(
        resultado.scoreQualificacao.falhaDurabilidade.ocorreu,
      );
    }

    const vencedor = ordemDeChegada[0];
    vitoriasPorPosicaoLargada[vencedor.posicaoLargada - 1]++;
    vitoriasPorPiloto.set(
      vencedor.piloto,
      (vitoriasPorPiloto.get(vencedor.piloto) || 0) + 1,
    );

    for (const resultado of ordemDeChegada) {
      const acumulador = acumuladores.get(resultado.piloto);
      acumulador.somaPosicaoFinal += resultado.posicaoFinal;
      acumulador.somaVariacaoPosicoes += resultado.variacaoPosicoes;
      acumulador.melhorPosicaoFinal = Math.min(
        acumulador.melhorPosicaoFinal,
        resultado.posicaoFinal,
      );
      acumulador.piorPosicaoFinal = Math.max(
        acumulador.piorPosicaoFinal,
        resultado.posicaoFinal,
      );
      acumularValores(acumulador.scoresCorrida, {
        scorePosInicial: resultado.scorePosInicial,
        contribuicaoPosInicial: resultado.contribuicaoPosInicial,
        scorePiloto: resultado.scorePiloto,
        scoreEquipe: resultado.scoreEquipe,
        scorePilotoBruto: resultado.scorePilotoBruto,
        scoreEquipeBruto: resultado.scoreEquipeBruto,
        contribuicaoPiloto: resultado.contribuicaoPiloto,
        contribuicaoEquipe: resultado.contribuicaoEquipe,
        falhaDurabilidade: resultado.falhaDurabilidade,
        scoreAntesRNG: resultado.scoreAntesRNG,
        fatorRNG: resultado.fatorRNG,
        scoreTotal: resultado.scoreTotal,
      });
      totalUltrapassagens += Math.max(0, resultado.variacaoPosicoes);
      totalFalhas += Number(resultado.falhaDurabilidade.ocorreu);
    }
  }

  const resultadosCorrida = [...acumuladores.values()]
    .map((acumulador) => {
      const scoresQualificacao = calcularMedias(
        acumulador.scoresQualificacao,
        quantidadeSimulacoes,
      );
      const scoresCorrida = calcularMedias(
        acumulador.scoresCorrida,
        quantidadeSimulacoes,
      );

      return {
        piloto: acumulador.piloto,
        equipe: acumulador.equipe,
        posicaoMediaLargada:
          acumulador.somaPosicaoLargada / quantidadeSimulacoes,
        posicaoMediaFinal: acumulador.somaPosicaoFinal / quantidadeSimulacoes,
        variacaoPosicoesMedia:
          acumulador.somaVariacaoPosicoes / quantidadeSimulacoes,
        melhorPosicaoLargada: acumulador.melhorPosicaoLargada,
        piorPosicaoLargada: acumulador.piorPosicaoLargada,
        melhorPosicaoFinal: acumulador.melhorPosicaoFinal,
        piorPosicaoFinal: acumulador.piorPosicaoFinal,
        scores: {
          qualificacao: formatarScoreQualificacao(scoresQualificacao),
          corrida: {
            scorePosInicial: arredondarZ(scoresCorrida.scorePosInicial),
            contribuicaoPosInicial: arredondarZ(
              scoresCorrida.contribuicaoPosInicial,
            ),
            scorePiloto: arredondarZ(scoresCorrida.scorePiloto),
            scoreEquipe: arredondarZ(scoresCorrida.scoreEquipe),
            scorePilotoBruto: arredondarScore(scoresCorrida.scorePilotoBruto),
            scoreEquipeBruto: arredondarScore(scoresCorrida.scoreEquipeBruto),
            contribuicaoPiloto: arredondarZ(
              scoresCorrida.contribuicaoPiloto,
            ),
            contribuicaoEquipe: arredondarZ(
              scoresCorrida.contribuicaoEquipe,
            ),
            falhaDurabilidade: formatarFalhaDurabilidade(
              scoresCorrida.falhaDurabilidade,
            ),
            scoreAntesRNG: arredondarZ(scoresCorrida.scoreAntesRNG),
            fatorRNG: formatarFatorRNG(scoresCorrida.fatorRNG),
            scoreTotal: arredondarZ(scoresCorrida.scoreTotal),
          },
        },
      };
    })
    .sort((a, b) => a.posicaoMediaFinal - b.posicaoMediaFinal);

  const ordemMediaParaEquipes = resultadosCorrida.map((resultado) => ({
    piloto: resultado.piloto,
    equipe: resultado.equipe,
    scoreQualificacao: resultado.scores.qualificacao,
    scoreEquipe: resultado.scores.corrida.scoreEquipe,
    contribuicaoEquipe: resultado.scores.corrida.contribuicaoEquipe,
  }));

  resultadosEquipesPorGP.push({
    GP: configuracao.GP,
    equipes: calcularResultadosEquipes(ordemMediaParaEquipes),
  });

  const resultados = {
    GP: configuracao.GP,
    quantidadeSimulacoes,
    informacoesGerais: {
      qualificacao: {
        mediaUltrapassagens: 0,
        mediaFalhas: totalFalhasQualificacao / quantidadeSimulacoes,
      },
      corrida: {
        mediaUltrapassagens: totalUltrapassagens / quantidadeSimulacoes,
        mediaFalhas: totalFalhas / quantidadeSimulacoes,
        corridasComChuva: totalCorridasComChuva,
        vitoriasPorPiloto: [...vitoriasPorPiloto.entries()]
          .map(([piloto, vitorias]) => ({
            piloto,
            equipe: acumuladores.get(piloto).equipe,
            vitorias,
            porcentagem: arredondarScore(
              (vitorias / quantidadeSimulacoes) * 100,
            ),
          }))
          .sort((a, b) => b.vitorias - a.vitorias),
        vitoriasPorPosicaoLargada: vitoriasPorPosicaoLargada
          .map((vitorias, indice) => ({
            posicaoLargada: indice + 1,
            vitorias,
            porcentagem: arredondarScore(
              (vitorias / quantidadeSimulacoes) * 100,
            ),
          }))
          .filter((resultado) => resultado.porcentagem >= 1),
      },
    },
    resultadosCorrida,
  };

  const nomeArquivo = criarNomeArquivo(configuracao.GP);
  fs.writeFileSync(
    path.join(__dirname, nomeArquivo),
    `${JSON.stringify(resultados, null, 2)}\n`,
    "utf8",
  );

  console.log(`Médias de ${quantidadeSimulacoes} simulações - GP ${configuracao.GP}`);
  console.table(
    resultadosCorrida.map((resultado) => ({
      Piloto: resultado.piloto,
      Equipe: resultado.equipe,
      LargadaMedia: arredondarScore(resultado.posicaoMediaLargada),
      ChegadaMedia: arredondarScore(resultado.posicaoMediaFinal),
      MelhorLargada: resultado.melhorPosicaoLargada,
      PiorLargada: resultado.piorPosicaoLargada,
      MelhorChegada: resultado.melhorPosicaoFinal,
      PiorChegada: resultado.piorPosicaoFinal,
      ScoreQualy: resultado.scores.qualificacao.scoreTotal,
      ScoreCorrida: resultado.scores.corrida.scoreTotal,
    })),
  );

  console.log("Informações gerais:");
  console.table(resultados.informacoesGerais);
  console.log("Vitórias por piloto:");
  console.table(resultados.informacoesGerais.corrida.vitoriasPorPiloto);
  console.log("Vitórias por posição de largada:");
  console.table(resultados.informacoesGerais.corrida.vitoriasPorPosicaoLargada);
}

fs.writeFileSync(
  path.join(__dirname, "resultados_equipes.json"),
  `${JSON.stringify({ circuitos: resultadosEquipesPorGP }, null, 2)}\n`,
  "utf8",
);