const CONFIG_CHUVA = {
  distribuicaoIntensidade: {
    probabilidadeGaroa: 0.5, // Metade das sessões molhadas começa como garoa.
    probabilidadeChuva: 0.35, // 35% começa como chuva moderada.
    probabilidadeTempestade: 0.15, // 15% começa como tempestade.
    garoa: 0.3,
    chuva: 0.6,
    tempestade: 1.0,
    variacaoIntensidade: 0.2, // Evita intensidades idênticas em cada faixa.
    centroJitter: 0.5,
    intensidadeMinima: 0.1,
    intensidadeMaxima: 1.0,
  },
  correlacaoSessoes: {
    corridaMolhadaAposQualyMolhada: 0.75, // A chuva tende a persistir entre sessões.
    variacaoEntreSessoes: 0.4, // Permite que a intensidade mude entre sessões.
  },
  limitesCategoria: {
    garoa: 0.45, // Intensidade abaixo deste limite é classificada como garoa.
    chuva: 0.8, // Intensidade abaixo deste limite é classificada como chuva.
  },
  fatores: {
    transferenciaLargada: 0.25, // Reduz o peso relativo da posição de largada.
    transferenciaParaPiloto: 0.65, // A maior parte do peso reduzido vai ao piloto.
    transferenciaParaEquipe: 0.35, // O restante do peso vai à equipe.
    trocaPesoQualy: 0.1, // Transfere peso geral da equipe para o piloto.
    rngQualy: 0.4, // Amplia a variabilidade da qualificação molhada.
    rngCorridaPilotoCarro: 0.5, // Amplia RNG do piloto e carro na corrida.
    rngCorridaOperacoes: 0.75, // Operações recebem maior variabilidade na chuva.
    rngLargada: 1.0, // Amplia a variabilidade da largada.
    aumentoFalhaMecanica: 0.1, // Eleva levemente a chance de falha mecânica.
    aumentoFalhaHumanaQualy: 0.4, // Eleva falhas humanas na qualificação.
    aumentoFalhaHumanaCorrida: 0.2, // Eleva falhas humanas na corrida.
    aumentoFracaoDNFHumana: 0.3, // Eleva a fração de falhas humanas que causam DNF.
  },
  deltas: {
    qualy: {
      piloto: {
        Adaptabilidade: 0.12,
        Gerenciamento: -0.05,
        VelocidadeQualificacao: -0.12,
      },
      equipe: {
        Operacoes: 0.05,
        Tracao: 0.05,
        AeroEficiencia: -0.04,
        Potencia: -0.06,
      },
    },
    corrida: {
      piloto: {
        Adaptabilidade: 0.1,
        Gerenciamento: -0.1,
        Fisico: -0.05,
      },
      equipe: {
        Operacoes: 0.1,
        Tracao: 0.05,
        GestaoPneus: 0.03,
        AeroEficiencia: -0.06,
        Potencia: -0.12,
      },
    },
  },
};

module.exports = CONFIG_CHUVA;
