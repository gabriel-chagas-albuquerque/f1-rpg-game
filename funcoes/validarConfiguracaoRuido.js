const validarConfiguracaoRuido = (
  pesosGerais,
  pesosEquipe,
  descricao,
  exigeLargada = false,
) => {
  const campos = ["RngPiloto", "RngCarro", "RngOperacoes"];

  if (exigeLargada) {
    campos.push("RngLargada", "RngSafetyCar");
  }

  for (const campo of campos) {
    const valor = pesosGerais[campo];

    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
      throw new Error(`${campo} ausente ou inválido em ${descricao}.`);
    }
  }

  if (
    typeof pesosEquipe.Operacoes !== "number" ||
    pesosEquipe.Operacoes < 0 ||
    pesosEquipe.Operacoes > 1
  ) {
    throw new Error(`Peso de Operações ausente ou inválido em ${descricao}/equipe.`);
  }
};

module.exports = validarConfiguracaoRuido;