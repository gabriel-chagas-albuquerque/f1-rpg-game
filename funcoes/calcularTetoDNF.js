const { DNF_TETO } = require("./configuracoes");

const calcularTetoDNF = (mediaDNF, configuracao = DNF_TETO) => {
  if (!configuracao || !["fixo", "dinamico"].includes(configuracao.modo)) {
    throw new Error("Modo de teto de DNF ausente ou inválido.");
  }

  if (configuracao.modo === "fixo") {
    if (!Number.isInteger(configuracao.fixo) || configuracao.fixo < 0) {
      throw new Error("Teto fixo de DNF deve ser um inteiro não negativo.");
    }
    return configuracao.fixo;
  }

  if (typeof mediaDNF !== "number" || !Number.isFinite(mediaDNF) || mediaDNF < 0) {
    throw new Error("Média esperada de DNF inválida.");
  }
  if (
    !Number.isInteger(configuracao.minimoDinamico) ||
    configuracao.minimoDinamico < 0 ||
    typeof configuracao.desviosDinamico !== "number" ||
    !Number.isFinite(configuracao.desviosDinamico) ||
    configuracao.desviosDinamico < 0
  ) {
    throw new Error("Parâmetros do teto dinâmico de DNF inválidos.");
  }

  return Math.max(
    configuracao.minimoDinamico,
    Math.round(mediaDNF + configuracao.desviosDinamico * Math.sqrt(mediaDNF)),
  );
};

module.exports = calcularTetoDNF;
