const CONFIG_PE = require("../config/pe.config");

const limitar = (valor, minimo, maximo) =>
  Math.min(maximo, Math.max(minimo, valor));

const validarNumeroFinito = (valor, nome) => {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new Error(`${nome} deve ser um número finito.`);
  }
};

const normalizarDetalhado = (
  bruto,
  esperado,
  numeroPilotos = CONFIG_PE.N_PILOTOS,
  config = CONFIG_PE,
) => {
  validarNumeroFinito(bruto, "O desempenho bruto");
  validarNumeroFinito(esperado, "A posição esperada");
  if (!Number.isInteger(numeroPilotos) || numeroPilotos < 2) {
    throw new Error("O número de pilotos deve ser um inteiro maior que 1.");
  }

  const alcanceDisponivel =
    bruto >= 0 ? esperado - 1 : numeroPilotos - esperado;
  const alcance = Math.max(config.ALCANCE_MINIMO, alcanceDisponivel);
  const x = limitar(bruto / alcance, -1, 1);
  return {
    alcance,
    x,
    resultado: aplicarRetornosDecrescentes(x, config.EXPOENTE),
  };
};

const aplicarRetornosDecrescentes = (valor, expoente = CONFIG_PE.EXPOENTE) => {
  validarNumeroFinito(valor, "O valor a normalizar");
  if (!(expoente > 0 && expoente <= 1)) {
    throw new Error("O expoente deve estar no intervalo (0, 1].");
  }
  return Math.sign(valor) * Math.abs(valor) ** expoente;
};

const normalizar = (
  bruto,
  esperado,
  numeroPilotos = CONFIG_PE.N_PILOTOS,
  config = CONFIG_PE,
) =>
  normalizarDetalhado(bruto, esperado, numeroPilotos, config).resultado;

const obterExpectativa = (expectativas, pista, clima, equipe) => {
  const dadosClima = expectativas?.[pista]?.[clima];
  const eq = dadosClima?.EQ?.[equipe];
  const ec = dadosClima?.EC?.[equipe];
  const modelo = dadosClima?.modeloCorrida;

  if (
    typeof eq !== "number" ||
    typeof ec !== "number" ||
    !modelo ||
    !["a", "b", "c"].every((coeficiente) =>
      Number.isFinite(modelo[coeficiente]),
    )
  ) {
    throw new Error(
      `Expectativa incompleta para ${pista}/${clima}/${equipe}. Gere expectativas.json novamente.`,
    );
  }

  return { EQ: eq, EC: ec, modeloCorrida: modelo };
};

const calcularPE = (entrada, expectativas, opcoes = {}) => {
  const config = { ...CONFIG_PE, ...opcoes.config };
  if (!config.ATIVAR_PE) {
    throw new Error("O sistema de PE está desativado em config/pe.config.js.");
  }
  if (
    !Number.isFinite(config.PESO_Q) ||
    !Number.isFinite(config.PESO_R) ||
    config.PESO_Q < 0 ||
    config.PESO_R < 0 ||
    Math.abs(config.PESO_Q + config.PESO_R - 1) > 1e-9
  ) {
    throw new Error("PESO_Q e PESO_R devem ser não negativos e somar 1.");
  }
  if (entrada?.piloto?.pilotoJogador !== true) {
    throw new Error(
      `PE não calculado: ${entrada?.piloto?.piloto ?? "Piloto"} não está marcado como pilotoJogador.`,
    );
  }
  if (!["seco", "chuva"].includes(entrada.clima)) {
    throw new Error("O clima deve ser 'seco' ou 'chuva'.");
  }
  if (typeof entrada.safetyCar !== "boolean") {
    throw new Error("safetyCar deve ser booleano.");
  }
  if (
    !Number.isFinite(entrada.qualificacao?.posicao) ||
    !Number.isFinite(entrada.corrida?.posicaoLargada) ||
    !Number.isFinite(entrada.corrida?.posicaoFinal) ||
    ![null, "humano", "mecanico"].includes(entrada.corrida?.dnf)
  ) {
    throw new Error("Posições ou causa de DNF ausentes ou inválidas.");
  }
  for (const campo of ["falhaHumanaModerada", "falhaMecanicaModerada"]) {
    if (typeof entrada.corrida[campo] !== "boolean") {
      throw new Error(`${campo} deve ser booleano.`);
    }
  }

  const expectativa = obterExpectativa(
    expectativas,
    entrada.pista,
    entrada.clima,
    entrada.piloto.equipe,
  );
  const nPilotos = opcoes.numeroPilotos ?? config.N_PILOTOS;
  const esperadoQualy = expectativa.EQ;
  const brutoQ = esperadoQualy - entrada.qualificacao.posicao;
  const normalizadoQ = normalizarDetalhado(
    brutoQ,
    esperadoQualy,
    nPilotos,
    config,
  );
  const q = normalizadoQ.resultado;
  const corrida = entrada.corrida;
  const dnfHumano = corrida.dnf === "humano";
  const dnf = corrida.dnf === "humano" || corrida.dnf === "mecanico";
  if (
    opcoes.peGanhoNaTemporada !== undefined &&
    (!Number.isFinite(opcoes.peGanhoNaTemporada) ||
      opcoes.peGanhoNaTemporada < 0)
  ) {
    throw new Error("O PE ganho na temporada deve ser finito e não negativo.");
  }
  const esperadoFinal =
    expectativa.modeloCorrida.a +
    expectativa.modeloCorrida.b * corrida.posicaoLargada +
    expectativa.modeloCorrida.c * expectativa.EC;
  const brutoR = esperadoFinal - corrida.posicaoFinal;
  const normalizadoR = normalizarDetalhado(
    brutoR,
    esperadoFinal,
    nPilotos,
    config,
  );
  let r = dnf ? 0 : normalizadoR.resultado;

  if (corrida.falhaMecanicaModerada) r = Math.max(0, r);
  if (entrada.safetyCar) r *= config.FATOR_R_COM_SC;

  const penalidades = {
    falhaHumanaModerada:
      !dnfHumano && corrida.falhaHumanaModerada
        ? config.PENAL_FALHA_HUMANA
        : 0,
    dnfHumano: dnfHumano ? config.PENAL_DNF_HUMANO : 0,
    pontos: 0,
  };
  if (config.PESO_PONTOS !== 0) {
    penalidades.pontos = Math.max(0, corrida.pontosAcimaEsperado ?? 0) *
      config.PESO_PONTOS;
  }

  const contribuicaoQ = config.PESO_Q * q;
  const contribuicaoR = config.PESO_R * r;
  const peAntesCatchUp =
    config.PE_BASE +
    config.PE_ESCALA * (contribuicaoQ + contribuicaoR) -
    penalidades.falhaHumanaModerada -
    penalidades.dnfHumano -
    penalidades.pontos;
  const catchUp = opcoes.catchUp ?? {};
  const zRating = catchUp.zRating ?? entrada.piloto.zRating;
  if (config.ATIVAR_CATCH_UP && !Number.isFinite(zRating)) {
    throw new Error(
      "O catch-up está ativo, mas o z_rating do piloto não foi fornecido.",
    );
  }
  const fatorCatchUp = config.ATIVAR_CATCH_UP
    ? limitar(
        1 - config.CATCH_UP_K * zRating,
        config.CATCH_UP_MIN,
        config.CATCH_UP_MAX,
      )
    : 1;
  let pe = limitar(
    peAntesCatchUp * fatorCatchUp,
    0,
    config.PE_MAX_FIM_DE_SEMANA,
  );
  let limiteTemporada = null;
  if (
    config.ATIVAR_TETO_PE_GANHO_TEMPORADA &&
    Number.isFinite(opcoes.peGanhoNaTemporada)
  ) {
    limiteTemporada = Math.max(
      0,
      config.TETO_PE_GANHO_TEMPORADA - opcoes.peGanhoNaTemporada,
    );
    pe = Math.min(pe, limiteTemporada);
  }

  const formatar = (numero) => numero.toFixed(2).replace(".", ",");
  const log = [
    `${entrada.pista} (${entrada.clima}) | ${entrada.piloto.piloto} (${entrada.piloto.equipe})`,
    `Q: esperado P${formatar(esperadoQualy)}, fez P${entrada.qualificacao.posicao} -> ${formatar(brutoQ)} / alcance ${formatar(normalizadoQ.alcance)} -> ${formatar(normalizadoQ.x)} -> ${formatar(q)} após expoente -> contribui ${formatar(config.PE_ESCALA * contribuicaoQ)} PE`,
    `R: esperado P${formatar(esperadoFinal)} dada a largada, fez P${corrida.posicaoFinal}${dnf ? " (DNF; neutro)" : ""} -> ${formatar(dnf ? 0 : brutoR)} / alcance ${formatar(normalizadoR.alcance)} -> ${formatar(dnf ? 0 : normalizadoR.x)} -> ${formatar(r)} após expoente -> contribui ${formatar(config.PE_ESCALA * contribuicaoR)} PE`,
    `CF: ${dnfHumano ? `DNF humano -> -${formatar(penalidades.dnfHumano)} PE` : penalidades.falhaHumanaModerada > 0 ? `falha humana moderada -> -${formatar(penalidades.falhaHumanaModerada)} PE` : "sem penalidade humana -> 0,00 PE"}`,
    `Base ${formatar(config.PE_BASE)} + ${formatar(config.PE_ESCALA * (contribuicaoQ + contribuicaoR))} - ${formatar(penalidades.falhaHumanaModerada + penalidades.dnfHumano + penalidades.pontos)} = ${formatar(peAntesCatchUp)} PE${fatorCatchUp !== 1 ? `; catch-up x${formatar(fatorCatchUp)}` : ""}; resultado ${formatar(pe)} PE (teto fim de semana ${formatar(config.PE_MAX_FIM_DE_SEMANA)})`,
  ];
  if (corrida.falhaMecanicaModerada) {
    log.push("Falha mecânica moderada: R não pode ser negativo.");
  }
  if (entrada.safetyCar) log.push(`Safety car: R reduzido em ${formatar(1 - config.FATOR_R_COM_SC)}.`);
  if (limiteTemporada !== null) {
    log.push(`Teto sazonal restante aplicado: ${formatar(limiteTemporada)} PE.`);
  }

  return {
    pe,
    componentes: {
      Q: q,
      R: r,
      CF:
        penalidades.falhaHumanaModerada + penalidades.dnfHumano === 0
          ? 0
          : -(penalidades.falhaHumanaModerada + penalidades.dnfHumano),
    },
    protecoes: {
      catchUp: fatorCatchUp,
      safetyCar: entrada.safetyCar ? config.FATOR_R_COM_SC : 1,
      limiteTemporada,
    },
    log,
  };
};

const custoSubirAtributo = (
  nivelAtual,
  atributo,
  config = CONFIG_PE,
) => {
  validarNumeroFinito(nivelAtual, "O nível atual");
  const fator = config.FATOR_CUSTO_ATRIBUTO[atributo];
  if (typeof fator !== "number" || !Number.isFinite(fator) || fator <= 0) {
    throw new Error(`Fator de custo inválido para o atributo "${atributo}".`);
  }
  if (nivelAtual < 0 || nivelAtual >= config.NIVEL_MAXIMO_ATRIBUTO) {
    throw new Error(
      `O nível do atributo deve estar entre 0 e ${config.NIVEL_MAXIMO_ATRIBUTO - 1}.`,
    );
  }
  return config.CUSTO_BASE * nivelAtual ** 1.5 * fator;
};

const gastarPE = (estado, atributo, quantidade, opcoes = {}) => {
  const config = { ...CONFIG_PE, ...opcoes.config };
  if (!estado || typeof estado !== "object") {
    throw new Error("O estado do piloto é obrigatório.");
  }
  if (!config.ATIVAR_PE) {
    return { ok: false, motivo: "sistema_desativado", estado };
  }
  if (!config.ATRIBUTOS_PILOTO.includes(atributo)) {
    throw new Error(`Atributo de piloto desconhecido: ${atributo}.`);
  }
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error("A quantidade de níveis deve ser um inteiro positivo.");
  }
  if (typeof estado.pe !== "number" || !Number.isFinite(estado.pe)) {
    throw new Error("O saldo de PE deve ser um número finito.");
  }

  const nivelAtual = estado.atributos?.[atributo];
  if (!Number.isFinite(nivelAtual)) {
    throw new Error(`Nível inválido para o atributo "${atributo}".`);
  }
  if (nivelAtual + quantidade > config.NIVEL_MAXIMO_ATRIBUTO) {
    return { ok: false, motivo: "nivel_maximo", estado };
  }

  let custoTotal = 0;
  for (let incremento = 0; incremento < quantidade; incremento++) {
    custoTotal += custoSubirAtributo(nivelAtual + incremento, atributo, config);
  }
  if (estado.pe < custoTotal) {
    return { ok: false, motivo: "pe_insuficiente", estado };
  }

  const gastos = estado.gastoTemporada ?? {};
  const gastoAtributo = gastos[atributo] ?? 0;
  if (
    config.ATIVAR_TETO_PE_POR_ATRIBUTO &&
    gastoAtributo + custoTotal >
      config.TETO_PE_POR_ATRIBUTO_TEMPORADA
  ) {
    return { ok: false, motivo: "teto_atributo_temporada", estado };
  }

  return {
    ok: true,
    motivo: null,
    estado: {
      ...estado,
      pe: estado.pe - custoTotal,
      atributos: {
        ...estado.atributos,
        [atributo]: nivelAtual + quantidade,
      },
      gastoTemporada: {
        ...gastos,
        [atributo]: gastoAtributo + custoTotal,
      },
    },
    custo: custoTotal,
  };
};

module.exports = {
  aplicarRetornosDecrescentes,
  calcularPE,
  custoSubirAtributo,
  gastarPE,
  normalizar,
  obterExpectativa,
};
