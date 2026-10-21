const gerarRuido = require("./gerarRuido");
const {
  CONSISTENCIA_MEDIA_PILOTOS,
  DURABILIDADE_MEDIA_EQUIPES,
  OPERACOES_MEDIA_EQUIPES,
  VELOCIDADE_MEDIA_PILOTOS,
} = require("./configuracoes");

const gerarFatorRNG = (
  piloto,
  equipe,
  pesosGerais,
  pesosEquipe,
  comLargada = false,
) => {
  const pesoOperacoes = pesosEquipe.Operacoes;
  const ruidoPiloto = gerarRuido(
    piloto.consistencia,
    pesosGerais.RngPiloto,
    "piloto",
    CONSISTENCIA_MEDIA_PILOTOS,
  );
  const ruidoCarro = gerarRuido(
    equipe.durabilidade,
    pesosGerais.RngCarro,
    "carro",
    DURABILIDADE_MEDIA_EQUIPES
  );
  const ruidoOperacoes = gerarRuido(
    equipe.operacoes,
    pesosGerais.RngOperacoes,
    "operações",
    OPERACOES_MEDIA_EQUIPES,
  );
  const ruidoEquipe =
    (1 - pesoOperacoes) * ruidoCarro.valor +
    pesoOperacoes * ruidoOperacoes.valor;
  const contribuicaoPiloto = ruidoPiloto.valor * pesosGerais.WPiloto;
  const contribuicaoEquipe = ruidoEquipe * pesosGerais.WEquipe;
  const fatorRNG = {
    piloto: ruidoPiloto,
    carro: ruidoCarro,
    operacoes: ruidoOperacoes,
    contribuicaoPiloto,
    contribuicaoEquipe,
    valor: contribuicaoPiloto + contribuicaoEquipe,
  };

  if (comLargada) {
    const ruidoLargada = gerarRuido(
      piloto.velocidade_corrida,
      pesosGerais.RngLargada,
      "largada",
      VELOCIDADE_MEDIA_PILOTOS
    );
    const contribuicaoLargada = ruidoLargada.valor * pesosGerais.WPosInicial;

    fatorRNG.largada = ruidoLargada;
    fatorRNG.contribuicaoLargada = contribuicaoLargada;
    fatorRNG.valor += contribuicaoLargada;
  }

  return fatorRNG;
};

module.exports = gerarFatorRNG;