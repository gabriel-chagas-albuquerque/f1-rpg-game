const arredondarZ = require("./arredondarZ");
const formatarRuido = require("./formatarRuido");

const formatarFatorRNG = (fatorRNG, estatisticasSafetyCar) => ({
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
  ...(estatisticasSafetyCar && {
    safetyCar: {
      limite:
        estatisticasSafetyCar.corridas > 0
          ? arredondarZ(
              estatisticasSafetyCar.somaLimite /
                estatisticasSafetyCar.corridas,
            )
          : null,
      valor: {
        media:
          estatisticasSafetyCar.corridas > 0
            ? arredondarZ(
                estatisticasSafetyCar.somaValor /
                  estatisticasSafetyCar.corridas,
              )
            : null,
        desvio:
          estatisticasSafetyCar.corridas > 0
            ? arredondarZ(
                Math.sqrt(
                  Math.max(
                    0,
                    estatisticasSafetyCar.somaQuadradosValor /
                      estatisticasSafetyCar.corridas -
                      (estatisticasSafetyCar.somaValor /
                        estatisticasSafetyCar.corridas) **
                        2,
                  ),
                ),
              )
            : null,
      },
    },
  }),
});

module.exports = formatarFatorRNG;