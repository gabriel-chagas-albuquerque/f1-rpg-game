const gerarNormalPadrao = require("./gerarNormalPadrao");
const { SIGMAS_NO_LIMITE_RNG } = require("./configuracoes");

const gerarNormalTruncada = () => {
  let normal = gerarNormalPadrao();

  while (Math.abs(normal) > SIGMAS_NO_LIMITE_RNG) {
    normal = gerarNormalPadrao();
  }

  return normal;
};

module.exports = gerarNormalTruncada;