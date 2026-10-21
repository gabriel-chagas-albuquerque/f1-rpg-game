const calcularScore = require("./calcularScore");
const calcularZScores = require("./calcularZScores");
const calcularScoreQualificacao = require("./calcularScoreQualificacao");
const aplicarEfeitosChuva = require("./aplicarEfeitosChuva");
const { atributosEquipe, atributosPiloto } = require("./configuracoes");
const pesosEquipeParaScore = require("./pesosEquipeParaScore");
const calcularBonusOperacoes = require("./calcularBonusOperacoes");

const calcularGridDeLargada = (
  configuracao,
  pilotos,
  equipePorNome,
  pesoChuva = 0,
  opcoes = {},
) => {
  const configOperacoes =
    opcoes.configOperacoes ??
    (opcoes.ATIVAR_BONUS_OPERACOES !== undefined ? opcoes : undefined);
  let intensidadeOperacoes = configuracao?.intensidadeOperacoes;
  if (
    typeof intensidadeOperacoes !== "number" ||
    !Number.isFinite(intensidadeOperacoes)
  ) {
    console.warn(
      `Aviso: intensidadeOperacoes ausente para o GP ${configuracao?.GP ?? "desconhecido"}; usando 1.`,
    );
    intensidadeOperacoes = 1;
  }

  const pesosQualificacao =
    pesoChuva > 0
      ? aplicarEfeitosChuva(configuracao.pesos.qualificacao, true, pesoChuva)
      : configuracao.pesos.qualificacao;

  const pesosEquipeScore = pesosEquipeParaScore(
    pesosQualificacao.equipe,
    configOperacoes,
  );

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
        pesosEquipeScore,
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
  const zOperacoes = calcularZScores(
    scoresBrutos.map((resultado) => resultado.equipe.operacoes),
  );

  return scoresBrutos
    .map((resultado, indice) => {
      const scoreQualificacao = calcularScoreQualificacao(
        resultado.piloto,
        resultado.equipe,
        resultado.scorePilotoBruto,
        resultado.scoreEquipeBruto,
        zPilotos[indice],
        zEquipes[indice],
        pesosQualificacao,
        configuracao.multiplicadorSeveridadeFalha,
        configuracao.voltas,
      );

      const bonusOps = calcularBonusOperacoes({
        zOperacoes: zOperacoes[indice],
        intensidadePista: intensidadeOperacoes,
        sessao: "qualificacao",
        safetyCar: false,
        intensidadeChuva: pesoChuva,
        config: configOperacoes,
      });

      scoreQualificacao.bonusOperacoes = bonusOps.bonus;
      scoreQualificacao.fatorEventoOperacoes = bonusOps.fatorEvento;
      scoreQualificacao.scoreTotal += bonusOps.bonus;

      return {
        ...resultado,
        scoreQualificacao,
      };
    })
    .sort(
      (a, b) => b.scoreQualificacao.scoreTotal - a.scoreQualificacao.scoreTotal,
    )
    .map((resultado, indice) => ({ ...resultado, posicaoLargada: indice + 1 }));
};

module.exports = calcularGridDeLargada;
