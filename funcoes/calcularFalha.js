const calcularProbabilidadeFalha = require("./calcularProbabilidadeFalha");

// Nome usado nas chaves do pesos.json -> tipo aceito pela função de probabilidade.
const TIPO_FALHA = { Mecanica: "mecanica", Humana: "humana" };

const calcularFalha = (
  falhas,
  tipo,
  atributo,
  descricao,
  quantidadeVoltas,
) => {
  if (!falhas || typeof falhas !== "object") {
    throw new Error(`Configuração de falhas ausente para ${descricao}.`);
  }

  const tipoFalha = TIPO_FALHA[tipo];
  if (!tipoFalha) {
    throw new Error(`Tipo de falha inválido para ${descricao}: ${tipo}.`);
  }

  if (!Number.isInteger(quantidadeVoltas) || quantidadeVoltas <= 0) {
    throw new Error(`Quantidade de voltas inválida para ${descricao}.`);
  }

  const fatorBase = falhas[`FatorBaseFalha${tipo}`];
  const fracaoDNF = falhas[`FracaoDNF${tipo}`];
  if (
    typeof fatorBase !== "number" ||
    !Number.isFinite(fatorBase) ||
    fatorBase < 0 ||
    typeof fracaoDNF !== "number" ||
    !Number.isFinite(fracaoDNF) ||
    fracaoDNF < 0 ||
    fracaoDNF > 1 ||
    typeof falhas.PenalidadeZMin !== "number" ||
    !Number.isFinite(falhas.PenalidadeZMin) ||
    typeof falhas.PenalidadeZMax !== "number" ||
    !Number.isFinite(falhas.PenalidadeZMax) ||
    falhas.PenalidadeZMin < 0 ||
    falhas.PenalidadeZMax < falhas.PenalidadeZMin
  ) {
    throw new Error(`Configuração de falhas inválida para ${descricao}.`);
  }

  if (typeof atributo !== "number" || atributo < 0 || atributo > 100) {
    throw new Error(`Atributo de ${descricao} ausente ou inválido.`);
  }

  // Mesma função e mesma regra para os dois tipos: min(1, fatorBase x faixa(atributo)).
  // Não há teto extra para a falha mecânica: o fator base já foi calibrado pelo gerador.
  const probabilidade = calcularProbabilidadeFalha(fatorBase, atributo, tipoFalha);
  const ocorreu = Math.random() < probabilidade;
  if (!ocorreu) {
    return {
      ocorreu: false,
      dnf: false,
      voltaAbandono: null,
      probabilidade,
      penalidade: 0,
    };
  }

  const dnf = Math.random() < fracaoDNF;
  const voltaAbandono = null;
  const penalidade = dnf
    ? 0
    : falhas.PenalidadeZMin +
      Math.random() * (falhas.PenalidadeZMax - falhas.PenalidadeZMin);

  return {
    ocorreu,
    dnf,
    voltaAbandono,
    probabilidade,
    penalidade,
  };
};

module.exports = calcularFalha;