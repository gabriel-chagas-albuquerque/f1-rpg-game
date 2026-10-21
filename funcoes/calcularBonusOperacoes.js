const CONFIG_PADRAO = require("../config/operacoes.config");

const calcularBonusOperacoes = (params = {}, configArg) => {
  const {
    zOperacoes,
    intensidadePista,
    intensidadeOperacoes,
    sessao = "corrida",
    safetyCar,
    possuiSafetyCar,
    intensidadeChuva = 0,
    config: configParam,
  } = params;
  const config =
    configArg?.config ?? configArg ?? configParam ?? CONFIG_PADRAO;
  const intensidade = intensidadePista ?? intensidadeOperacoes ?? 1;
  const sc = safetyCar ?? possuiSafetyCar ?? false;

  if (typeof zOperacoes !== "number" || !Number.isFinite(zOperacoes)) {
    throw new Error("zOperacoes deve ser um número finito.");
  }
  if (
    typeof intensidade !== "number" ||
    !Number.isFinite(intensidade) ||
    intensidade <= 0
  ) {
    throw new Error("intensidade deve ser um número positivo finito.");
  }
  if (sessao !== "corrida" && sessao !== "qualificacao") {
    throw new Error("sessao deve ser 'corrida' ou 'qualificacao'.");
  }
  if (typeof sc !== "boolean") {
    throw new Error("safetyCar deve ser um booleano.");
  }
  if (
    typeof intensidadeChuva !== "number" ||
    !Number.isFinite(intensidadeChuva) ||
    intensidadeChuva < 0 ||
    intensidadeChuva > 1
  ) {
    throw new Error("intensidadeChuva deve ser um número entre 0 e 1.");
  }

  if (!config.ATIVAR_BONUS_OPERACOES) {
    return { bonus: 0, bruto: 0, fatorEvento: 1 };
  }

  const k =
    config.K_OPS * (sessao === "qualificacao" ? config.FATOR_QUALI : 1);
  const fatorEvento =
    1 +
    (sessao === "corrida" && sc ? config.BONUS_SC : 0) +
    config.BONUS_CHUVA * intensidadeChuva;
  const bruto = k * zOperacoes * intensidade * fatorEvento;
  const bonus = Math.max(
    -config.LIMITE_BONUS,
    Math.min(config.LIMITE_BONUS, bruto),
  );

  return { bonus, bruto, fatorEvento };
};

module.exports = calcularBonusOperacoes;
