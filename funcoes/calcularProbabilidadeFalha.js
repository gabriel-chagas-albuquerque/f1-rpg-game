// Probabilidade de falha por piloto e corrida:
//
//   p = min(1, fatorBase x faixa(atributo))
//
// faixa(atributo) é uma sigmoide decrescente (atributo alto = menos falha) que vai de
// porcentagemMaxima (no atributoMinimo) até porcentagemMinima (no atributoMaximo).
// Fora desse intervalo o atributo é limitado às pontas.
//   - tipo "humana":   atributo = consistência do piloto
//   - tipo "mecanica": atributo = durabilidade da equipe
//
// A faixa define a diferença ENTRE pilotos/equipes; o fatorBase define o NÍVEL da pista
// (1 = usa a faixa como está; < 1 atenua; > 1 amplia).
// Esta é a ÚNICA implementação: o gerador de pesos e o simulador devem importá-la daqui.

const readJson = require("./readJson");

const TIPOS = ["mecanica", "humana"];

const exigirNumero = (valor, nome) => {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new Error(`Config de falha: ${nome} ausente ou inválido.`);
  }
  return valor;
};

const validarConfig = (cfg) => {
  if (!cfg || typeof cfg !== "object") throw new Error("Config de falha ausente.");
  const saida = {};
  for (const tipo of TIPOS) {
    const c = cfg[tipo];
    if (!c || typeof c !== "object") throw new Error(`Config de falha: bloco "${tipo}" ausente.`);
    const v = {
      porcentagemMinima: exigirNumero(c.porcentagemMinima, `${tipo}.porcentagemMinima`),
      porcentagemMaxima: exigirNumero(c.porcentagemMaxima, `${tipo}.porcentagemMaxima`),
      atributoMinimo: exigirNumero(c.atributoMinimo, `${tipo}.atributoMinimo`),
      atributoMaximo: exigirNumero(c.atributoMaximo, `${tipo}.atributoMaximo`),
      centro: exigirNumero(c.centro, `${tipo}.centro`),
      escala: exigirNumero(c.escala, `${tipo}.escala`),
    };
    if (!(v.porcentagemMinima >= 0 && v.porcentagemMinima < v.porcentagemMaxima && v.porcentagemMaxima <= 100)) {
      throw new Error(`Config de falha: ${tipo} exige 0 <= porcentagemMinima < porcentagemMaxima <= 100.`);
    }
    if (!(v.atributoMinimo >= 0 && v.atributoMinimo < v.atributoMaximo && v.atributoMaximo <= 100)) {
      throw new Error(`Config de falha: ${tipo} exige 0 <= atributoMinimo < atributoMaximo <= 100.`);
    }
    if (!(v.escala > 0)) throw new Error(`Config de falha: ${tipo}.escala deve ser > 0.`);
    saida[tipo] = v;
  }
  return saida;
};

let cache = null;
const carregarConfig = () => {
  cache ??= validarConfig(readJson("configuracaoFalhas.json"));
  return cache;
};

const sigmoide = (x, centro, escala) => 1 / (1 + Math.exp(-(x - centro) / escala));

// Probabilidade (0-1) dentro da faixa configurada, sem fator base.
const probabilidadeBanda = (tipo, atributo, config = carregarConfig()) => {
  const c = config[tipo];
  if (!TIPOS.includes(tipo) || !c) throw new Error(`Tipo de falha inválido: ${tipo}. Use "mecanica" ou "humana".`);
  if (typeof atributo !== "number" || !Number.isFinite(atributo) || atributo < 0 || atributo > 100) {
    throw new Error("Atributo para cálculo de probabilidade inválido.");
  }
  const x = Math.min(c.atributoMaximo, Math.max(c.atributoMinimo, atributo));
  const s0 = sigmoide(c.atributoMinimo, c.centro, c.escala);
  const s1 = sigmoide(c.atributoMaximo, c.centro, c.escala);
  const posicao = (sigmoide(x, c.centro, c.escala) - s0) / (s1 - s0); // 0 no mínimo, 1 no máximo
  return (c.porcentagemMaxima - (c.porcentagemMaxima - c.porcentagemMinima) * posicao) / 100;
};

// O terceiro argumento (tipo) é obrigatório: chamadas antigas de 2 argumentos falham em vez de
// usar a fórmula errada em silêncio.
const calcularProbabilidadeFalha = (fatorBase, atributo, tipo, config) => {
  if (typeof fatorBase !== "number" || !Number.isFinite(fatorBase) || fatorBase < 0) {
    throw new Error("Fator base de falha ausente ou inválido.");
  }
  return Math.min(1, fatorBase * probabilidadeBanda(tipo, atributo, config));
};

module.exports = calcularProbabilidadeFalha;
module.exports.probabilidadeBanda = probabilidadeBanda;
module.exports.carregarConfig = carregarConfig;
module.exports.validarConfig = validarConfig;