const determinarDNF = (falhaDurabilidade, falhaHumana) => {
  const falhasDNF = [
    { falha: falhaDurabilidade, causa: "falhaDurabilidade" },
    { falha: falhaHumana, causa: "falhaHumana" },
  ].filter(({ falha }) => falha.dnf);

  if (falhasDNF.length === 0) {
    return { ocorreu: false, causa: null, voltaAbandono: null };
  }

  return {
    ocorreu: true,
    causa: falhasDNF[0].causa,
    voltaAbandono: null,
  };
};

module.exports = determinarDNF;
