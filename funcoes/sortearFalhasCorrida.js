const calcularFalha = require("./calcularFalha");
const determinarDNF = require("./determinarDNF");

const sortearFalhasCorrida = (piloto, equipe, pesosCorrida, quantidadeVoltas) => {
  const falhaDurabilidade = calcularFalha(
    pesosCorrida.falhas,
    "Mecanica",
    equipe.durabilidade,
    "falha mecânica na corrida",
    quantidadeVoltas,
  );
  const falhaHumana = calcularFalha(
    pesosCorrida.falhas,
    "Humana",
    piloto.consistencia,
    "falha humana na corrida",
    quantidadeVoltas,
  );

  return {
    falhaDurabilidade,
    falhaHumana,
    dnf: determinarDNF(falhaDurabilidade, falhaHumana),
  };
};

module.exports = sortearFalhasCorrida;
