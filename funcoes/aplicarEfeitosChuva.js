const CONFIG_CHUVA = require("./configChuva");
const normalizarPesos = require("./normalizarPesos");

const aplicarDelta = (pesos, deltas, pc) => {
  const ajustados = { ...pesos };
  for (const [atributo, delta] of Object.entries(deltas)) {
    ajustados[atributo] = (ajustados[atributo] || 0) + delta * pc;
  }
  normalizarPesos(ajustados);
  return ajustados;
};

const aplicarEfeitosChuva = (pesos, isQualy, pc) => {
  if (typeof pc !== "number" || !Number.isFinite(pc) || pc < 0 || pc > 1) {
    throw new Error("A intensidade da chuva deve estar entre 0 e 1.");
  }

  const copia = {
    ...pesos,
    pesosGerais: { ...pesos.pesosGerais },
    falhas: { ...pesos.falhas },
    piloto: { ...pesos.piloto },
    equipe: { ...pesos.equipe },
  };
  if (pc === 0) return copia;

  const fatores = CONFIG_CHUVA.fatores;
  const deltas = isQualy
    ? CONFIG_CHUVA.deltas.qualy
    : CONFIG_CHUVA.deltas.corrida;
  const pesosGerais = copia.pesosGerais;
  const falhas = copia.falhas;

  if (isQualy) {
    pesosGerais.WPiloto += fatores.trocaPesoQualy * pc;
    pesosGerais.WEquipe -= fatores.trocaPesoQualy * pc;
    pesosGerais.RngPiloto *= 1 + fatores.rngQualy * pc;
    pesosGerais.RngCarro *= 1 + fatores.rngQualy * pc;
    pesosGerais.RngOperacoes *= 1 + fatores.rngQualy * pc;
    falhas.ProbFalhaHumanaBase *=
      1 + fatores.aumentoFalhaHumanaQualy * pc;
    const geraisQualy = {
      WPiloto: pesosGerais.WPiloto,
      WEquipe: pesosGerais.WEquipe,
    };
    normalizarPesos(geraisQualy);
    Object.assign(pesosGerais, geraisQualy);
  } else {
    const corte = fatores.transferenciaLargada * pc * pesosGerais.WPosInicial;
    pesosGerais.WPosInicial -= corte;
    pesosGerais.WPiloto += fatores.transferenciaParaPiloto * corte;
    pesosGerais.WEquipe += fatores.transferenciaParaEquipe * corte;
    pesosGerais.RngPiloto *= 1 + fatores.rngCorridaPilotoCarro * pc;
    pesosGerais.RngCarro *= 1 + fatores.rngCorridaPilotoCarro * pc;
    pesosGerais.RngOperacoes *= 1 + fatores.rngCorridaOperacoes * pc;
    pesosGerais.RngLargada *= 1 + fatores.rngLargada * pc;
    falhas.ProbFalhaHumanaBase *=
      1 + fatores.aumentoFalhaHumanaCorrida * pc;
    const geraisCorrida = {
      WPosInicial: pesosGerais.WPosInicial,
      WPiloto: pesosGerais.WPiloto,
      WEquipe: pesosGerais.WEquipe,
    };
    normalizarPesos(geraisCorrida);
    Object.assign(pesosGerais, geraisCorrida);
  }

  falhas.ProbFalhaMecanicaBase *=
    1 + fatores.aumentoFalhaMecanica * pc;
  falhas.FracaoDNFHumana = Math.min(
    1,
    falhas.FracaoDNFHumana * (1 + fatores.aumentoFracaoDNFHumana * pc),
  );

  copia.piloto = aplicarDelta(copia.piloto, deltas.piloto, pc);
  copia.equipe = aplicarDelta(copia.equipe, deltas.equipe, pc);
  return copia;
};

module.exports = aplicarEfeitosChuva;
