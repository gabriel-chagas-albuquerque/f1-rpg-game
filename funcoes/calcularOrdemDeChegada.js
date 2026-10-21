const calcularScore = require("./calcularScore");
const calcularZScores = require("./calcularZScores");
const calcularScoreCorrida = require("./calcularScoreCorrida");
const compararResultadosCorrida = require("./compararResultadosCorrida");
const aplicarEfeitosChuva = require("./aplicarEfeitosChuva");
const { atributosEquipe, atributosPiloto } = require("./configuracoes");
const aplicarSafetyCarAoScore = require("./aplicarSafetyCarAoScore");
const resolverTimelineCorrida = require("./resolverTimelineCorrida");
const sortearFalhasCorrida = require("./sortearFalhasCorrida");
const calcularLambdaSafetyCar = require("./calcularLambdaSafetyCar");
const determinarDNF = require("./determinarDNF");
const aplicarTetoDNF = require("./aplicarTetoDNF");
const calcularMediaEsperadaDNF = require("./calcularMediaEsperadaDNF");
const calcularTetoDNF = require("./calcularTetoDNF");
const { DNF_TETO } = require("./configuracoes");
const pesosEquipeParaScore = require("./pesosEquipeParaScore");
const calcularBonusOperacoes = require("./calcularBonusOperacoes");

const calcularOrdemDeChegada = (
  gridDeLargada,
  pesosCorrida,
  pesoChuva = 0,
  multiplicadorSeveridadeFalha = 1,
  quantidadeVoltas = 1,
  opcoes = {},
) => {
  const {
    teto_dnf = null,
    safetyCarAtivo = true,
    intensidadeOperacoes = null,
  } = opcoes;
  const configOperacoes =
    opcoes.configOperacoes ??
    (opcoes.ATIVAR_BONUS_OPERACOES !== undefined ? opcoes : undefined);
  let intensidadeOps =
    intensidadeOperacoes ?? pesosCorrida?.intensidadeOperacoes;
  if (typeof intensidadeOps !== "number" || !Number.isFinite(intensidadeOps)) {
    console.warn(
      "Aviso: intensidadeOperacoes ausente na configuração da corrida; usando 1.",
    );
    intensidadeOps = 1;
  }

  const pesosCorridaAjustados =
    pesoChuva > 0
      ? aplicarEfeitosChuva(pesosCorrida, false, pesoChuva)
      : pesosCorrida;
  const mediaDNF =
    teto_dnf == null && DNF_TETO.modo === "dinamico"
      ? calcularMediaEsperadaDNF(
          gridDeLargada,
          pesosCorridaAjustados.falhas,
        )
      : 0;
  const tetoAplicado =
    teto_dnf == null
      ? calcularTetoDNF(mediaDNF)
      : calcularTetoDNF(undefined, {
          ...DNF_TETO,
          modo: "fixo",
          fixo: teto_dnf,
        });
  const falhasPorPiloto = gridDeLargada.map(({ piloto, equipe }) =>
    sortearFalhasCorrida(
      piloto,
      equipe,
      pesosCorridaAjustados,
      quantidadeVoltas,
    ),
  );
  const candidatosDNF = falhasPorPiloto
    .map((falhas, indicePiloto) => ({ falhas, indicePiloto }))
    .filter(({ falhas }) => falhas.dnf.ocorreu);
  const { cortados } = aplicarTetoDNF(candidatosDNF, tetoAplicado);
  const indicesCortados = new Set(
    cortados.map(({ indicePiloto }) => indicePiloto),
  );
  for (const { falhas, indicePiloto } of cortados) {
    for (const falha of [falhas.falhaDurabilidade, falhas.falhaHumana]) {
      if (!falha.dnf) continue;
      falha.dnf = false;
      falha.voltaAbandono = null;
      falha.penalidade =
        pesosCorridaAjustados.falhas.PenalidadeZMin +
        Math.random() *
          (pesosCorridaAjustados.falhas.PenalidadeZMax -
            pesosCorridaAjustados.falhas.PenalidadeZMin);
      falha.dnfCortadoPeloTeto = true;
    }
    falhas.dnf = determinarDNF(falhas.falhaDurabilidade, falhas.falhaHumana);
    falhas.dnfCortadoPeloTeto = true;
    falhasPorPiloto[indicePiloto] = falhas;
  }

  const pesosCorridaEquipeScore = pesosEquipeParaScore(
    pesosCorridaAjustados.equipe,
    configOperacoes,
  );

  const scoresBrutos = gridDeLargada.map(({ piloto, equipe }) => ({
    piloto,
    equipe,
    scorePilotoBruto: calcularScore(
      piloto,
      pesosCorridaAjustados.piloto,
      atributosPiloto,
    ),
    scoreEquipeBruto: calcularScore(
      equipe,
      pesosCorridaEquipeScore,
      atributosEquipe,
    ),
  }));
  const zPilotos = calcularZScores(
    scoresBrutos.map((resultado) => resultado.scorePilotoBruto),
  );
  const zEquipes = calcularZScores(
    scoresBrutos.map((resultado) => resultado.scoreEquipeBruto),
  );
  const zPosicoes = calcularZScores(
    gridDeLargada.map((resultado) => -resultado.posicaoLargada),
  );
  const zOperacoes = calcularZScores(
    gridDeLargada.map((resultado) => resultado.equipe.operacoes),
  );

  const resultadosComScoreBase = gridDeLargada
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
        pesosCorridaAjustados,
        multiplicadorSeveridadeFalha,
        quantidadeVoltas,
        {
          falhasSorteadas: falhasPorPiloto[indice],
        },
      ),
      dnfCortadoPeloTeto: indicesCortados.has(indice),
      tetoDNF: tetoAplicado,
    }));
  const posicaoRitmoPorPiloto = new Map(
    [...resultadosComScoreBase]
      .sort(
        (a, b) =>
          b.scoreTotal - a.scoreTotal ||
          a.posicaoLargada - b.posicaoLargada,
      )
      .map((resultado, indice) => [resultado.piloto, indice + 1]),
  );
  const resultadosComPosicaoMedia = resultadosComScoreBase.map((resultado) => {
    const posicaoRitmo = posicaoRitmoPorPiloto.get(resultado.piloto);
    return {
      ...resultado,
      posicaoRitmo,
      posicaoMediaReal: (resultado.posicaoLargada + posicaoRitmo) / 2,
    };
  });
  const { eventos, eventosSafetyCar } = resolverTimelineCorrida(
    resultadosComPosicaoMedia,
    quantidadeVoltas,
    Math.random,
    safetyCarAtivo,
  );
  const lambdaSafetyCar = calcularLambdaSafetyCar(
    eventosSafetyCar,
    quantidadeVoltas,
  );

  const houveSafetyCar = eventosSafetyCar.length > 0;

  return resultadosComPosicaoMedia
    .map((resultado, indice) => {
      const scoreRitmoBase = resultado.scoreTotal;
      const comSC = aplicarSafetyCarAoScore(
        resultado,
        gridDeLargada.find(
          (item) => item.piloto.piloto === resultado.piloto,
        ).equipe,
        pesosCorridaAjustados.pesosGerais,
        eventosSafetyCar,
        quantidadeVoltas,
        lambdaSafetyCar,
      );

      const bonusOps = calcularBonusOperacoes({
        zOperacoes: zOperacoes[indice],
        intensidadePista: intensidadeOps,
        sessao: "corrida",
        safetyCar: houveSafetyCar,
        intensidadeChuva: pesoChuva,
        config: configOperacoes,
      });

      return {
        ...comSC,
        scoreTotal: comSC.scoreTotal + bonusOps.bonus,
        bonusOperacoes: bonusOps.bonus,
        fatorEventoOperacoes: bonusOps.fatorEvento,
        scoreRitmoBase,
        eventos,
        eventosSafetyCar,
        lambdaSafetyCar,
      };
    })
    .sort(compararResultadosCorrida);
};

module.exports = calcularOrdemDeChegada;
