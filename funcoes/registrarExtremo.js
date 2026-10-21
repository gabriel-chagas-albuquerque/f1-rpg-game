const registrarExtremo = (extremos, valor) => {
  extremos.minima =
    extremos.minima === null ? valor : Math.min(extremos.minima, valor);
  extremos.maxima =
    extremos.maxima === null ? valor : Math.max(extremos.maxima, valor);
};

module.exports = registrarExtremo;