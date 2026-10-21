const readJson = require("./readJson");
const calcularValorMedio = require("./calcularValorMedio");

const pilotos = readJson("./pilotos.json");
const equipes = readJson("./equipes.json");

const CONSISTENCIA_MEDIA_PILOTOS = calcularValorMedio(pilotos, "consistencia");
const DURABILIDADE_MEDIA_EQUIPES = calcularValorMedio(equipes, "durabilidade");
const OPERACOES_MEDIA_EQUIPES = calcularValorMedio(equipes, "operacoes");
const VELOCIDADE_MEDIA_PILOTOS = calcularValorMedio(pilotos, "velocidade_corrida");


const atributosPiloto = {
  VelocidadeQualificacao: "velocidade_qualificacao",
  VelocidadeCorrida: "velocidade_corrida",
  Racecraft: "racecraft",
  Gerenciamento: "gerenciamento",
  Adaptabilidade: "adaptabilidade",
  Fisico: "fisico",
};

const atributosEquipe = {
  AeroCarga: "aero_carga",
  AeroEficiencia: "aero_eficiencia",
  Chassi: "chassi",
  Tracao: "tracao",
  Potencia: "potencia",
  Operacoes: "operacoes",
  GestaoPneus: "gestao_pneus",
};

const TETO_ATRIBUTO_RNG = 110;
const SIGMAS_NO_LIMITE_RNG = 3;

// Limita os DNFs por corrida; modo dinâmico arredonda a estimativa para seguir os valores de referência.
const DNF_TETO = {
  modo: "fixo",
  fixo: 6,
  minimoDinamico: 5,
  desviosDinamico: 2,
};

// Parâmetros calibráveis do Safety Car; o início cedo atenua apenas seu RNG.
const SC_Q_HUMANA = 0.1;
const SC_Q_MECANICA = 0.05;
const SC_DURACAO_MIN = 1;
const SC_DURACAO_MAX = 6;
const SC_LAMBDA_MIN = 0.15;
const SC_FRACAO_INICIO = 0.3;
// RngSafetyCar=0.76 em pesos.json: k≈0.98658 para normal truncada em ±3σ,
// então base = sdAlvo(0.25) × SIGMAS_NO_LIMITE_RNG(3) / k ≈ 0.76047.

module.exports = {
  atributosEquipe,
  atributosPiloto,
  CONSISTENCIA_MEDIA_PILOTOS,
  DURABILIDADE_MEDIA_EQUIPES,
  OPERACOES_MEDIA_EQUIPES,
  VELOCIDADE_MEDIA_PILOTOS,
  SIGMAS_NO_LIMITE_RNG,
  TETO_ATRIBUTO_RNG,
  DNF_TETO,
  SC_Q_HUMANA,
  SC_Q_MECANICA,
  SC_DURACAO_MIN,
  SC_DURACAO_MAX,
  SC_LAMBDA_MIN,
  SC_FRACAO_INICIO,
};