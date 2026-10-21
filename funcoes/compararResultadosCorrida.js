const compararResultadosCorrida = (a, b) => {
  if (a.dnf.ocorreu !== b.dnf.ocorreu) {
    return Number(a.dnf.ocorreu) - Number(b.dnf.ocorreu);
  }
  if (a.dnf.ocorreu) {
    return (
      b.dnf.voltaAbandono - a.dnf.voltaAbandono ||
      (b.scoreRitmoBase ?? b.scoreTotal) -
        (a.scoreRitmoBase ?? a.scoreTotal) ||
      a.posicaoLargada - b.posicaoLargada
    );
  }
  return (
    b.scoreTotal - a.scoreTotal ||
    a.posicaoLargada - b.posicaoLargada
  );
};

module.exports = compararResultadosCorrida;
