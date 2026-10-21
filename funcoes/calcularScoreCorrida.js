const gerarFatorRNG = require("./gerarFatorRNG");
const sortearFalhasCorrida = require("./sortearFalhasCorrida");
const calcularPenalidadeScoreFalhas = require("./calcularPenalidadeScoreFalhas");
const CONFIG_FALHAS = require("./configFalhas");

const calcularScoreCorrida = (
  piloto,
  equipe,
  zPosicaoInicial,
  scorePilotoBruto,
  scoreEquipeBruto,
  zPiloto,
  zEquipe,
  pesosCorrida,
  multiplicadorSeveridadeFalha = 1,
  quantidadeVoltas = 1,
  opcoes = {},
) => {
  const pesosGeraisCorrida = pesosCorrida.pesosGerais;
  if (
    typeof pesosGeraisCorrida.WPosInicial !== "number" ||
    typeof pesosGeraisCorrida.WPiloto !== "number" ||
    typeof pesosGeraisCorrida.WEquipe !== "number"
  ) {
    throw new Error("Pesos da corrida ausentes ou inválidos na configuração.");
  }

  const falhasSorteadas =
    opcoes.falhasSorteadas ??
    sortearFalhasCorrida(piloto, equipe, pesosCorrida, quantidadeVoltas);
  const { falhaDurabilidade, falhaHumana, dnf } = falhasSorteadas;
  const scoreEquipe = zEquipe;
  const scorePiloto = zPiloto;
  const penalidadeFalhas = calcularPenalidadeScoreFalhas(
    falhaDurabilidade,
    falhaHumana,
    multiplicadorSeveridadeFalha,
    dnf.ocorreu,
    CONFIG_FALHAS.pesoReferenciaCorrida,
  );

  const contribuicaoPosInicial =
    zPosicaoInicial * pesosGeraisCorrida.WPosInicial;
  const contribuicaoPiloto = scorePiloto * pesosGeraisCorrida.WPiloto;
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
    scorePiloto,
    scoreEquipe,
    scorePilotoBruto,
    scoreEquipeBruto,
    contribuicaoPiloto,
    contribuicaoEquipe,
    falhaDurabilidade,
    falhaHumana,
    dnf,
    penalidadeFalhas,
    multiplicadorSeveridadeFalha,
    scoreAntesRNG,
    fatorRNG,
    lambdaSafetyCar: 1,
    scoreTotal:
      scoreAntesRNG + fatorRNG.valor - penalidadeFalhas,
  };
};

module.exports = calcularScoreCorrida;
