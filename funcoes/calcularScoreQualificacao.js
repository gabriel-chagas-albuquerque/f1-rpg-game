const gerarFatorRNG = require("./gerarFatorRNG");
const calcularFalha = require("./calcularFalha");
const calcularPenalidadeScoreFalhas = require("./calcularPenalidadeScoreFalhas");
const CONFIG_FALHAS = require("./configFalhas");

const calcularScoreQualificacao = (
  piloto,
  equipe,
  scorePilotoBruto,
  scoreEquipeBruto,
  zPiloto,
  zEquipe,
  pesosQualificacao,
  multiplicadorSeveridadeFalha = 1,
  quantidadeVoltas = 1,
) => {
  const pesosGeraisQualificacao = pesosQualificacao.pesosGerais;
  const falhas = pesosQualificacao.falhas;
  const falhaDurabilidade = calcularFalha(
    falhas,
    "Mecanica",
    equipe.durabilidade,
    "falha mecânica na qualificação",
    quantidadeVoltas,
  );
  const falhaHumana = calcularFalha(
    falhas,
    "Humana",
    piloto.consistencia,
    "falha humana na qualificação",
    quantidadeVoltas,
  );
  const scoreEquipe = zEquipe;
  const scorePiloto = zPiloto;
  const penalidadeFalhas = calcularPenalidadeScoreFalhas(
    falhaDurabilidade,
    falhaHumana,
    multiplicadorSeveridadeFalha,
    false,
    CONFIG_FALHAS.pesoReferenciaQualificacao,
  );

  const contribuicaoPiloto = scorePiloto * pesosGeraisQualificacao.WPiloto;
  const contribuicaoEquipe = scoreEquipe * pesosGeraisQualificacao.WEquipe;
  const fatorRNG = gerarFatorRNG(
    piloto,
    equipe,
    pesosGeraisQualificacao,
    pesosQualificacao.equipe,
  );
  const scoreAntesRNG = contribuicaoPiloto + contribuicaoEquipe;

  return {
    scorePiloto,
    scoreEquipe,
    scorePilotoBruto,
    scoreEquipeBruto,
    contribuicaoPiloto,
    contribuicaoEquipe,
    falhaDurabilidade,
    falhaHumana,
    scoreAntesRNG,
    fatorRNG,
    penalidadeFalhas,
    multiplicadorSeveridadeFalha,
    scoreTotal: scoreAntesRNG + fatorRNG.valor - penalidadeFalhas,
  };
};

module.exports = calcularScoreQualificacao;
