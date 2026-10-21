module.exports = {
  ATIVAR_BONUS_OPERACOES: true,  // false restaura o comportamento anterior (Operações dentro do score ponderado)
  K_OPS: 0.10,                   // score por desvio de Operações, em pista de intensidade 1 e sem eventos
  FATOR_QUALI: 0.3,              // fração de K_OPS aplicada na qualificação
  BONUS_SC: 0.5,                 // multiplicador extra quando houve safety car (só na corrida)
  BONUS_CHUVA: 0.3,              // multiplicador extra por unidade de intensidade de chuva (corrida e qualificação)
  LIMITE_BONUS: 0.35,            // |bônus| máximo
};
