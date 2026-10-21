const gerarRuido = require("./gerarRuido");
const {
  OPERACOES_MEDIA_EQUIPES,
  SC_FRACAO_INICIO,
} = require("./configuracoes");

const aplicarSafetyCarAoScore = (
  score,
  equipe,
  pesosGeraisCorrida,
  eventosSafetyCar,
  quantidadeVoltas,
  lambdaSafetyCar,
) => {
  if (eventosSafetyCar.length === 0) return score;
  if (
    typeof pesosGeraisCorrida.RngSafetyCar !== "number" ||
    !Number.isFinite(pesosGeraisCorrida.RngSafetyCar) ||
    pesosGeraisCorrida.RngSafetyCar < 0
  ) {
    throw new Error("RngSafetyCar ausente ou inválido na configuração.");
  }

  const ruidoPorEvento = eventosSafetyCar.map((evento) => {
    const atenuacao =
      SC_FRACAO_INICIO > 0
        ? Math.min(
            1,
            evento.voltaInicio / (SC_FRACAO_INICIO * quantidadeVoltas),
          )
        : 1;
    const ruido = gerarRuido(
      equipe.operacoes,
      pesosGeraisCorrida.RngSafetyCar,
      "safetycar",
      OPERACOES_MEDIA_EQUIPES,
    );
    return {
      limite: ruido.limite * atenuacao,
      valor: ruido.valor * atenuacao,
    };
  });
  const valorSafetyCar = ruidoPorEvento.reduce(
    (total, ruido) => total + ruido.valor,
    0,
  );
  const limiteSafetyCar = ruidoPorEvento.reduce(
    (total, ruido) => total + ruido.limite,
    0,
  );
  const fatorRNG = {
    ...score.fatorRNG,
    safetyCar: { limite: limiteSafetyCar, valor: valorSafetyCar },
    valor: score.fatorRNG.valor + valorSafetyCar,
  };

  return {
    ...score,
    fatorRNG,
    lambdaSafetyCar,
    scoreTotal:
      score.scoreAntesRNG * lambdaSafetyCar +
      fatorRNG.valor -
      score.penalidadeFalhas,
  };
};

module.exports = aplicarSafetyCarAoScore;
