// Teste autocontido (grid e config embutidos): node tests/falhas.test.js
const assert = require("node:assert/strict");
const readJson = require("../funcoes/readJson");
const calcularProbabilidadeFalha = require("../funcoes/calcularProbabilidadeFalha");
const { probabilidadeBanda, validarConfig } = calcularProbabilidadeFalha;
const gerador = require("../descritoresParaPesos");

// Config: o arquivo real, para que o teste valide os valores que você ajustar.
const config = validarConfig(readJson("configuracaoFalhas.json"));
// Consistência real do grid (22 pilotos: 70 a 92, média 84,77, mediana 85).
const consistencias = [70, 76, 80, 82, 82, 82, 83, 83, 84, 84, 85, 85, 86, 86, 87, 88, 88, 90, 90, 90, 92, 92];
// Durabilidade das 11 equipes: valores de exemplo cobrindo 35 a 94 (troque pelos reais se quiser).
const duracoes = [94, 88, 80, 72, 66, 64, 60, 55, 50, 42, 35];
const grid = consistencias.map((c, i) => ({ consistencia: c, durabilidade: duracoes[Math.floor(i / 2)] }));
const ctx = { grid, config };
const arquivo = readJson("gerar-pesos/descritores.json");
const clonar = (o) => JSON.parse(JSON.stringify(o));
const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

let n = 0;
const teste = (nome, fn) => { fn(); n++; console.log(`ok - ${nome}`); };

teste("faixa: máximo no atributo mínimo, mínimo no atributo máximo", () => {
  for (const tipo of ["mecanica", "humana"]) {
    const c = config[tipo];
    perto(probabilidadeBanda(tipo, c.atributoMinimo, config), c.porcentagemMaxima / 100, 1e-9, `${tipo} no mínimo`);
    perto(probabilidadeBanda(tipo, c.atributoMaximo, config), c.porcentagemMinima / 100, 1e-9, `${tipo} no máximo`);
  }
});

teste("faixa: decrescente e limitada fora do intervalo", () => {
  for (const tipo of ["mecanica", "humana"]) {
    const c = config[tipo];
    let anterior = Infinity;
    for (let a = c.atributoMinimo; a <= c.atributoMaximo; a++) {
      const p = probabilidadeBanda(tipo, a, config);
      assert.ok(p <= anterior + 1e-12, `${tipo} não decrescente em ${a}`);
      anterior = p;
    }
    assert.equal(probabilidadeBanda(tipo, 0, config), probabilidadeBanda(tipo, c.atributoMinimo, config));
    assert.equal(probabilidadeBanda(tipo, 100, config), probabilidadeBanda(tipo, c.atributoMaximo, config));
  }
});

teste("função: fator escala a faixa, limita em 1 e exige o tipo", () => {
  perto(calcularProbabilidadeFalha(0.5, 50, "mecanica", config), 0.5 * probabilidadeBanda("mecanica", 50, config), 1e-12, "fator");
  assert.equal(calcularProbabilidadeFalha(10, 35, "mecanica", config), 1);
  assert.throws(() => calcularProbabilidadeFalha(1, 50), /Tipo de falha inválido/);
  assert.throws(() => calcularProbabilidadeFalha(-1, 50, "humana", config), /Fator base/);
  assert.throws(() => calcularProbabilidadeFalha(1, 101, "humana", config), /Atributo/);
});

teste("gerador: reproduz dnf_por_corrida e a proporção humano/mecânico nas 24 pistas", () => {
  const geradas = gerador.gerarConfiguracoes(arquivo, ctx);
  assert.equal(geradas.length, arquivo.pistas.length);
  const padroes = gerador.validarPadroes(arquivo.padroes);
  arquivo.pistas.forEach((pista, i) => {
    const d = gerador.normalizarPista(pista, padroes);
    const e = gerador.esperadoDeFalhas(geradas[i].pesos.corrida.falhas, ctx);
    perto(e.total, d.corrida.falhas.dnfPorCorrida, 0.002, `${d.GP} DNF total`);
    perto(e.humano / e.total, d.corrida.falhas.pctDnfHumano, 0.002, `${d.GP} proporção humana`);
  });
});

teste("quali: fator = fator da corrida x multiplicador de cada pista (inclusive zero)", () => {
  const geradas = gerador.gerarConfiguracoes(arquivo, ctx);
  arquivo.pistas.forEach((pista, i) => {
    const m = pista.quali.falhas.multiplicador_vs_corrida;
    const { corrida, qualificacao } = geradas[i].pesos;
    perto(qualificacao.falhas.FatorBaseFalhaHumana, corrida.falhas.FatorBaseFalhaHumana * m.humana, 0.0003, `${pista.GP} humana`);
    perto(qualificacao.falhas.FatorBaseFalhaMecanica, corrida.falhas.FatorBaseFalhaMecanica * m.mecanica, 0.0003, `${pista.GP} mecânica`);
  });
  const a = clonar(arquivo);
  a.pistas[1].quali.falhas = { multiplicador_vs_corrida: { humana: 1.1, mecanica: 0 } };
  const g = gerador.gerarConfiguracoes(a, ctx)[1].pesos;
  perto(g.qualificacao.falhas.FatorBaseFalhaHumana, g.corrida.falhas.FatorBaseFalhaHumana * 1.1, 0.0003, "humana 1,1");
  assert.equal(g.qualificacao.falhas.FatorBaseFalhaMecanica, 0);
});

teste("quali: multiplicador que estoura 100%, pista sem o bloco e padroes.quali.falhas falham com mensagem clara", () => {
  const a = clonar(arquivo);
  a.pistas[0].quali.falhas = { multiplicador_vs_corrida: { humana: 20, mecanica: 0.2 } };
  assert.throws(() => gerador.gerarConfiguracoes(a, ctx), /> 1/);
  const b = clonar(arquivo);
  delete b.pistas[2].quali.falhas;
  assert.throws(() => gerador.gerarConfiguracoes(b, ctx), new RegExp(`${b.pistas[2].GP}\\.quali\\.falhas: ausente`));
  const c = clonar(arquivo);
  c.padroes.quali.falhas = { multiplicador_vs_corrida: { humana: 1, mecanica: 1 } };
  assert.throws(() => gerador.gerarConfiguracoes(c, ctx), /padroes\.quali\.falhas: removido/);
  const e = clonar(arquivo);
  e.pistas[0].quali.falhas = { multiplicador_vs_corrida: { humana: 1 } };
  assert.throws(() => gerador.gerarConfiguracoes(e, ctx), /mecanica: número ausente/);
});

teste("fator_base_falha manual vale só para o tipo informado", () => {
  const a = clonar(arquivo);
  a.pistas[0].corrida.falhas.fator_base_falha = { humana: 0.5 };
  const base = gerador.gerarConfiguracoes(arquivo, ctx)[0].pesos.corrida.falhas;
  const manual = gerador.gerarConfiguracoes(a, ctx)[0].pesos.corrida.falhas;
  assert.equal(manual.FatorBaseFalhaHumana, 0.5);
  assert.equal(manual.FatorBaseFalhaMecanica, base.FatorBaseFalhaMecanica);
});

teste("meta impossível (probabilidade > 1) falha com mensagem clara", () => {
  const a = clonar(arquivo);
  a.pistas[0].corrida.falhas.dnf_por_corrida = 20;
  assert.throws(() => gerador.gerarConfiguracoes(a, ctx), /> 1/);
});

teste("campos desconhecidos e config inválida são rejeitados", () => {
  const a = clonar(arquivo);
  a.pistas[0].precisao = 0.5;
  assert.throws(() => gerador.gerarConfiguracoes(a, ctx), /campo desconhecido "precisao"/);
  assert.throws(() => validarConfig({ mecanica: {} }), /ausente|inválido/);
  assert.throws(() => gerador.probFalhaMecEquipe(), /removida/);
});

console.log(`\n${n} testes passaram.`);