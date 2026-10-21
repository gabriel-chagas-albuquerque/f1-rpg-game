// Executar com: node --test testes/distribuicoesPE.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calcularQuantis,
  percentilPosicao,
  percentilResiduo,
  transformarPercentil,
  viesPosicoes,
  viesResiduos,
} = require("../funcoes/distribuicoesPE");
const { calcularPE } = require("../funcoes/sistemaPE");

const EXPOENTE = 0.7;

test("percentilPosicao usa posto médio e fica em [0, 1]", () => {
  const hist = [40, 30, 20, 10];
  assert.equal(percentilPosicao(hist, 1), 0.2);
  assert.equal(percentilPosicao(hist, 2), 0.55);
  assert.equal(percentilPosicao(hist, 4), 0.95);
  assert.throws(() => percentilPosicao(hist, 5));
  assert.throws(() => percentilPosicao([0, 0, 0], 1));
});

test("a média do valor transformado menos o viés é exatamente 0 para qualquer histograma", () => {
  for (const hist of [[40, 30, 20, 10], [100, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1], [0, 5, 90, 5, 0]]) {
    const total = hist.reduce((a, b) => a + b, 0);
    const vies = viesPosicoes(hist, EXPOENTE);
    const media = hist.reduce(
      (soma, contagem, i) =>
        soma + (contagem / total) * (transformarPercentil(percentilPosicao(hist, i + 1), EXPOENTE) - vies),
      0,
    );
    assert.ok(Math.abs(media) < 1e-12, `média ${media} para ${hist}`);
  }
});

test("transformarPercentil é simétrico, monótono e limitado a [-1, 1]", () => {
  assert.equal(transformarPercentil(0.5, EXPOENTE), 0);
  assert.ok(Math.abs(transformarPercentil(0.2, EXPOENTE) + transformarPercentil(0.8, EXPOENTE)) < 1e-12);
  assert.equal(transformarPercentil(0, EXPOENTE), 1);
  assert.equal(transformarPercentil(1, EXPOENTE), -1);
  let anterior = Infinity;
  for (let p = 0; p <= 1; p += 0.05) {
    const valor = transformarPercentil(p, EXPOENTE);
    assert.ok(valor <= anterior);
    anterior = valor;
  }
});

test("calcularQuantis e percentilResiduo: extremos, empates e interpolação", () => {
  const quantis = calcularQuantis([1, 2, 3, 4, 5], 5);
  assert.deepEqual(quantis, [1, 2, 3, 4, 5]);
  assert.equal(percentilResiduo(quantis, 0), 0);
  assert.equal(percentilResiduo(quantis, 6), 1);
  assert.equal(percentilResiduo(quantis, 3), 0.5);
  assert.equal(percentilResiduo(quantis, 2.5), 0.375);
  const comEmpate = [0, 1, 1, 1, 2];
  assert.equal(percentilResiduo(comEmpate, 1), 0.5); // média do trecho empatado
  assert.throws(() => percentilResiduo([2, 1], 1));
  assert.throws(() => calcularQuantis([], 5));
});

test("viesResiduos centraliza a média dos resíduos neutros em 0", () => {
  const residuos = Array.from({ length: 2000 }, (_, i) => Math.sin(i) * 3 + (i % 7) * 0.4 - 1);
  const quantis = calcularQuantis(residuos, 101);
  const vies = viesResiduos(residuos, quantis, EXPOENTE);
  const media =
    residuos.reduce(
      (soma, r) => soma + transformarPercentil(percentilResiduo(quantis, r), EXPOENTE) - vies,
      0,
    ) / residuos.length;
  assert.ok(Math.abs(media) < 1e-12);
});

test("calcularPE: piloto neutro tem Q e R médios 0 em carros esperados em P2 e em P20", () => {
  const configBase = { NORMALIZACAO: "percentil" };
  for (const alvo of [{ eq: 2, hist: [30, 40, 20, 8, 2, 0, 0, 0, 0, 0] }, { eq: 9, hist: [0, 0, 0, 0, 2, 10, 20, 40, 20, 8] }]) {
    const largada = alvo.hist.length > 5 && alvo.eq > 5 ? 9 : 2;
    const finais = Array.from({ length: alvo.hist.length }, (_, i) => i + 1);
    const modelo = { a: 0, b: 0.5, c: 0.5 };
    const ec = alvo.eq;
    const esperadoFinal = modelo.a + modelo.b * largada + modelo.c * ec;
    const residuos = finais.flatMap((f, i) => Array(alvo.hist[i]).fill(f - esperadoFinal));
    const quantisR = calcularQuantis(residuos, 101);
    const expectativas = {
      Pista: {
        seco: {
          EQ: { Equipe: alvo.eq },
          EC: { Equipe: ec },
          modeloCorrida: modelo,
          distQ: { Equipe: { hist: alvo.hist } },
          distR: { Equipe: { quantis: quantisR } },
          viesQ: { Equipe: viesPosicoes(alvo.hist, EXPOENTE) },
          viesR: { Equipe: viesResiduos(residuos, quantisR, EXPOENTE) },
          expoente: EXPOENTE,
        },
      },
    };
    let somaQ = 0, somaR = 0, total = 0;
    alvo.hist.forEach((contagem, i) => {
      if (contagem === 0) return;
      const calculo = calcularPE(
        {
          pista: "Pista",
          clima: "seco",
          safetyCar: false,
          piloto: { piloto: "X", equipe: "Equipe", pilotoJogador: true },
          qualificacao: { posicao: i + 1 },
          corrida: {
            posicaoLargada: largada,
            posicaoFinal: i + 1,
            dnf: null,
            falhaHumanaModerada: false,
            falhaMecanicaModerada: false,
          },
        },
        expectativas,
        { config: configBase },
      );
      somaQ += contagem * calculo.componentes.Q;
      somaR += contagem * calculo.componentes.R;
      total += contagem;
    });
    assert.ok(Math.abs(somaQ / total) < 1e-9, `Q médio ${somaQ / total}`);
    assert.ok(Math.abs(somaR / total) < 1e-9, `R médio ${somaR / total}`);
  }
});

test("calcularPE recusa expectativas sem distribuições ou com outro expoente", () => {
  const entrada = {
    pista: "Pista",
    clima: "seco",
    safetyCar: false,
    piloto: { piloto: "X", equipe: "Equipe", pilotoJogador: true },
    qualificacao: { posicao: 1 },
    corrida: { posicaoLargada: 1, posicaoFinal: 1, dnf: null, falhaHumanaModerada: false, falhaMecanicaModerada: false },
  };
  const semDistribuicoes = {
    Pista: { seco: { EQ: { Equipe: 1 }, EC: { Equipe: 1 }, modeloCorrida: { a: 0, b: 1, c: 0 } } },
  };
  assert.throws(() => calcularPE(entrada, semDistribuicoes, { config: { NORMALIZACAO: "percentil" } }), /Distribuições ausentes/);
  const outroExpoente = {
    Pista: {
      seco: {
        EQ: { Equipe: 1 }, EC: { Equipe: 1 }, modeloCorrida: { a: 0, b: 1, c: 0 },
        distQ: { Equipe: { hist: [1, 1] } }, distR: { Equipe: { quantis: [0, 1] } },
        viesQ: { Equipe: 0 }, viesR: { Equipe: 0 }, expoente: 0.5,
      },
    },
  };
  assert.throws(() => calcularPE(entrada, outroExpoente, { config: { NORMALIZACAO: "percentil" } }), /outro expoente/);
});
