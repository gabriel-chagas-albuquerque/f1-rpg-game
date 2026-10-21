const test = require("node:test");
const assert = require("node:assert/strict");

const resolverTimelineCorrida = require("../funcoes/resolverTimelineCorrida");
const calcularOrdemDeChegada = require("../funcoes/calcularOrdemDeChegada");
const configuracoes = require("../pesos.json");
const pilotos = require("../pilotos.json");
const equipes = require("../equipes.json");

const criarResultado = ({
  piloto,
  posicaoLargada,
  posicaoMediaReal = posicaoLargada,
  dnf = false,
  falhaHumana = false,
  falhaDurabilidade = false,
}) => ({
  piloto,
  posicaoLargada,
  posicaoMediaReal,
  dnf: {
    ocorreu: dnf,
    causa: dnf ? (falhaHumana ? "falhaHumana" : "falhaDurabilidade") : null,
    voltaAbandono: null,
  },
  falhaDurabilidade: {
    ocorreu: falhaDurabilidade || (dnf && !falhaHumana),
    dnf: dnf && !falhaHumana,
    voltaAbandono: null,
  },
  falhaHumana: {
    ocorreu: falhaHumana || (dnf && falhaHumana),
    dnf: dnf && falhaHumana,
    voltaAbandono: null,
  },
});

test("grupos por posição média usam voltas de 6 até o fim da corrida", () => {
  const resultado = criarResultado({
    piloto: "A",
    posicaoLargada: 1,
    posicaoMediaReal: 4,
    falhaHumana: true,
  });
  const { eventos } = resolverTimelineCorrida(
    [resultado],
    10,
    () => 0.999,
  );

  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].id, 2);
  assert.equal(eventos[0].categoria, "posicaoMediaReal");
  assert.equal(eventos[0].volta, 10);
});

test("grupo selecionado purga sobreposições e SC bloqueia voltas futuras", () => {
  const dnf = criarResultado({
    piloto: "A",
    posicaoLargada: 1,
    dnf: true,
  });
  const moderada = criarResultado({
    piloto: "B",
    posicaoLargada: 8,
    falhaHumana: true,
  });
  const valores = [0, 0, 0, 0, 0];
  const rand = () => valores.shift() ?? 0.5;

  const { eventos, eventosSafetyCar } = resolverTimelineCorrida(
    [dnf, moderada],
    10,
    rand,
  );

  assert.deepEqual(
    eventos.map(({ grupoId, categoria, volta }) => ({
      grupoId,
      categoria,
      volta,
    })),
    [
      { grupoId: 1, categoria: "posicaoLargada", volta: 1 },
      { grupoId: 4, categoria: "posicaoMediaReal", volta: 8 },
    ],
  );
  assert.equal(dnf.dnf.voltaAbandono, 1);
  assert.equal(dnf.dnf.grupoId, 1);
  assert.equal(dnf.falhaDurabilidade.voltaAbandono, 1);
  assert.equal(moderada.dnf.ocorreu, false);
  assert.equal(moderada.falhaHumana.voltaAbandono, null);
  assert.deepEqual(
    eventosSafetyCar.map(({ grupoId, voltaInicio, duracao }) => ({
      grupoId,
      voltaInicio,
      duracao,
    })),
    [{ grupoId: 1, voltaInicio: 1, duracao: 1 }],
  );
});

test("falhas exclusivamente mecânicas ficam em grupos isolados", () => {
  const resultados = [
    criarResultado({
      piloto: "A",
      posicaoLargada: 1,
      falhaDurabilidade: true,
    }),
    criarResultado({
      piloto: "B",
      posicaoLargada: 2,
      falhaDurabilidade: true,
    }),
  ];
  const { eventos } = resolverTimelineCorrida(
    resultados,
    10,
    () => 0,
    false,
  );

  assert.equal(eventos.length, 2);
  assert.ok(eventos.every((evento) => evento.pilotos.length === 1));
  assert.deepEqual(
    eventos.map((evento) => evento.pilotos[0].piloto).sort(),
    ["A", "B"],
  );
});

test("categoria do incidente tem 10% de largada e inicia nas voltas corretas", () => {
  const criarFalha = () =>
    criarResultado({
      piloto: "A",
      posicaoLargada: 1,
      falhaHumana: true,
    });
  const largada = resolverTimelineCorrida(
    [criarFalha()],
    10,
    (() => {
      const valores = [0, 0, 0];
      return () => valores.shift() ?? 0;
    })(),
    false,
  ).eventos[0];
  const resto = resolverTimelineCorrida(
    [criarFalha()],
    10,
    (() => {
      const valores = [0.1, 0, 0];
      return () => valores.shift() ?? 0;
    })(),
    false,
  ).eventos[0];

  assert.equal(largada.categoria, "posicaoLargada");
  assert.ok(largada.volta >= 1 && largada.volta <= 5);
  assert.equal(resto.categoria, "posicaoMediaReal");
  assert.ok(resto.volta >= 6 && resto.volta <= 10);
});

test("a escolha da categoria mantém 10% de largada e 90% do restante", () => {
  let incidentesNaLargada = 0;
  for (let indice = 0; indice < 100; indice++) {
    const valores = [indice % 10 === 0 ? 0 : 0.1, 0, 0];
    const evento = resolverTimelineCorrida(
      [
        criarResultado({
          piloto: `Piloto ${indice}`,
          posicaoLargada: 1,
          falhaHumana: true,
        }),
      ],
      10,
      () => valores.shift() ?? 0,
      false,
    ).eventos[0];
    if (evento.categoria === "posicaoLargada") incidentesNaLargada++;
  }

  assert.equal(incidentesNaLargada, 10);
});

test("no máximo um incidente ocorre na largada; os demais ficam após a volta 5", () => {
  const resultados = Array.from({ length: 12 }, (_, indice) =>
    criarResultado({
      piloto: `Piloto ${indice}`,
      posicaoLargada: indice * 4 + 1,
      posicaoMediaReal: indice * 4 + 1,
      falhaHumana: true,
    }),
  );
  const { eventos } = resolverTimelineCorrida(
    resultados,
    30,
    () => 0,
    false,
  );
  const incidentesNaLargada = eventos.filter(
    (evento) => evento.categoria === "posicaoLargada",
  );

  assert.equal(incidentesNaLargada.length, 1);
  assert.ok(
    eventos
      .filter((evento) => evento.categoria !== "posicaoLargada")
      .every((evento) => evento.volta > 5),
  );
});

test("não cria catálogo ou timeline sem falhas", () => {
  const resultado = criarResultado({ piloto: "A", posicaoLargada: 1 });
  assert.deepEqual(
    resolverTimelineCorrida([resultado], 10, () => 0),
    { eventos: [], eventosSafetyCar: [] },
  );
});

test("modo comparativo pode desativar SC sem remover incidentes ou DNFs", () => {
  const resultado = criarResultado({
    piloto: "A",
    posicaoLargada: 1,
    dnf: true,
  });
  const { eventos, eventosSafetyCar } = resolverTimelineCorrida(
    [resultado],
    10,
    () => 0,
    false,
  );

  assert.equal(eventos.length, 1);
  assert.equal(resultado.dnf.voltaAbandono, 1);
  assert.deepEqual(eventosSafetyCar, []);
});

test("posição média real usa grid e ranking do score sem ordenação por DNF", () => {
  const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));
  const grid = pilotos.slice(0, 6).map((piloto, indice) => ({
    piloto,
    equipe: equipePorNome.get(piloto.equipe),
    posicaoLargada: indice + 1,
    scoreQualificacao: 0,
  }));
  const pesosCorrida = JSON.parse(
    JSON.stringify(configuracoes[0].pesos.corrida),
  );
  Object.assign(pesosCorrida.falhas, {
    ProbFalhaHumanaBase: 0,
    ProbFalhaMecanicaBase: 0,
  });
  const aleatorioOriginal = Math.random;
  Math.random = () => 0.5;
  let resultados;
  try {
    resultados = calcularOrdemDeChegada(
      grid,
      pesosCorrida,
      0,
      1,
      configuracoes[0].voltas,
      { teto_dnf: 0 },
    );
  } finally {
    Math.random = aleatorioOriginal;
  }

  const porRitmo = [...resultados].sort(
    (a, b) => b.scoreTotal - a.scoreTotal || a.posicaoLargada - b.posicaoLargada,
  );
  for (const [indice, resultado] of porRitmo.entries()) {
    assert.equal(resultado.posicaoRitmo, indice + 1);
    assert.equal(
      resultado.posicaoMediaReal,
      (resultado.posicaoLargada + resultado.posicaoRitmo) / 2,
    );
    assert.equal(resultado.dnf.ocorreu, false);
  }
});
