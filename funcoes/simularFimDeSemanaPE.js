const calcularGridDeLargada = require("./calcularGridDeLargada");
const calcularOrdemDeChegada = require("./calcularOrdemDeChegada");

const simularFimDeSemanaPE = ({
  configuracao,
  pilotos,
  equipePorNome,
  clima,
  safetyCarAtivo = true,
}) => {
  const pcQualy = clima === "seco" ? 0 : 1;
  const pcCorrida = clima === "seco" ? 0 : 1;
  const grid = calcularGridDeLargada(
    configuracao,
    pilotos,
    equipePorNome,
    pcQualy,
  );
  const ordem = calcularOrdemDeChegada(
    grid,
    configuracao.pesos.corrida,
    pcCorrida,
    configuracao.multiplicadorSeveridadeFalha,
    configuracao.voltas,
    {
      teto_dnf: configuracao.teto_dnf,
      safetyCarAtivo,
      intensidadeOperacoes: configuracao.intensidadeOperacoes,
    },
  );
  const posicoesQualy = new Map(
    grid.map((resultado) => [
      resultado.piloto.piloto,
      resultado.posicaoLargada,
    ]),
  );

  return {
    clima,
    safetyCar: (ordem[0]?.eventosSafetyCar ?? []).length > 0,
    resultados: ordem.map((resultado, indice) => ({
      piloto: resultado.piloto,
      equipe: resultado.equipe,
      qualificacao: { posicao: posicoesQualy.get(resultado.piloto) },
      corrida: {
        posicaoLargada: resultado.posicaoLargada,
        posicaoFinal: indice + 1,
        dnf: resultado.dnf.ocorreu
          ? resultado.dnf.causa === "falhaDurabilidade"
            ? "mecanico"
            : "humano"
          : null,
        falhaHumanaModerada:
          resultado.falhaHumana.ocorreu && !resultado.falhaHumana.dnf,
        falhaMecanicaModerada:
          resultado.falhaDurabilidade.ocorreu &&
          !resultado.falhaDurabilidade.dnf,
        falhaHumana: resultado.falhaHumana.ocorreu,
        falhaMecanica: resultado.falhaDurabilidade.ocorreu,
      },
      safetyCar: (ordem[0]?.eventosSafetyCar ?? []).length > 0,
    })),
  };
};

module.exports = simularFimDeSemanaPE;
