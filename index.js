const fs = require("node:fs");
const path = require("node:path");

const readJson = require("./funcoes/readJson");
const validarSomaPesos = require("./funcoes/validarSomaPesos");
const validarConfiguracaoRuido = require("./funcoes/validarConfiguracaoRuido");
const calcularGridDeLargada = require("./funcoes/calcularGridDeLargada");
const calcularOrdemDeChegada = require("./funcoes/calcularOrdemDeChegada");
const criarNomeArquivo = require("./funcoes/criarNomeArquivo");
const calcularResultadosEquipes = require("./funcoes/calcularResultadosEquipes");
const acumularValores = require("./funcoes/acumularValores");
const calcularMedias = require("./funcoes/calcularMedias");
const arredondarScore = require("./funcoes/arredondarScore");
const arredondarScoreBruto = require("./funcoes/arredondarScoreBruto");
const arredondarZ = require("./funcoes/arredondarZ");
const formatarFatorRNG = require("./funcoes/formatarFatorRNG");
const formatarFalhaDurabilidade = require("./funcoes/formatarFalhaDurabilidade");
const formatarScoreQualificacao = require("./funcoes/formatarScoreQualificacao");
const calcularComparativoScorePiloto = require("./funcoes/calcularComparativoScorePiloto");
const registrarExtremo = require("./funcoes/registrarExtremo");
const { sortearClima } = require("./funcoes/sortearClima");
const CONFIG_CHUVA = require("./funcoes/configChuva");
const CONFIG_FALHAS = require("./funcoes/configFalhas");
const { DNF_TETO } = require("./funcoes/configuracoes");

const pilotos = readJson("pilotos.json");
const equipes = readJson("equipes.json");
const configuracoesGP = readJson("pesos.json");
const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));
const modoSeco = process.argv.includes("--seco");
const argumentos = process.argv.slice(2).filter((argumento) => argumento !== "--seco");
const argumentoEhGP = configuracoesGP.some(
  (configuracao) => configuracao.GP === argumentos[0],
);
const gpSelecionado = modoSeco
  ? argumentoEhGP || (argumentos[0] && !/^\d+$/.test(argumentos[0]))
    ? argumentos[0]
    : undefined
  : process.argv[2];
const argumentoQuantidade = modoSeco
  ? gpSelecionado
    ? argumentos[1]
    : argumentos[0]
  : process.argv[3];
const quantidadeSimulacoes =
  argumentoQuantidade === undefined ? 10000 : Number(argumentoQuantidade);
const configuracoesParaSimular = gpSelecionado
  ? configuracoesGP.filter((configuracao) => configuracao.GP === gpSelecionado)
  : configuracoesGP;
const contagensIniciaisPosicoes = [...pilotos.keys()].map((indice) => [
  indice + 1,
  0,
]);
const resultadosEquipesPorGP = [];
const categoriasClima = ["seco", "garoa", "chuva", "tempestade"];

if (!Number.isInteger(quantidadeSimulacoes) || quantidadeSimulacoes < 1) {
  throw new Error("A quantidade de simulações deve ser um inteiro positivo.");
}

if (gpSelecionado && configuracoesParaSimular.length === 0) {
  throw new Error(`Grande Prêmio desconhecido: ${gpSelecionado}.`);
}

const criarExtremosFatorRNG = (fatores) =>
  Object.fromEntries(
    fatores.map((fator) => [fator, { minima: null, maxima: null }]),
  );

const registrarExtremosFatorRNG = (extremos, fatorRNG) => {
  for (const fator of Object.keys(extremos)) {
    registrarExtremo(extremos[fator], fatorRNG[fator].valor);
  }
};

const classificarCondicaoChuva = (pc) => {
  if (pc === 0) return "seco";
  if (pc < CONFIG_CHUVA.limitesCategoria.garoa) return "garoa";
  if (pc < CONFIG_CHUVA.limitesCategoria.chuva) return "chuva";
  return "tempestade";
};

const criarEstatisticasPorCondicao = () =>
  Object.fromEntries(
    categoriasClima.map((condicao) => [
      condicao,
      {
        simulacoes: 0,
        vitoriasPorPosicaoLargada: new Array(pilotos.length).fill(0),
        somaPosicaoFinal: 0,
        somaQuadradosPosicaoFinal: 0,
        participacoes: 0,
        dnf: 0,
        ultrapassagens: 0,
      },
    ]),
  );

const criarEstatisticasSafetyCar = () => ({
  simulacoes: 0,
  vitoriasPorPosicaoLargada: new Array(pilotos.length).fill(0),
  somaPosicaoFinal: 0,
  somaQuadradosPosicaoFinal: 0,
  participacoes: 0,
  dnf: 0,
  ultrapassagens: 0,
});

const criarContagensClima = () =>
  Object.fromEntries(categoriasClima.map((condicao) => [condicao, 0]));

const criarPosicoesPorCondicao = () =>
  Object.fromEntries(
    categoriasClima.map((condicao) => [
      condicao,
      Object.fromEntries(contagensIniciaisPosicoes),
    ]),
  );

const resumirDistribuicaoPosicoes = (posicoes) => {
  let participacoes = 0;
  let somaPosicoes = 0;
  let somaQuadradosPosicoes = 0;

  for (const [posicao, quantidade] of Object.entries(posicoes)) {
    const numeroPosicao = Number(posicao);
    participacoes += quantidade;
    somaPosicoes += numeroPosicao * quantidade;
    somaQuadradosPosicoes += numeroPosicao ** 2 * quantidade;
  }

  if (participacoes === 0) {
    return {
      participacoes: 0,
      posicaoFinalMedia: null,
      desvioPadraoPosicaoFinal: null,
    };
  }

  const media = somaPosicoes / participacoes;
  return {
    participacoes,
    posicaoFinalMedia: arredondarScore(media),
    desvioPadraoPosicaoFinal: arredondarScore(
      Math.sqrt(
        Math.max(0, somaQuadradosPosicoes / participacoes - media ** 2),
      ),
    ),
  };
};

for (const configuracao of configuracoesParaSimular) {
  if (
    typeof configuracao.pct_chuva !== "number" ||
    configuracao.pct_chuva < 0 ||
    configuracao.pct_chuva > 1
  ) {
    throw new Error(`Probabilidade de chuva inválida no ${configuracao.GP}.`);
  }
  if (
    typeof configuracao.multiplicadorSeveridadeFalha !== "number" ||
    !Number.isFinite(configuracao.multiplicadorSeveridadeFalha) ||
    configuracao.multiplicadorSeveridadeFalha <= 0
  ) {
    throw new Error(
      `Multiplicador de severidade de falha inválido no ${configuracao.GP}.`,
    );
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

for (const configuracao of configuracoesParaSimular) {
  const acumuladores = new Map(
    pilotos.map((piloto) => [
      piloto.piloto,
      {
        piloto: piloto.piloto,
        equipe: piloto.equipe,
        somaPosicaoLargada: 0,
        somaPosicaoFinal: 0,
        somaPosicaoRitmo: 0,
        somaPosicaoMediaReal: 0,
        somaVariacaoPosicoes: 0,
        melhorPosicaoLargada: Infinity,
        piorPosicaoLargada: 0,
        melhorPosicaoFinal: Infinity,
        piorPosicaoFinal: 0,
        dnf: {
          total: 0,
          porFalhaDurabilidade: 0,
          porFalhaHumana: 0,
          somaVoltaAbandono: 0,
        },
        incidentes: {
          total: 0,
          singles: 0,
          multicarros: 0,
          porPosicaoLargada: 0,
          porPosicaoMediaReal: 0,
        },
        falhasModeradas: {
          total: 0,
          porFalhaDurabilidade: 0,
          porFalhaHumana: 0,
        },
        posicoesQualificacao: Object.fromEntries(contagensIniciaisPosicoes),
        posicoesCorrida: Object.fromEntries(contagensIniciaisPosicoes),
        posicoesCorridaPorCondicao: criarPosicoesPorCondicao(),
        posicoesCorridaPorSafetyCar: {
          comSafetyCar: Object.fromEntries(contagensIniciaisPosicoes),
          semSafetyCar: Object.fromEntries(contagensIniciaisPosicoes),
        },
        rngSafetyCar: {
          corridas: 0,
          somaLimite: 0,
          somaValor: 0,
          somaQuadradosValor: 0,
        },
        scoresQualificacao: {},
        scoresCorrida: {},
        scorePilotoPorCondicao: {
          qualificacao: {
            seco: { soma: 0, quantidade: 0 },
            chuva: { soma: 0, quantidade: 0 },
          },
          corrida: {
            seco: { soma: 0, quantidade: 0 },
            chuva: { soma: 0, quantidade: 0 },
          },
        },
        extremosPenalidadeZ: {
          qualificacao: {
            mecanica: { minima: null, maxima: null },
            humana: { minima: null, maxima: null },
          },
          corrida: {
            mecanica: { minima: null, maxima: null },
            humana: { minima: null, maxima: null },
          },
        },
        extremosFatorRNG: {
          qualificacao: criarExtremosFatorRNG([
            "piloto",
            "carro",
            "operacoes",
          ]),
          corrida: criarExtremosFatorRNG([
            "piloto",
            "carro",
            "operacoes",
            "largada",
          ]),
        },
      },
    ]),
  );
  let totalUltrapassagens = 0;
  let totalFalhas = 0;
  let totalFalhasQualificacao = 0;
  let totalCorridasComChuva = 0;
  let totalQualysNaChuva = 0;
  let totalDNF = 0;
  let totalDNFCortadoPeloTeto = 0;
  let totalDNFPorFalhaDurabilidade = 0;
  let totalDNFPorFalhaHumana = 0;
  let somaVoltaAbandono = 0;
  let totalFalhasModeradas = 0;
  let falhasModeradasDurabilidade = 0;
  let falhasModeradasHumanas = 0;
  const contagemClimaQualificacao = criarContagensClima();
  const contagemClimaCorrida = criarContagensClima();
  const estatisticasPorCondicao = criarEstatisticasPorCondicao();
  const estatisticasPorSafetyCar = {
    comSafetyCar: criarEstatisticasSafetyCar(),
    semSafetyCar: criarEstatisticasSafetyCar(),
  };
  let corridasComSafetyCar = 0;
  let totalEventosSafetyCar = 0;
  let somaVoltaInicioSafetyCar = 0;
  let somaDuracaoSafetyCar = 0;
  let somaLambdaSafetyCar = 0;
  let somaFatorEventoOperacoes = 0;
  const origensSafetyCar = {
    dnf_humana: 0,
    dnf_mecanica: 0,
  };
  const linhaDoTempoPorVolta = Array.from(
    { length: configuracao.voltas },
    (_, indice) => ({
      volta: indice + 1,
      gruposIncidentes: 0,
      gruposSingles: 0,
      gruposMulticarros: 0,
      gruposPorPosicaoLargada: 0,
      gruposPorPosicaoMediaReal: 0,
      pilotosAfetados: 0,
      pilotosDNF: 0,
      safetyCars: 0,
      voltasDeSafetyCar: 0,
    }),
  );
  const combinacoesClima = {
    secoSeco: 0,
    qualiMolhadaCorridaSeca: 0,
    qualiSecaCorridaMolhada: 0,
    molhadoMolhado: 0,
  };
  const penalidadeZFalhaCarro = { minima: null, maxima: null };
  const vitoriasPorPosicaoLargada = new Array(pilotos.length).fill(0);
  const vitoriasPorPiloto = new Map();

  for (let simulacao = 0; simulacao < quantidadeSimulacoes; simulacao++) {
    const { pcQualy, pcCorrida } = modoSeco
      ? { pcQualy: 0, pcCorrida: 0 }
      : sortearClima(configuracao.pct_chuva);
    const condicaoQualificacao = classificarCondicaoChuva(pcQualy);
    const condicaoCorrida = classificarCondicaoChuva(pcCorrida);
    const qualyMolhada = pcQualy > 0;
    const corridaMolhada = pcCorrida > 0;
    contagemClimaQualificacao[condicaoQualificacao]++;
    contagemClimaCorrida[condicaoCorrida]++;
    estatisticasPorCondicao[condicaoCorrida].simulacoes++;

    if (qualyMolhada) {
      totalQualysNaChuva++;
    }
    if (corridaMolhada) {
      totalCorridasComChuva++;
    }
    if (!qualyMolhada && !corridaMolhada) {
      combinacoesClima.secoSeco++;
    } else if (qualyMolhada && !corridaMolhada) {
      combinacoesClima.qualiMolhadaCorridaSeca++;
    } else if (!qualyMolhada && corridaMolhada) {
      combinacoesClima.qualiSecaCorridaMolhada++;
    } else {
      combinacoesClima.molhadoMolhado++;
    }

    const gridDeLargada = calcularGridDeLargada(
      configuracao,
      pilotos,
      equipePorNome,
      pcQualy,
    );
    const ordemDeChegada = calcularOrdemDeChegada(
      gridDeLargada,
      configuracao.pesos.corrida,
      pcCorrida,
      configuracao.multiplicadorSeveridadeFalha,
      configuracao.voltas,
      {
        teto_dnf: configuracao.teto_dnf,
        intensidadeOperacoes: configuracao.intensidadeOperacoes,
      },
    ).map((resultado, indice) => ({
      ...resultado,
      posicaoFinal: indice + 1,
      variacaoPosicoes: resultado.posicaoLargada - (indice + 1),
    }));
    somaFatorEventoOperacoes +=
      ordemDeChegada[0]?.fatorEventoOperacoes ?? 1;
    const eventosSafetyCar =
      ordemDeChegada[0]?.eventosSafetyCar ?? [];
    const eventosIncidentes = ordemDeChegada[0]?.eventos ?? [];
    for (const evento of eventosIncidentes) {
      const estatisticaVolta = linhaDoTempoPorVolta[evento.volta - 1];
      estatisticaVolta.gruposIncidentes++;
      estatisticaVolta[evento.pilotos.length === 1
        ? "gruposSingles"
        : "gruposMulticarros"]++;
      estatisticaVolta[evento.categoria === "posicaoLargada"
        ? "gruposPorPosicaoLargada"
        : "gruposPorPosicaoMediaReal"]++;
      estatisticaVolta.pilotosAfetados += evento.pilotos.length;
      estatisticaVolta.pilotosDNF += evento.pilotos.filter(
        (piloto) => piloto.dnf,
      ).length;
      for (const piloto of evento.pilotos) {
        const incidentesPiloto = acumuladores.get(piloto.piloto).incidentes;
        incidentesPiloto.total++;
        incidentesPiloto[evento.pilotos.length === 1
          ? "singles"
          : "multicarros"]++;
        incidentesPiloto[evento.categoria === "posicaoLargada"
          ? "porPosicaoLargada"
          : "porPosicaoMediaReal"]++;
      }
    }
    for (const evento of eventosSafetyCar) {
      const estatisticaVolta = linhaDoTempoPorVolta[evento.voltaInicio - 1];
      estatisticaVolta.safetyCars++;
      estatisticaVolta.voltasDeSafetyCar += evento.duracao;
    }
    const possuiSafetyCar = eventosSafetyCar.length > 0;
    const grupoSafetyCar = possuiSafetyCar ? "comSafetyCar" : "semSafetyCar";
    const estatisticasSafetyCar = estatisticasPorSafetyCar[grupoSafetyCar];
    estatisticasSafetyCar.simulacoes++;

    if (possuiSafetyCar) {
      corridasComSafetyCar++;
      totalEventosSafetyCar += eventosSafetyCar.length;
      somaLambdaSafetyCar += ordemDeChegada[0].lambdaSafetyCar;
      for (const evento of eventosSafetyCar) {
        somaVoltaInicioSafetyCar += evento.voltaInicio;
        somaDuracaoSafetyCar += evento.duracao;
        origensSafetyCar[evento.origem]++;
      }
    }

    for (const resultado of gridDeLargada) {
      const acumulador = acumuladores.get(resultado.piloto.piloto);
      const scoreCondicao =
        acumulador.scorePilotoPorCondicao.qualificacao[
          qualyMolhada ? "chuva" : "seco"
        ];
      scoreCondicao.soma += resultado.scoreQualificacao.scorePiloto;
      scoreCondicao.quantidade++;
      acumulador.somaPosicaoLargada += resultado.posicaoLargada;
      acumulador.posicoesQualificacao[resultado.posicaoLargada]++;
      acumulador.melhorPosicaoLargada = Math.min(
        acumulador.melhorPosicaoLargada,
        resultado.posicaoLargada,
      );
      acumulador.piorPosicaoLargada = Math.max(
        acumulador.piorPosicaoLargada,
        resultado.posicaoLargada,
      );
      acumularValores(
        acumulador.scoresQualificacao,
        resultado.scoreQualificacao,
      );
      registrarExtremosFatorRNG(
        acumulador.extremosFatorRNG.qualificacao,
        resultado.scoreQualificacao.fatorRNG,
      );
      const falhaMecanica = resultado.scoreQualificacao.falhaDurabilidade;
      const falhaHumana = resultado.scoreQualificacao.falhaHumana;
      totalFalhasQualificacao +=
        Number(falhaMecanica.ocorreu) + Number(falhaHumana.ocorreu);
      if (falhaMecanica.ocorreu) {
        registrarExtremo(
          acumulador.extremosPenalidadeZ.qualificacao.mecanica,
          falhaMecanica.penalidade,
        );
        registrarExtremo(penalidadeZFalhaCarro, falhaMecanica.penalidade);
      }
      if (falhaHumana.ocorreu) {
        registrarExtremo(
          acumulador.extremosPenalidadeZ.qualificacao.humana,
          falhaHumana.penalidade,
        );
      }
    }

    const vencedor = ordemDeChegada.find(
      (resultado) => !resultado.dnf.ocorreu,
    );
    if (vencedor) {
      vitoriasPorPosicaoLargada[vencedor.posicaoLargada - 1]++;
      estatisticasPorCondicao[
        condicaoCorrida
      ].vitoriasPorPosicaoLargada[vencedor.posicaoLargada - 1]++;
      estatisticasSafetyCar.vitoriasPorPosicaoLargada[
        vencedor.posicaoLargada - 1
      ]++;
      vitoriasPorPiloto.set(
        vencedor.piloto,
        (vitoriasPorPiloto.get(vencedor.piloto) || 0) + 1,
      );
    }

    for (const resultado of ordemDeChegada) {
      const acumulador = acumuladores.get(resultado.piloto);
      const scoreCondicao =
        acumulador.scorePilotoPorCondicao.corrida[
          corridaMolhada ? "chuva" : "seco"
        ];
      scoreCondicao.soma += resultado.scorePiloto;
      scoreCondicao.quantidade++;
      acumulador.posicoesCorridaPorCondicao[condicaoCorrida][
        resultado.posicaoFinal
      ]++;
      acumulador.posicoesCorridaPorSafetyCar[grupoSafetyCar][
        resultado.posicaoFinal
      ]++;
      const estatisticasCondicao = estatisticasPorCondicao[condicaoCorrida];
      estatisticasCondicao.somaPosicaoFinal += resultado.posicaoFinal;
      estatisticasCondicao.somaQuadradosPosicaoFinal +=
        resultado.posicaoFinal ** 2;
      estatisticasCondicao.participacoes++;
      const ultrapassagens = Math.max(0, resultado.variacaoPosicoes);
      estatisticasCondicao.ultrapassagens += ultrapassagens;
      estatisticasSafetyCar.somaPosicaoFinal += resultado.posicaoFinal;
      estatisticasSafetyCar.somaQuadradosPosicaoFinal +=
        resultado.posicaoFinal ** 2;
      estatisticasSafetyCar.participacoes++;
      estatisticasSafetyCar.ultrapassagens += ultrapassagens;
      acumulador.somaPosicaoFinal += resultado.posicaoFinal;
      acumulador.somaPosicaoRitmo += resultado.posicaoRitmo;
      acumulador.somaPosicaoMediaReal += resultado.posicaoMediaReal;
      acumulador.posicoesCorrida[resultado.posicaoFinal]++;
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
        falhaHumana: resultado.falhaHumana,
        scoreAntesRNG: resultado.scoreAntesRNG,
        fatorRNG: resultado.fatorRNG,
        scoreTotal: resultado.scoreTotal,
        penalidadeFalhas: resultado.penalidadeFalhas,
        multiplicadorSeveridadeFalha:
          resultado.multiplicadorSeveridadeFalha,
        bonusOperacoes: resultado.bonusOperacoes,
      });
      registrarExtremosFatorRNG(
        acumulador.extremosFatorRNG.corrida,
        resultado.fatorRNG,
      );
      totalUltrapassagens += ultrapassagens;
      if (resultado.fatorRNG.safetyCar) {
        const rngSafetyCar = acumulador.rngSafetyCar;
        rngSafetyCar.corridas++;
        rngSafetyCar.somaLimite += resultado.fatorRNG.safetyCar.limite;
        rngSafetyCar.somaValor += resultado.fatorRNG.safetyCar.valor;
        rngSafetyCar.somaQuadradosValor +=
          resultado.fatorRNG.safetyCar.valor ** 2;
      }
      const falhaMecanica = resultado.falhaDurabilidade;
      const falhaHumana = resultado.falhaHumana;
      if (resultado.dnfCortadoPeloTeto) {
        totalDNFCortadoPeloTeto++;
      }
      totalFalhas +=
        Number(falhaMecanica.ocorreu) + Number(falhaHumana.ocorreu);
      const falhasModeradasDaCorrida = [
        ["durabilidade", falhaMecanica],
        ["humana", falhaHumana],
      ].filter(([, falha]) => falha.ocorreu && !falha.dnf);
      acumulador.falhasModeradas.total += falhasModeradasDaCorrida.length;
      totalFalhasModeradas += falhasModeradasDaCorrida.length;
      for (const [tipo] of falhasModeradasDaCorrida) {
        if (tipo === "durabilidade") {
          acumulador.falhasModeradas.porFalhaDurabilidade++;
          falhasModeradasDurabilidade++;
        } else {
          acumulador.falhasModeradas.porFalhaHumana++;
          falhasModeradasHumanas++;
        }
      }
      if (resultado.dnf.ocorreu) {
        acumulador.dnf.total++;
        totalDNF++;
        estatisticasCondicao.dnf++;
        estatisticasSafetyCar.dnf++;
        acumulador.dnf.somaVoltaAbandono += resultado.dnf.voltaAbandono;
        somaVoltaAbandono += resultado.dnf.voltaAbandono;
        if (resultado.dnf.causa === "falhaDurabilidade") {
          acumulador.dnf.porFalhaDurabilidade++;
          totalDNFPorFalhaDurabilidade++;
        } else {
          acumulador.dnf.porFalhaHumana++;
          totalDNFPorFalhaHumana++;
        }
      }
      if (falhaMecanica.ocorreu && !falhaMecanica.dnf) {
        registrarExtremo(
          acumulador.extremosPenalidadeZ.corrida.mecanica,
          falhaMecanica.penalidade,
        );
        registrarExtremo(penalidadeZFalhaCarro, falhaMecanica.penalidade);
      }
      if (falhaHumana.ocorreu && !falhaHumana.dnf) {
        registrarExtremo(
          acumulador.extremosPenalidadeZ.corrida.humana,
          falhaHumana.penalidade,
        );
      }
    }
  }

  const estatisticasClima = Object.fromEntries(
    categoriasClima.map((condicao) => {
      const estatisticas = estatisticasPorCondicao[condicao];
      const estatisticasPilotos = [...acumuladores.values()]
        .map((acumulador) =>
          resumirDistribuicaoPosicoes(
            acumulador.posicoesCorridaPorCondicao[condicao],
          ),
        )
        .filter((resultado) => resultado.participacoes > 0);
      const posicaoFinalMedia =
        estatisticas.participacoes > 0
          ? estatisticas.somaPosicaoFinal / estatisticas.participacoes
          : null;
      const variancia =
        estatisticas.participacoes > 0
          ? Math.max(
              0,
              estatisticas.somaQuadradosPosicaoFinal /
                estatisticas.participacoes -
                posicaoFinalMedia ** 2,
            )
          : null;
      const posicaoFinalMediaPorPiloto =
        estatisticasPilotos.length > 0
          ? estatisticasPilotos.reduce(
              (total, resultado) => total + resultado.posicaoFinalMedia,
              0,
            ) / estatisticasPilotos.length
          : null;
      const desvioMedioPosicaoFinal =
        estatisticasPilotos.length > 0
          ? estatisticasPilotos.reduce(
              (total, resultado) =>
                total + resultado.desvioPadraoPosicaoFinal,
              0,
            ) / estatisticasPilotos.length
          : null;

      return [
        condicao,
        {
          simulacoes: estatisticas.simulacoes,
          vitoriasPorPosicaoLargada:
            estatisticas.vitoriasPorPosicaoLargada.map(
              (vitorias, indice) => ({
                posicaoLargada: indice + 1,
                vitorias,
                porcentagem:
                  estatisticas.simulacoes > 0
                    ? arredondarScore(
                        (vitorias / estatisticas.simulacoes) * 100,
                      )
                    : 0,
              }),
            ),
          posicaoFinalMedia:
            posicaoFinalMedia === null
              ? null
              : arredondarScore(posicaoFinalMedia),
          posicaoFinalMediaPorPiloto:
            posicaoFinalMediaPorPiloto === null
              ? null
              : arredondarScore(posicaoFinalMediaPorPiloto),
          desvioPadraoPosicaoFinal:
            variancia === null
              ? null
              : arredondarScore(Math.sqrt(variancia)),
          desvioMedioPosicaoFinal:
            desvioMedioPosicaoFinal === null
              ? null
              : arredondarScore(desvioMedioPosicaoFinal),
          ultrapassagens: estatisticas.ultrapassagens,
          mediaUltrapassagens:
            estatisticas.simulacoes > 0
              ? arredondarScore(
                  estatisticas.ultrapassagens / estatisticas.simulacoes,
                )
              : null,
          participacoes: estatisticas.participacoes,
          dnf: estatisticas.dnf,
          percentualDNF:
            estatisticas.participacoes > 0
              ? arredondarScore(
                  (estatisticas.dnf / estatisticas.participacoes) * 100,
                )
              : null,
        },
      ];
    }),
  );

  const estatisticasSafetyCarResumo = Object.fromEntries(
    Object.entries(estatisticasPorSafetyCar).map(([grupo, estatisticas]) => {
      const distribuicoesPilotos = [...acumuladores.values()]
        .map((acumulador) =>
          resumirDistribuicaoPosicoes(
            acumulador.posicoesCorridaPorSafetyCar[grupo],
          ),
        )
        .filter((resultado) => resultado.participacoes > 0);
      const posicaoFinalMedia =
        estatisticas.participacoes > 0
          ? estatisticas.somaPosicaoFinal / estatisticas.participacoes
          : null;
      const posicaoFinalMediaPorPiloto =
        distribuicoesPilotos.length > 0
          ? distribuicoesPilotos.reduce(
              (total, resultado) => total + resultado.posicaoFinalMedia,
              0,
            ) / distribuicoesPilotos.length
          : null;
      const desvioMedioPosicaoFinal =
        distribuicoesPilotos.length > 0
          ? distribuicoesPilotos.reduce(
              (total, resultado) =>
                total + resultado.desvioPadraoPosicaoFinal,
              0,
            ) / distribuicoesPilotos.length
          : null;

      return [
        grupo,
        {
          simulacoes: estatisticas.simulacoes,
          vitoriasPorPosicaoLargada:
            estatisticas.vitoriasPorPosicaoLargada.map(
              (vitorias, indice) => ({
                posicaoLargada: indice + 1,
                vitorias,
                porcentagem:
                  estatisticas.simulacoes > 0
                    ? arredondarScore(
                        (vitorias / estatisticas.simulacoes) * 100,
                      )
                    : 0,
              }),
            ),
          posicaoFinalMedia:
            posicaoFinalMedia === null
              ? null
              : arredondarScore(posicaoFinalMedia),
          posicaoFinalMediaPorPiloto:
            posicaoFinalMediaPorPiloto === null
              ? null
              : arredondarScore(posicaoFinalMediaPorPiloto),
          desvioPadraoPosicaoFinal:
            estatisticas.participacoes > 0
              ? arredondarScore(
                  Math.sqrt(
                    Math.max(
                      0,
                      estatisticas.somaQuadradosPosicaoFinal /
                        estatisticas.participacoes -
                        posicaoFinalMedia ** 2,
                    ),
                  ),
                )
              : null,
          desvioMedioPosicaoFinal:
            desvioMedioPosicaoFinal === null
              ? null
              : arredondarScore(desvioMedioPosicaoFinal),
          ultrapassagens: estatisticas.ultrapassagens,
          mediaUltrapassagens:
            estatisticas.simulacoes > 0
              ? arredondarScore(
                  estatisticas.ultrapassagens / estatisticas.simulacoes,
                )
              : null,
          participacoes: estatisticas.participacoes,
          dnf: estatisticas.dnf,
          percentualDNF:
            estatisticas.participacoes > 0
              ? arredondarScore(
                  (estatisticas.dnf / estatisticas.participacoes) * 100,
                )
              : null,
        },
      ];
    }),
  );

  const agregarCondicoes = (condicoes) => {
    const agregado = condicoes
      .map((condicao) => estatisticasPorCondicao[condicao])
      .reduce(
        (total, atual) => ({
          simulacoes: total.simulacoes + atual.simulacoes,
          vitoriasPorPosicaoLargada: total.vitoriasPorPosicaoLargada.map(
            (vitorias, indice) =>
              vitorias + atual.vitoriasPorPosicaoLargada[indice],
          ),
          somaPosicaoFinal: total.somaPosicaoFinal + atual.somaPosicaoFinal,
          somaQuadradosPosicaoFinal:
            total.somaQuadradosPosicaoFinal +
            atual.somaQuadradosPosicaoFinal,
          participacoes: total.participacoes + atual.participacoes,
          dnf: total.dnf + atual.dnf,
          ultrapassagens: total.ultrapassagens + atual.ultrapassagens,
        }),
        {
          simulacoes: 0,
          vitoriasPorPosicaoLargada: new Array(pilotos.length).fill(0),
          somaPosicaoFinal: 0,
          somaQuadradosPosicaoFinal: 0,
          participacoes: 0,
          dnf: 0,
          ultrapassagens: 0,
        },
      );
    const media =
      agregado.participacoes > 0
        ? agregado.somaPosicaoFinal / agregado.participacoes
        : null;
    const estatisticasPilotos = [...acumuladores.values()]
      .map((acumulador) => {
        const posicoes = Object.fromEntries(contagensIniciaisPosicoes);
        for (const condicao of condicoes) {
          for (const [posicao, quantidade] of Object.entries(
            acumulador.posicoesCorridaPorCondicao[condicao],
          )) {
            posicoes[posicao] += quantidade;
          }
        }
        return resumirDistribuicaoPosicoes(posicoes);
      })
      .filter((estatisticas) => estatisticas.participacoes > 0);
    const posicaoFinalMediaPorPiloto =
      estatisticasPilotos.reduce(
        (total, estatisticas) => total + estatisticas.posicaoFinalMedia,
        0,
      ) / estatisticasPilotos.length;
    const desvioMedioPosicaoFinal =
      estatisticasPilotos.reduce(
        (total, estatisticas) =>
          total + estatisticas.desvioPadraoPosicaoFinal,
        0,
      ) / estatisticasPilotos.length;

    return {
      simulacoes: agregado.simulacoes,
      vitoriasDaPole: agregado.vitoriasPorPosicaoLargada[0],
      posicaoFinalMediaPorPiloto:
        Number.isFinite(posicaoFinalMediaPorPiloto)
          ? arredondarScore(posicaoFinalMediaPorPiloto)
          : null,
      desvioMedioPosicaoFinal:
        Number.isFinite(desvioMedioPosicaoFinal)
          ? arredondarScore(desvioMedioPosicaoFinal)
          : null,
      posicaoFinalMedia:
        media === null ? null : arredondarScore(media),
      desvioPadraoPosicaoFinal:
        media === null
          ? null
          : arredondarScore(
              Math.sqrt(
                Math.max(
                  0,
                  agregado.somaQuadradosPosicaoFinal /
                    agregado.participacoes -
                    media ** 2,
                ),
              ),
            ),
      participacoes: agregado.participacoes,
      dnf: agregado.dnf,
      percentualDNF:
        agregado.participacoes > 0
          ? arredondarScore(
              (agregado.dnf / agregado.participacoes) * 100,
            )
          : null,
      ultrapassagens: agregado.ultrapassagens,
      mediaUltrapassagens:
        agregado.simulacoes > 0
          ? arredondarScore(agregado.ultrapassagens / agregado.simulacoes)
          : null,
    };
  };

  const comparativoSecoChuva = {
    seco: agregarCondicoes(["seco"]),
    chuva: agregarCondicoes(["garoa", "chuva", "tempestade"]),
  };
  const estatisticasPorCondicaoComSafetyCar = {
    ...estatisticasClima,
    ...estatisticasSafetyCarResumo,
  };

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
      const estatisticasPosicaoFinalPorCondicao = Object.fromEntries(
        categoriasClima.map((condicao) => [
          condicao,
          resumirDistribuicaoPosicoes(
            acumulador.posicoesCorridaPorCondicao[condicao],
          ),
        ]),
      );
      const posicoesCorridaMolhada = Object.fromEntries(
        contagensIniciaisPosicoes,
      );
      for (const condicao of ["garoa", "chuva", "tempestade"]) {
        for (const [posicao, quantidade] of Object.entries(
          acumulador.posicoesCorridaPorCondicao[condicao],
        )) {
          posicoesCorridaMolhada[posicao] += quantidade;
        }
      }

      return {
        piloto: acumulador.piloto,
        equipe: acumulador.equipe,
        posicaoMediaLargada:
          acumulador.somaPosicaoLargada / quantidadeSimulacoes,
        posicaoRitmoMedia:
          acumulador.somaPosicaoRitmo / quantidadeSimulacoes,
        posicaoMediaReal:
          acumulador.somaPosicaoMediaReal / quantidadeSimulacoes,
        posicaoMediaFinal: acumulador.somaPosicaoFinal / quantidadeSimulacoes,
        variacaoPosicoesMedia:
          acumulador.somaVariacaoPosicoes / quantidadeSimulacoes,
        melhorPosicaoLargada: acumulador.melhorPosicaoLargada,
        piorPosicaoLargada: acumulador.piorPosicaoLargada,
        melhorPosicaoFinal: acumulador.melhorPosicaoFinal,
        piorPosicaoFinal: acumulador.piorPosicaoFinal,
        dnf: {
          total: acumulador.dnf.total,
          percentual: arredondarScore(
            (acumulador.dnf.total / quantidadeSimulacoes) * 100,
          ),
          porFalhaDurabilidade: acumulador.dnf.porFalhaDurabilidade,
          porFalhaHumana: acumulador.dnf.porFalhaHumana,
          voltaAbandonoMedia:
            acumulador.dnf.total > 0
              ? arredondarScore(
                  acumulador.dnf.somaVoltaAbandono / acumulador.dnf.total,
                )
              : null,
        },
        incidentes: acumulador.incidentes,
        falhasModeradas: acumulador.falhasModeradas,
        posicoesQualificacao: acumulador.posicoesQualificacao,
        posicoesCorrida: acumulador.posicoesCorrida,
        posicoesCorridaPorCondicao:
          acumulador.posicoesCorridaPorCondicao,
        posicoesCorridaSecoVsChuva: {
          seco: acumulador.posicoesCorridaPorCondicao.seco,
          chuva: posicoesCorridaMolhada,
        },
        estatisticasPosicaoFinalPorCondicao,
        condicoesPista: {
          qualysNaChuva: totalQualysNaChuva,
          qualificacao: calcularComparativoScorePiloto(
            acumulador.scorePilotoPorCondicao.qualificacao,
          ),
          corrida: calcularComparativoScorePiloto(
            acumulador.scorePilotoPorCondicao.corrida,
          ),
        },
        scores: {
          qualificacao: formatarScoreQualificacao(
            scoresQualificacao,
            acumulador.extremosPenalidadeZ.qualificacao,
            acumulador.extremosFatorRNG.qualificacao,
          ),
          corrida: {
            scorePosInicial: arredondarZ(scoresCorrida.scorePosInicial),
            contribuicaoPosInicial: arredondarZ(
              scoresCorrida.contribuicaoPosInicial,
            ),
            scorePiloto: arredondarZ(scoresCorrida.scorePiloto),
            scoreEquipe: arredondarZ(scoresCorrida.scoreEquipe),
            scorePilotoBruto: arredondarScore(scoresCorrida.scorePilotoBruto),
            scoreEquipeBruto: arredondarScoreBruto(
              scoresCorrida.scoreEquipeBruto,
            ),
            contribuicaoPiloto: arredondarZ(scoresCorrida.contribuicaoPiloto),
            contribuicaoEquipe: arredondarZ(scoresCorrida.contribuicaoEquipe),
            falhaDurabilidade: formatarFalhaDurabilidade(
              scoresCorrida.falhaDurabilidade,
              acumulador.extremosPenalidadeZ.corrida.mecanica,
            ),
            falhaHumana: formatarFalhaDurabilidade(
              scoresCorrida.falhaHumana,
              acumulador.extremosPenalidadeZ.corrida.humana,
            ),
            scoreAntesRNG: arredondarZ(scoresCorrida.scoreAntesRNG),
            fatorRNG: formatarFatorRNG(
              scoresCorrida.fatorRNG,
              acumulador.rngSafetyCar,
            ),
            scoreTotal: arredondarZ(scoresCorrida.scoreTotal),
            penalidadeFalhas: arredondarZ(
              scoresCorrida.penalidadeFalhas,
            ),
            multiplicadorSeveridadeFalha:
              configuracao.multiplicadorSeveridadeFalha,
            bonusOperacoes: arredondarZ(scoresCorrida.bonusOperacoes ?? 0),
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
    pesoReferenciaFalha: CONFIG_FALHAS.pesoReferenciaCorrida,
    pesoReferenciaFalhaQualificacao:
      CONFIG_FALHAS.pesoReferenciaQualificacao,
    pesoReferenciaFalhaCorrida: CONFIG_FALHAS.pesoReferenciaCorrida,
    multiplicadorSeveridadeFalha:
      configuracao.multiplicadorSeveridadeFalha,
    penalidadeZFalhaCarroMinima:
      penalidadeZFalhaCarro.minima === null
        ? null
        : arredondarZ(penalidadeZFalhaCarro.minima),
    penalidadeZFalhaCarroMaxima:
      penalidadeZFalhaCarro.maxima === null
        ? null
        : arredondarZ(penalidadeZFalhaCarro.maxima),
    linhaDoTempo: {
      tipo: "contagens acumuladas entre as simulacoes",
      voltas: linhaDoTempoPorVolta.filter(
        (volta) =>
          volta.gruposIncidentes > 0 || volta.safetyCars > 0,
      ),
    },
    informacoesGerais: {
      mediaFatorEventoOperacoes: arredondarScore(
        somaFatorEventoOperacoes / quantidadeSimulacoes,
      ),
      qualificacao: {
        mediaUltrapassagens: 0,
        mediaFalhas: totalFalhasQualificacao / quantidadeSimulacoes,
        qualysNaChuva: totalQualysNaChuva,
        contagemCondicoesClima: contagemClimaQualificacao,
      },
      corrida: {
        mediaUltrapassagens: totalUltrapassagens / quantidadeSimulacoes,
        mediaFalhas: totalFalhas / quantidadeSimulacoes,
        mediaFatorEventoOperacoes: arredondarScore(
          somaFatorEventoOperacoes / quantidadeSimulacoes,
        ),
        contagemCondicoesClima: contagemClimaCorrida,
        combinacoesClima,
        estatisticasPorCondicao: estatisticasPorCondicaoComSafetyCar,
        comparativoSecoChuva,
        safetyCar: {
          corridas: corridasComSafetyCar,
          percentual: arredondarScore(
            (corridasComSafetyCar / quantidadeSimulacoes) * 100,
          ),
          eventos: totalEventosSafetyCar,
          mediaEventosPorCorrida:
            arredondarScore(totalEventosSafetyCar / quantidadeSimulacoes),
          voltaMediaInicio:
            totalEventosSafetyCar > 0
              ? arredondarScore(
                  somaVoltaInicioSafetyCar / totalEventosSafetyCar,
                )
              : null,
          duracaoMedia:
            totalEventosSafetyCar > 0
              ? arredondarScore(somaDuracaoSafetyCar / totalEventosSafetyCar)
              : null,
          lambdaMedio:
            corridasComSafetyCar > 0
              ? arredondarZ(somaLambdaSafetyCar / corridasComSafetyCar)
              : null,
          porOrigem: origensSafetyCar,
        },
        dnf: {
          total: totalDNF,
          cortadosPeloTeto: totalDNFCortadoPeloTeto,
          tetoConfiguracao: configuracao.teto_dnf ?? DNF_TETO,
          percentualParticipacoes: arredondarScore(
            (totalDNF / (quantidadeSimulacoes * pilotos.length)) * 100,
          ),
          porFalhaDurabilidade: totalDNFPorFalhaDurabilidade,
          porFalhaHumana: totalDNFPorFalhaHumana,
          voltaAbandonoMedia:
            totalDNF > 0
              ? arredondarScore(somaVoltaAbandono / totalDNF)
              : null,
        },
        falhasModeradas: {
          total: totalFalhasModeradas,
          porFalhaDurabilidade: falhasModeradasDurabilidade,
          porFalhaHumana: falhasModeradasHumanas,
          mediaPorParticipacao:
            totalFalhasModeradas /
            (quantidadeSimulacoes * pilotos.length),
        },
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

  const pastaSaida = path.join(__dirname, "outputs", "index");
  fs.mkdirSync(pastaSaida, { recursive: true });
  const nomeArquivo = criarNomeArquivo(configuracao.GP).replace(
    /^resultados_/,
    modoSeco ? "resultados_secos_" : "resultados_",
  );
  fs.writeFileSync(
    path.join(pastaSaida, nomeArquivo),
    `${JSON.stringify(resultados, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Médias de ${quantidadeSimulacoes} simulações - GP ${configuracao.GP}`,
  );
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
      DNF: resultado.dnf.total,
      ScoreQualy: resultado.scores.qualificacao.scoreTotal,
      ScoreCorrida: resultado.scores.corrida.scoreTotal,
    })),
  );

  console.log("Informações gerais:");
  console.table(resultados.informacoesGerais);
  console.log("Comparativo seco × chuva:");
  console.table(
    Object.entries(comparativoSecoChuva).map(([condicao, estatisticas]) => ({
      Condicao: condicao,
      VitoriasDaPole: estatisticas.vitoriasDaPole,
      PosicaoFinalMediaPorPiloto: estatisticas.posicaoFinalMediaPorPiloto,
      DesvioMedioPosicaoFinal: estatisticas.desvioMedioPosicaoFinal,
      PercentualDNF: estatisticas.percentualDNF,
    })),
  );
  console.log("Vitórias por piloto:");
  console.table(resultados.informacoesGerais.corrida.vitoriasPorPiloto);
  console.log("Vitórias por posição de largada:");
  console.table(resultados.informacoesGerais.corrida.vitoriasPorPosicaoLargada);
}

if (!gpSelecionado && !modoSeco) {
  const pastaSaida = path.join(__dirname, "outputs", "index");
  fs.mkdirSync(pastaSaida, { recursive: true });
  fs.writeFileSync(
    path.join(pastaSaida, "resultados_equipes.json"),
    `${JSON.stringify({ circuitos: resultadosEquipesPorGP }, null, 2)}\n`,
    "utf8",
  );
}
