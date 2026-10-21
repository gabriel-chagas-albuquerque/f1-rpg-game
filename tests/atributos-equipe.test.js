const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const equipes = require("../equipes.json");
const pesos = require("../pesos.json");
const calcularScore = require("../funcoes/calcularScore");
const {
  atributosEquipe,
  DURABILIDADE_MEDIA_EQUIPES,
  OPERACOES_MEDIA_EQUIPES,
} = require("../funcoes/configuracoes");

test("ratings iniciais das equipes correspondem aos valores fornecidos", () => {
  assert.deepStrictEqual(
    equipes.map(({ equipe, ...ratings }) => ({ equipe, ...ratings })),
    [
      {
        equipe: "Mercedes",
        aero_carga: 89,
        aero_eficiencia: 95,
        chassi: 89,
        tracao: 91,
        potencia: 95,
        operacoes: 92,
        gestao_pneus: 89,
        durabilidade: 93,
      },
      {
        equipe: "Ferrari",
        aero_carga: 94,
        aero_eficiencia: 82,
        chassi: 96,
        tracao: 89,
        potencia: 91,
        operacoes: 90,
        gestao_pneus: 91,
        durabilidade: 91,
      },
      {
        equipe: "McLaren",
        aero_carga: 87,
        aero_eficiencia: 90,
        chassi: 86,
        tracao: 84,
        potencia: 93,
        operacoes: 90,
        gestao_pneus: 84,
        durabilidade: 79,
      },
      {
        equipe: "Red Bull Racing",
        aero_carga: 90,
        aero_eficiencia: 92,
        chassi: 88,
        tracao: 78,
        potencia: 86,
        operacoes: 93,
        gestao_pneus: 82,
        durabilidade: 70,
      },
      {
        equipe: "Alpine",
        aero_carga: 84,
        aero_eficiencia: 78,
        chassi: 84,
        tracao: 76,
        potencia: 89,
        operacoes: 84,
        gestao_pneus: 80,
        durabilidade: 76,
      },
      {
        equipe: "Racing Bulls",
        aero_carga: 83,
        aero_eficiencia: 83,
        chassi: 81,
        tracao: 79,
        potencia: 82,
        operacoes: 82,
        gestao_pneus: 79,
        durabilidade: 68,
      },
      {
        equipe: "Haas",
        aero_carga: 78,
        aero_eficiencia: 77,
        chassi: 80,
        tracao: 80,
        potencia: 82,
        operacoes: 73,
        gestao_pneus: 76,
        durabilidade: 80,
      },
      {
        equipe: "Audi",
        aero_carga: 80,
        aero_eficiencia: 77,
        chassi: 78,
        tracao: 75,
        potencia: 66,
        operacoes: 83,
        gestao_pneus: 75,
        durabilidade: 65,
      },
      {
        equipe: "Williams",
        aero_carga: 69,
        aero_eficiencia: 77,
        chassi: 73,
        tracao: 71,
        potencia: 94,
        operacoes: 76,
        gestao_pneus: 71,
        durabilidade: 56,
      },
      {
        equipe: "Aston Martin",
        aero_carga: 69,
        aero_eficiencia: 65,
        chassi: 63,
        tracao: 59,
        potencia: 57,
        operacoes: 75,
        gestao_pneus: 63,
        durabilidade: 54,
      },
      {
        equipe: "Cadillac",
        aero_carga: 58,
        aero_eficiencia: 72,
        chassi: 55,
        tracao: 58,
        potencia: 90,
        operacoes: 60,
        gestao_pneus: 45,
        durabilidade: 35,
      },
    ],
  );
});

test("score usa os sete atributos definidos e exclui durabilidade", () => {
  const mercedes = equipes.find((equipe) => equipe.equipe === "Mercedes");
  const pesosUnitarios = Object.fromEntries(
    Object.keys(atributosEquipe).map((atributo) => [atributo, 1]),
  );

  assert.deepStrictEqual(Object.keys(atributosEquipe), [
    "AeroCarga",
    "AeroEficiencia",
    "Chassi",
    "Tracao",
    "Potencia",
    "Operacoes",
    "GestaoPneus",
  ]);
  assert.equal(calcularScore(mercedes, pesosUnitarios, atributosEquipe), 640);
});

test("score bruto de equipe corresponde à soma ponderada manual da pista", () => {
  const mercedes = equipes.find((equipe) => equipe.equipe === "Mercedes");
  const pesosMonza = pesos.find((configuracao) => configuracao.GP === "Monza")
    .pesos.corrida.equipe;
  const esperado = Object.entries(pesosMonza).reduce(
    (total, [atributo, peso]) =>
      total + mercedes[atributosEquipe[atributo]] * peso,
    0,
  );

  assert.equal(
    calcularScore(mercedes, pesosMonza, atributosEquipe),
    esperado,
  );
});

test("médias de durabilidade e operações são derivadas dos ratings atuais", () => {
  assert.equal(DURABILIDADE_MEDIA_EQUIPES, 767/11);
  assert.equal(OPERACOES_MEDIA_EQUIPES, 898 / 11);
});

test("fontes ativas não mantêm nomes antigos de atributos ou descritores", () => {
  const arquivos = [
    "../equipes.json",
    "../pesos.json",
    "../gerar-pesos/descritores.json",
    "../gerar-pesos/descritores.txt",
    "../descritoresParaPesos.js",
    "../index.js",
    "../funcoes/configuracoes.js",
    "../funcoes/configChuva.js",
    "../funcoes/gerarFatorRNG.js",
    "../funcoes/calcularScoreCorrida.js",
    "../legacy/index-antigo.js",
    "../legacy/equipes_legacy.json",
  ];
  const chave = (...caracteres) => String.fromCharCode(...caracteres);
  const camposAntigos = [
    chave(97, 101, 114, 111),
    chave(101, 115, 116, 114, 97, 116, 101, 103, 105, 97),
    chave(100, 101, 115, 103, 97, 115, 116, 101),
    chave(115, 116, 97, 102, 102),
    chave(97, 101, 114, 111, 100, 105, 110, 97, 109, 105, 99, 97),
    chave(117, 110, 105, 100, 97, 100, 101, 95, 100, 101, 95, 112, 111, 116, 101, 110, 99, 105, 97),
    chave(65, 101, 114, 111, 100, 105, 110, 97, 109, 105, 99, 97),
    chave(85, 110, 105, 100, 97, 100, 101, 80, 111, 116, 101, 110, 99, 105, 97),
  ];
  const nomesAntigos = new RegExp(
    `"(?:(?:${camposAntigos.slice(0, 6).join("|")}))"|\\b(?:${camposAntigos.slice(6).join("|")})\\b`,
    "i",
  );

  for (const arquivo of arquivos) {
    const conteudo = fs.readFileSync(
      path.join(__dirname, arquivo),
      "utf8",
    );
    assert.doesNotMatch(conteudo, nomesAntigos, arquivo);
  }
});
