const {
  SC_Q_HUMANA,
  SC_Q_MECANICA,
  SC_DURACAO_MIN,
  SC_DURACAO_MAX,
} = require("./configuracoes");

const sortearSafetyCar = ({
  dnfs,
  voltas,
  rand = Math.random,
}) => {
  if (!Number.isInteger(voltas) || voltas <= 0) {
    throw new Error("Quantidade de voltas inválida para sortear Safety Car.");
  }
  const candidatos = [];
  for (const dnf of dnfs) {
    const chance =
      dnf.tipo === "humana" ? SC_Q_HUMANA : SC_Q_MECANICA;
    if (rand() < chance) {
      candidatos.push({ volta: dnf.volta, origem: `dnf_${dnf.tipo}` });
    }
  }

  candidatos.sort((a, b) => a.volta - b.volta);
  const eventos = [];
  let fimAnterior = 0;
  for (const candidato of candidatos) {
    if (candidato.volta <= fimAnterior || candidato.volta >= voltas) {
      continue;
    }
    const duracao =
      SC_DURACAO_MIN +
      Math.floor(rand() * (SC_DURACAO_MAX - SC_DURACAO_MIN + 1));
    eventos.push({
      voltaInicio: candidato.volta,
      duracao,
      origem: candidato.origem,
    });
    fimAnterior = candidato.volta + duracao;
  }

  return eventos;
};

module.exports = sortearSafetyCar;
