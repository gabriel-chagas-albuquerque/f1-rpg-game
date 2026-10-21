const { calcularPontos } = require("./calcularClassificacaoCampeonato");

const encontrarCompanheiroEquipe = (pilotos, nomePiloto) => {
  const piloto = pilotos.find((item) => item.piloto === nomePiloto);
  if (!piloto) {
    throw new Error(`Piloto "${nomePiloto}" não encontrado na lista.`);
  }

  const companheiros = pilotos.filter(
    (item) => item.equipe === piloto.equipe && item.piloto !== nomePiloto,
  );
  if (companheiros.length !== 1) {
    throw new Error(
      `Esperado exatamente um companheiro para ${nomePiloto} na equipe ${piloto.equipe}; encontrados ${companheiros.length}.`,
    );
  }

  return { piloto, companheiro: companheiros[0] };
};

const percentagem = (numerador, denominador) =>
  denominador === 0 ? 0 : arredondar2((numerador / denominador) * 100);
const arredondar2 = (valor) => Math.round(valor * 100) / 100;

const calcularMetricasDuplaPilotos = (
  circuitos,
  pilotoPrincipal,
  companheiro,
) => {
  if (!Array.isArray(circuitos)) {
    throw new Error("Os resultados dos circuitos devem ser uma lista.");
  }

  const dados = [pilotoPrincipal, companheiro].map((piloto) => ({
    piloto: piloto.piloto,
    equipe: piloto.equipe,
    posicoesLargada: [],
    posicoesCorrida: [],
    ganhosPosicao: [],
    pontos: 0,
    q2: 0,
    q3: 0,
    top10: 0,
    top5: 0,
    vitoriasQualy: 0,
    vitoriasCorrida: 0,
    corridasComFalhaHumana: 0,
    dnfsErroHumano: 0,
    dnfsFalhaMecanica: 0,
  }));
  const [dadosPiloto, dadosCompanheiro] = dados;

  for (const circuito of circuitos) {
    if (!Array.isArray(circuito.classificacao)) {
      throw new Error(
        `Classificação ausente ou inválida para ${circuito.GP ?? "circuito"}.`,
      );
    }

    const resultadoPiloto = circuito.classificacao.find(
      (resultado) => resultado.piloto === pilotoPrincipal.piloto,
    );
    const resultadoCompanheiro = circuito.classificacao.find(
      (resultado) => resultado.piloto === companheiro.piloto,
    );
    if (!resultadoPiloto || !resultadoCompanheiro) {
      throw new Error(
        `Resultado de ${pilotoPrincipal.piloto} ou ${companheiro.piloto} ausente no GP ${circuito.GP}.`,
      );
    }

    const resultadosDupla = [
      [dadosPiloto, resultadoPiloto],
      [dadosCompanheiro, resultadoCompanheiro],
    ];

    for (const [dadosPilotoCorrida, resultado] of resultadosDupla) {
      dadosPilotoCorrida.posicoesLargada.push(resultado.largada);
      dadosPilotoCorrida.posicoesCorrida.push(resultado.posicao);
      dadosPilotoCorrida.ganhosPosicao.push(resultado.largada - resultado.posicao);
      dadosPilotoCorrida.pontos += calcularPontos(resultado);

      if (resultado.largada <= 16) dadosPilotoCorrida.q2++;
      if (resultado.largada <= 10) dadosPilotoCorrida.q3++;
      if (resultado.status === "finalizado") {
        if (resultado.posicao <= 10) dadosPilotoCorrida.top10++;
        if (resultado.posicao <= 5) dadosPilotoCorrida.top5++;
      }
      if (resultado.falhaHumana) {
        dadosPilotoCorrida.corridasComFalhaHumana++;
      }
      if (resultado.status === "dnf") {
        if (resultado.motivo === "erro humano") {
          dadosPilotoCorrida.dnfsErroHumano++;
        } else if (resultado.motivo === "falha mecânica") {
          dadosPilotoCorrida.dnfsFalhaMecanica++;
        }
      }
    }

    const pilotoVenceuQualy =
      resultadoPiloto.largada < resultadoCompanheiro.largada;
    const pilotoVenceuCorrida =
      resultadoPiloto.posicao < resultadoCompanheiro.posicao;

    if (pilotoVenceuQualy) {
      dadosPiloto.vitoriasQualy++;
    } else if (resultadoCompanheiro.largada < resultadoPiloto.largada) {
      dadosCompanheiro.vitoriasQualy++;
    }

    if (pilotoVenceuCorrida) {
      dadosPiloto.vitoriasCorrida++;
    } else if (resultadoCompanheiro.posicao < resultadoPiloto.posicao) {
      dadosCompanheiro.vitoriasCorrida++;
    }
  }

  const totalCorridas = circuitos.length;
  const montarResultado = (dadosPiloto, dadosCompanheiro) => {
    return {
      piloto: dadosPiloto.piloto,
      equipe: dadosPiloto.equipe,
      qualificacao: {
        diferencaMediaPosicao: mediaDiferencaPosicoes(
          dadosPiloto.posicoesLargada,
          dadosCompanheiro.posicoesLargada,
        ),
        vitorias: dadosPiloto.vitoriasQualy,
        taxaVitoriasPercentual: percentagem(
          dadosPiloto.vitoriasQualy,
          totalCorridas,
        ),
        aparicoesQ2: dadosPiloto.q2,
        aparicoesQ3: dadosPiloto.q3,
      },
      corrida: {
        diferencaMediaPosicao: mediaDiferencaPosicoes(
          dadosPiloto.posicoesCorrida,
          dadosCompanheiro.posicoesCorrida,
        ),
        vitorias: dadosPiloto.vitoriasCorrida,
        taxaVitoriasPercentual: percentagem(
          dadosPiloto.vitoriasCorrida,
          totalCorridas,
        ),
        ganhoPosicaoMedio: arredondar2(media(dadosPiloto.ganhosPosicao)),
        ganhoPosicaoTotal: dadosPiloto.ganhosPosicao.reduce(
          (total, ganho) => total + ganho,
          0,
        ),
        pontos: dadosPiloto.pontos,
        top10: dadosPiloto.top10,
        top5: dadosPiloto.top5,
      },
      falhas: {
        corridasComFalhaHumana: dadosPiloto.corridasComFalhaHumana,
        taxaFalhasHumanasPercentual: percentagem(
          dadosPiloto.corridasComFalhaHumana,
          totalCorridas,
        ),
        dnfsErroHumano: dadosPiloto.dnfsErroHumano,
        dnfsFalhaMecanica: dadosPiloto.dnfsFalhaMecanica,
      },
    };
  };

  return {
    equipe: pilotoPrincipal.equipe,
    corridas: totalCorridas,
    regras: {
      q2PosicaoMaxima: 16,
      q3PosicaoMaxima: 10,
      top5SubstituiTop10: true,
      confrontoCorridaUsaClassificacaoOficial: true,
      deltaPositivoSignificaPiorPosicao: true,
      ganhoPosicaoPositivoSignificaMelhora: true,
    },
    pilotos: [
      montarResultado(dadosPiloto, dadosCompanheiro),
      montarResultado(dadosCompanheiro, dadosPiloto),
    ],
  };
};

const media = (valores) =>
  valores.length === 0
    ? 0
    : valores.reduce((total, valor) => total + valor, 0) / valores.length;

const mediaDiferencaPosicoes = (posicoesPiloto, posicoesCompanheiro) =>
  arredondar2(
    media(
      posicoesPiloto.map(
        (posicao, indice) => posicao - posicoesCompanheiro[indice],
      ),
    ),
  );

module.exports = {
  calcularMetricasDuplaPilotos,
  encontrarCompanheiroEquipe,
};
