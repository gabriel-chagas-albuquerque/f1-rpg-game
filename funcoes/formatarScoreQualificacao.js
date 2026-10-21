const arredondarScore = require("./arredondarScore");
const arredondarScoreBruto = require("./arredondarScoreBruto");
const arredondarZ = require("./arredondarZ");
const formatarFalhaDurabilidade = require("./formatarFalhaDurabilidade");
const formatarFatorRNG = require("./formatarFatorRNG");

const formatarScoreQualificacao = (score, extremosPenalidadeZ) => ({
  scorePiloto: arredondarZ(score.scorePiloto),
  scoreEquipe: arredondarZ(score.scoreEquipe),
  scorePilotoBruto: arredondarScore(score.scorePilotoBruto),
  scoreEquipeBruto: arredondarScoreBruto(score.scoreEquipeBruto),
  contribuicaoPiloto: arredondarZ(score.contribuicaoPiloto),
  contribuicaoEquipe: arredondarZ(score.contribuicaoEquipe),
  falhaDurabilidade: formatarFalhaDurabilidade(
    score.falhaDurabilidade,
    extremosPenalidadeZ.mecanica,
  ),
  falhaHumana: formatarFalhaDurabilidade(
    score.falhaHumana,
    extremosPenalidadeZ.humana,
  ),
  scoreAntesRNG: arredondarZ(score.scoreAntesRNG),
  fatorRNG: formatarFatorRNG(score.fatorRNG),
  scoreTotal: arredondarZ(score.scoreTotal),
  penalidadeFalhas: arredondarZ(score.penalidadeFalhas),
  multiplicadorSeveridadeFalha: score.multiplicadorSeveridadeFalha,
  bonusOperacoes: arredondarZ(score.bonusOperacoes ?? 0),
});

module.exports = formatarScoreQualificacao;
