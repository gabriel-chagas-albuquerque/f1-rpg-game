const gerarNormalTruncada = require("./gerarNormalTruncada");
const {
  TETO_ATRIBUTO_RNG,
  SIGMAS_NO_LIMITE_RNG,
} = require("./configuracoes");

const gerarRuido = (atributo, rngBase, descricao, ATRIBUTO_REFERENCIA_RNG) => {
  if (typeof atributo !== "number" || atributo < 0 || atributo > 100) {
    throw new Error(
      `Atributo de ${descricao} ausente ou fora do intervalo de 0 a 100.`,
    );
  }

  const limite =
    (rngBase * (TETO_ATRIBUTO_RNG - atributo)) /
    (TETO_ATRIBUTO_RNG - ATRIBUTO_REFERENCIA_RNG);
  const valor = (limite / SIGMAS_NO_LIMITE_RNG) * gerarNormalTruncada();

  return { limite, valor };
};

module.exports = gerarRuido;