// Gera pesos.json a partir de gerar-pesos/descritores.json.
//
// REGRA ÚNICA: cada descritor controla UM conjunto de pesos e nada mais.
// Só existem duas operações, e ambas aparecem aqui de forma explícita:
//   1) valor direto          -> vira peso (ou parâmetro) sem outra dependência
//   2) vetor de importâncias -> normalizado para somar 1 (piloto e carro, corrida e quali)
//
// Descritor (por pista)                  Efeito
// ------------------------------------   ---------------------------------------------------
// corrida.peso_largada                   WPosInicial (direto)
// corrida.piloto_vs_carro                fatia de (1 - WPosInicial) que vai ao piloto
// corrida.piloto.*                       vetor de pesos do piloto na corrida (normalizado)
// corrida.carro.*                        vetor de pesos do carro na corrida (normalizado)
// corrida.falhas.dnf_por_corrida         meta de DNFs por corrida (define o NÍVEL de falhas da pista)
// corrida.falhas.pct_dnf_humano          parte desses DNFs causada por erro do piloto (o resto é mecânico)
// corrida.falhas.letalidade_humana       fração das falhas humanas que viram DNF
// corrida.falhas.letalidade_mecanica     fração das falhas mecânicas que viram DNF
// corrida.falhas.fator_base_falha        (opcional) { humana, mecanica }: fixa o fator em vez de calculá-lo.
//                                        1 = usa a faixa de configuracaoFalhas.json; <1 atenua; >1 amplia
// corrida.falhas.severidade              multiplicadorSeveridadeFalha (direto)
// corrida.falhas.penalidade_z            [min, max] de PenalidadeZ (direto)
// corrida.intensidade_operacoes          intensidadeOperacoes (direto)
// corrida.safety_car.prob / .rng         pct_safety_car e RngSafetyCar (direto)
// quali.piloto_vs_carro                  WPiloto da quali (direto; WEquipe = 1 - WPiloto)
// quali.piloto.* (opcional)              vetor do piloto na quali; senão usa padroes
// quali.carro_fatores.* (opcional)       multiplicadores do carro na quali; senão usa padroes
// quali.penalidade_z (opcional)          senão = corrida.penalidade_z * fatorPenalidadeQuali
// quali.falhas.multiplicador_vs_corrida  { humana, mecanica } (obrigatório em cada pista): fator de falha da
//                                        quali = fator da corrida x multiplicador (1 = igual; 1,1 = +10%; 0,2 = -80%)
// escala_rng                             multiplica TODAS as bases de RNG (1 = padrão)
//
// FALHAS: probabilidade por piloto e corrida = min(1, fatorBase x faixa(atributo)).
//   - faixa(atributo): sigmoide de configuracaoFalhas.json (humana: consistência; mecânica: durabilidade).
//     Ela define a DIFERENÇA entre pilotos/equipes. O fator base define o NÍVEL da pista.
//   - O gerador calcula o fator base para que o grid atual (pilotos.json + equipes.json) produza
//     exatamente dnf_por_corrida, com a proporção pct_dnf_humano.
//   - A MESMA função (funcoes/calcularProbabilidadeFalha.js) é usada aqui e no simulador.
//   - Se pilotos.json/equipes.json mudarem, regenere os pesos.
//   - Quali: fator = fator da corrida da pista x multiplicador_vs_corrida. A quali não gera DNF
//     (FracaoDNF = 0): as falhas viram só penalidade.
//
// Campos desconhecidos são rejeitados: se um descritor existe no arquivo, ele tem efeito.
// Uso: node descritoresParaPesos.js [--resumo | --verificar | --estatisticas |
//                                      --comparar [--tolerancia=0.005] | --escrever]

const fs = require("node:fs");
const path = require("node:path");
const readJson = require("./funcoes/readJson");
const calcularProbabilidadeFalha = require("./funcoes/calcularProbabilidadeFalha");
const { probabilidadeBanda, carregarConfig } = calcularProbabilidadeFalha;
const desvioNormalTruncada = require("./funcoes/gerarNormalTruncada"); // só reexportado (compatibilidade)

const CFG = {
  pisoCarro: 0.03, // soma ao descritor do carro antes de normalizar (nenhum atributo some)
  rngBases: {
    corrida: { piloto: 1.4, carro: 1.4, operacoes: 4.0, largada: 0.5 },
    quali: { piloto: 1.2, carro: 0.85, operacoes: 3.0 },
  },
  fatorPenalidadeQuali: 0.5,
};

const CARRO = {
  aero_carga: "AeroCarga", aero_eficiencia: "AeroEficiencia", chassi: "Chassi", tracao: "Tracao",
  potencia: "Potencia", operacoes: "Operacoes", pneus: "GestaoPneus",
};
const PILOTO_CORRIDA = {
  velocidade: "VelocidadeCorrida", racecraft: "Racecraft", gerenciamento: "Gerenciamento",
  fisico: "Fisico", adaptabilidade: "Adaptabilidade",
};
const PILOTO_QUALI = {
  velocidade: "VelocidadeQualificacao", adaptabilidade: "Adaptabilidade", gerenciamento: "Gerenciamento",
  fisico: "Fisico",
};
const TODOS_PILOTO = [
  "VelocidadeQualificacao", "VelocidadeCorrida", "Racecraft", "Gerenciamento", "Adaptabilidade", "Fisico",
];
const ATRIBUTOS_EQUIPE = Object.values(CARRO);
const CAMPO_ATRIBUTO = { humana: "consistencia", mecanica: "durabilidade" };

// ---------- utilitários ----------
const r3 = (x) => Math.round(x * 1000) / 1000;
const r4 = (x) => Math.round(x * 10000) / 10000;
const mapear = (o, fn) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v)]));
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Arredonda em 3 casas e garante soma exatamente 1 (maior resto, em milésimos inteiros).
const arredondarSomaUm = (o) => {
  const chaves = Object.keys(o);
  const brutos = chaves.map((k) => o[k] * 1000);
  const inteiros = brutos.map(Math.floor);
  let diferenca = 1000 - inteiros.reduce((a, b) => a + b, 0);
  const restos = brutos.map((v, i) => ({ i, resto: v - inteiros[i] })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let n = 0; diferenca > 0; n = (n + 1) % restos.length, diferenca--) inteiros[restos[n].i] += 1;
  const crescente = [...restos].reverse();
  for (let n = 0; diferenca < 0; n = (n + 1) % crescente.length) {
    if (inteiros[crescente[n].i] > 0) { inteiros[crescente[n].i] -= 1; diferenca++; }
  }
  return Object.fromEntries(chaves.map((k, i) => [k, inteiros[i] / 1000]));
};

// Vetor de importâncias -> pesos que somam 1. Único mecanismo usado para piloto e carro.
const vetor = (imp, mapa, { piso = 0, fatores = null } = {}) => {
  const bruto = {};
  for (const [k, nome] of Object.entries(mapa)) bruto[nome] = (imp[k] + piso) * (fatores ? fatores[k] : 1);
  const soma = Object.values(bruto).reduce((a, b) => a + b, 0);
  if (!(soma > 0)) throw new Error("Vetor de pesos com soma zero.");
  return mapear(bruto, (v) => v / soma);
};
const preencherPiloto = (parcial) => Object.fromEntries(TODOS_PILOTO.map((k) => [k, parcial[k] ?? 0]));

// Cada piloto do grid com a durabilidade da sua equipe.
const contextoDoGrid = () => {
  const pilotos = readJson("pilotos.json");
  const duraPorEquipe = new Map(readJson("equipes.json").map((e) => [e.equipe, e.durabilidade]));
  const grid = pilotos.map((p) => {
    if (!duraPorEquipe.has(p.equipe)) throw new Error(`Equipe "${p.equipe}" de ${p.piloto} não está em equipes.json.`);
    return { consistencia: p.consistencia, durabilidade: duraPorEquipe.get(p.equipe) };
  });
  return { grid, config: carregarConfig() };
};

// ---------- fator base de falhas ----------
const bandaDoGrid = (tipo, ctx) => ctx.grid.map((g) => probabilidadeBanda(tipo, g[CAMPO_ATRIBUTO[tipo]], ctx.config));

// Garante que fator x faixa não passe de 100% para nenhum piloto/equipe do grid.
const checarLimite = (tipo, fator, ctx, onde) => {
  const pior = fator * Math.max(...bandaDoGrid(tipo, ctx));
  if (pior > 1) {
    throw new Error(
      `${onde}: fator ${tipo} ${fator.toFixed(3)} levaria a probabilidade ${pior.toFixed(2)} (> 1). ` +
      "Reduza o fator, a meta de DNF ou o multiplicador, ou revise a faixa em configuracaoFalhas.json.",
    );
  }
  return fator;
};

// Fator tal que a probabilidade média por piloto seja `alvo` (ou o valor manual, se houver).
const definirFator = (tipo, alvo, manual, ctx, onde) => {
  const mediaBanda = media(bandaDoGrid(tipo, ctx));
  if (!(mediaBanda > 0)) throw new Error(`${onde}: faixa ${tipo} com média zero no grid.`);
  return checarLimite(tipo, manual ?? alvo / mediaBanda, ctx, onde);
};

// ---------- validação ----------
const erro = (onde, msg) => { throw new Error(`${onde}: ${msg}`); };
const checarChaves = (obj, permitidas, onde) => {
  for (const k of Object.keys(obj)) {
    if (!k.startsWith("_") && !permitidas.includes(k)) erro(onde, `campo desconhecido "${k}"`);
  }
};
const objeto = (v, onde) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) erro(onde, "esperado um objeto");
  return v;
};
const numero = (v, onde, min, max, { minExclusivo = false } = {}) => {
  if (typeof v !== "number" || !Number.isFinite(v)) erro(onde, "número ausente ou inválido");
  if (v < min || v > max || (minExclusivo && v === min)) {
    erro(onde, `deve estar entre ${min}${minExclusivo ? " (exclusivo)" : ""} e ${max}`);
  }
  return v;
};
const importancias = (v, mapa, onde, base = {}) => {
  const obj = { ...base, ...objeto(v ?? {}, onde) };
  checarChaves(obj, Object.keys(mapa), onde);
  const out = {};
  for (const k of Object.keys(mapa)) out[k] = numero(obj[k], `${onde}.${k}`, 0, 1);
  if (Object.values(out).every((x) => x === 0)) erro(onde, "pelo menos uma importância deve ser > 0");
  return out;
};
const faixa = (v, onde) => {
  if (!Array.isArray(v) || v.length !== 2) erro(onde, "esperado [min, max]");
  const [a, b] = v;
  numero(a, `${onde}[0]`, 0, Infinity);
  numero(b, `${onde}[1]`, 0, Infinity);
  if (a > b) erro(onde, "min deve ser <= max");
  return [a, b];
};
const fatorManual = (v, onde) => {
  if (v === undefined) return { humana: null, mecanica: null };
  const obj = objeto(v, onde);
  checarChaves(obj, ["humana", "mecanica"], onde);
  const um = (x, nome) => (x === undefined ? null : numero(x, `${onde}.${nome}`, 0, 20));
  return { humana: um(obj.humana, "humana"), mecanica: um(obj.mecanica, "mecanica") };
};

const multiplicadores = (v, onde, base = {}) => {
  const obj = { ...base, ...objeto(v ?? {}, onde) };
  checarChaves(obj, ["humana", "mecanica"], onde);
  return {
    humana: numero(obj.humana, `${onde}.humana`, 0, 20),
    mecanica: numero(obj.mecanica, `${onde}.mecanica`, 0, 20),
  };
};

const validarPadroes = (p) => {
  objeto(p, "padroes");
  checarChaves(p, ["escala_rng", "corrida", "quali"], "padroes");
  const sc = objeto(objeto(p.corrida, "padroes.corrida").safety_car, "padroes.corrida.safety_car");
  checarChaves(sc, ["prob", "rng"], "padroes.corrida.safety_car");
  const q = objeto(p.quali, "padroes.quali");
  if (q.falhas !== undefined) {
    erro("padroes.quali.falhas", "removido: defina quali.falhas.multiplicador_vs_corrida em cada pista.");
  }
  checarChaves(q, ["piloto", "carro_fatores"], "padroes.quali");
  return {
    escala_rng: numero(p.escala_rng, "padroes.escala_rng", 0, 3, { minExclusivo: true }),
    safetyCar: {
      prob: numero(sc.prob, "padroes.corrida.safety_car.prob", 0, 1),
      rng: numero(sc.rng, "padroes.corrida.safety_car.rng", 0, 5),
    },
    qualiPiloto: importancias(q.piloto, PILOTO_QUALI, "padroes.quali.piloto"),
    qualiCarroFatores: importancias(q.carro_fatores, CARRO, "padroes.quali.carro_fatores"),
  };
};

const normalizarPista = (p, padroes) => {
  objeto(p, "pista");
  const gp = p.GP;
  if (typeof gp !== "string" || gp.trim() === "") erro("pista", "GP ausente");
  checarChaves(p, ["GP", "voltas", "pct_chuva", "escala_rng", "corrida", "quali"], gp);
  if (!Number.isInteger(p.voltas) || p.voltas < 1) erro(gp, "voltas inválidas");

  const c = objeto(p.corrida, `${gp}.corrida`);
  checarChaves(c, ["peso_largada", "piloto_vs_carro", "piloto", "carro", "falhas", "intensidade_operacoes", "safety_car"], `${gp}.corrida`);
  const f = objeto(c.falhas, `${gp}.corrida.falhas`);
  checarChaves(f, ["dnf_por_corrida", "pct_dnf_humano", "letalidade_humana", "letalidade_mecanica", "fator_base_falha", "severidade", "penalidade_z"], `${gp}.corrida.falhas`);
  const q = objeto(p.quali, `${gp}.quali`);
  checarChaves(q, ["piloto_vs_carro", "piloto", "carro_fatores", "penalidade_z", "falhas"], `${gp}.quali`);
  if (q.falhas === undefined) {
    erro(`${gp}.quali.falhas`, 'ausente. Adicione: "falhas": { "multiplicador_vs_corrida": { "humana": 0.75, "mecanica": 0.35 } }');
  }
  const qfBruto = objeto(q.falhas, `${gp}.quali.falhas`);
  checarChaves(qfBruto, ["multiplicador_vs_corrida"], `${gp}.quali.falhas`);
  const scBruto = c.safety_car === undefined ? {} : objeto(c.safety_car, `${gp}.corrida.safety_car`);
  checarChaves(scBruto, ["prob", "rng"], `${gp}.corrida.safety_car`);
  const sc = { ...padroes.safetyCar, ...scBruto };

  return {
    GP: gp,
    voltas: p.voltas,
    pct_chuva: numero(p.pct_chuva, `${gp}.pct_chuva`, 0, 1),
    escala_rng: numero(p.escala_rng ?? padroes.escala_rng, `${gp}.escala_rng`, 0, 3, { minExclusivo: true }),
    corrida: {
      pesoLargada: numero(c.peso_largada, `${gp}.corrida.peso_largada`, 0, 0.95),
      pilotoVsCarro: numero(c.piloto_vs_carro, `${gp}.corrida.piloto_vs_carro`, 0, 1),
      piloto: importancias(c.piloto, PILOTO_CORRIDA, `${gp}.corrida.piloto`),
      carro: importancias(c.carro, CARRO, `${gp}.corrida.carro`),
      intensidadeOperacoes: numero(c.intensidade_operacoes, `${gp}.corrida.intensidade_operacoes`, 0, 2),
      safetyCar: {
        prob: numero(sc.prob, `${gp}.corrida.safety_car.prob`, 0, 1),
        rng: numero(sc.rng, `${gp}.corrida.safety_car.rng`, 0, 5),
      },
      falhas: {
        dnfPorCorrida: numero(f.dnf_por_corrida, `${gp}.falhas.dnf_por_corrida`, 0, Infinity, { minExclusivo: true }),
        pctDnfHumano: numero(f.pct_dnf_humano, `${gp}.falhas.pct_dnf_humano`, 0, 1),
        letalidadeHumana: numero(f.letalidade_humana, `${gp}.falhas.letalidade_humana`, 0, 1, { minExclusivo: true }),
        letalidadeMecanica: numero(f.letalidade_mecanica, `${gp}.falhas.letalidade_mecanica`, 0, 1, { minExclusivo: true }),
        fatorBase: fatorManual(f.fator_base_falha, `${gp}.falhas.fator_base_falha`),
        severidade: numero(f.severidade, `${gp}.falhas.severidade`, 0, 2, { minExclusivo: true }),
        penalidadeZ: faixa(f.penalidade_z, `${gp}.falhas.penalidade_z`),
      },
    },
    quali: {
      pilotoVsCarro: numero(q.piloto_vs_carro, `${gp}.quali.piloto_vs_carro`, 0, 1),
      piloto: importancias(q.piloto, PILOTO_QUALI, `${gp}.quali.piloto`, padroes.qualiPiloto),
      carroFatores: importancias(q.carro_fatores, CARRO, `${gp}.quali.carro_fatores`, padroes.qualiCarroFatores),
      penalidadeZ: q.penalidade_z === undefined ? null : faixa(q.penalidade_z, `${gp}.quali.penalidade_z`),
      multiplicadorFalha: multiplicadores(qfBruto.multiplicador_vs_corrida, `${gp}.quali.falhas.multiplicador_vs_corrida`),
    },
  };
};

// ---------- geração ----------
const gerarPesos = (d, ctx) => {
  if (!ctx || !Array.isArray(ctx.grid) || ctx.grid.length === 0 || !ctx.config) {
    throw new Error("Contexto do grid inválido: esperado { grid: [{consistencia, durabilidade}], config }.");
  }
  const n = ctx.grid.length;
  const { corrida: c, quali: q } = d;
  const f = c.falhas;

  // corrida: largada (direto) + divisão do restante entre piloto e carro
  const resto = 1 - c.pesoLargada;
  const wPiloto = resto * c.pilotoVsCarro;
  const wEquipe = resto - wPiloto;

  // RNG: bases globais x escala da pista
  const rngC = mapear(CFG.rngBases.corrida, (b) => r3(b * d.escala_rng));
  const rngQ = mapear(CFG.rngBases.quali, (b) => r3(b * d.escala_rng));

  // falhas: probabilidade média por piloto que faz o grid render dnf_por_corrida (com a proporção pedida)
  const alvoH = (f.dnfPorCorrida * f.pctDnfHumano) / (n * f.letalidadeHumana);
  const alvoM = (f.dnfPorCorrida * (1 - f.pctDnfHumano)) / (n * f.letalidadeMecanica);
  const fatorH = definirFator("humana", alvoH, f.fatorBase.humana, ctx, d.GP);
  const fatorM = definirFator("mecanica", alvoM, f.fatorBase.mecanica, ctx, d.GP);
  // quali: fator da corrida da pista x multiplicador (ex.: 1,1 = 10% mais erro humano que na corrida)
  const fatorQH = checarLimite("humana", fatorH * q.multiplicadorFalha.humana, ctx, `${d.GP} (quali)`);
  const fatorQM = checarLimite("mecanica", fatorM * q.multiplicadorFalha.mecanica, ctx, `${d.GP} (quali)`);
  const zC = f.penalidadeZ;
  const zQ = q.penalidadeZ ?? zC.map((v) => v * CFG.fatorPenalidadeQuali);

  return {
    GP: d.GP, voltas: d.voltas, pct_chuva: d.pct_chuva,
    intensidadeOperacoes: r3(c.intensidadeOperacoes),
    multiplicadorSeveridadeFalha: r3(f.severidade),
    pesos: {
      qualificacao: {
        pesosGerais: {
          ...arredondarSomaUm({ WPiloto: q.pilotoVsCarro, WEquipe: 1 - q.pilotoVsCarro }),
          RngPiloto: rngQ.piloto, RngCarro: rngQ.carro, RngOperacoes: rngQ.operacoes,
        },
        falhas: {
          FatorBaseFalhaMecanica: r4(fatorQM), FatorBaseFalhaHumana: r4(fatorQH),
          FracaoDNFMecanica: 0, FracaoDNFHumana: 0,
          PenalidadeZMin: r3(zQ[0]), PenalidadeZMax: r3(zQ[1]),
        },
        piloto: arredondarSomaUm(preencherPiloto(vetor(q.piloto, PILOTO_QUALI))),
        equipe: arredondarSomaUm(vetor(c.carro, CARRO, { piso: CFG.pisoCarro, fatores: q.carroFatores })),
      },
      corrida: {
        pesosGerais: {
          ...arredondarSomaUm({ WPosInicial: c.pesoLargada, WPiloto: wPiloto, WEquipe: wEquipe }),
          RngPiloto: rngC.piloto, RngCarro: rngC.carro, RngOperacoes: rngC.operacoes, RngLargada: rngC.largada,
          RngSafetyCar: c.safetyCar.rng,
        },
        falhas: {
          FatorBaseFalhaMecanica: r4(fatorM), FatorBaseFalhaHumana: r4(fatorH),
          FracaoDNFMecanica: r3(f.letalidadeMecanica), FracaoDNFHumana: r3(f.letalidadeHumana),
          PenalidadeZMin: r3(zC[0]), PenalidadeZMax: r3(zC[1]),
        },
        piloto: arredondarSomaUm(preencherPiloto(vetor(c.piloto, PILOTO_CORRIDA))),
        equipe: arredondarSomaUm(vetor(c.carro, CARRO, { piso: CFG.pisoCarro })),
      },
    },
    pct_safety_car: c.safetyCar.prob,
  };
};

const gerarConfiguracoes = (arquivo, ctx = contextoDoGrid()) => {
  if (!arquivo || !Array.isArray(arquivo.pistas) || arquivo.pistas.length === 0) {
    throw new Error('O arquivo deve ter "padroes" e uma lista não vazia em "pistas".');
  }
  const padroes = validarPadroes(arquivo.padroes);
  const nomes = new Set();
  return arquivo.pistas.map((pista) => {
    const d = normalizarPista(pista, padroes);
    if (nomes.has(d.GP)) throw new Error(`Pista duplicada: ${d.GP}.`);
    nomes.add(d.GP);
    return gerarPesos(d, ctx);
  });
};

// ---------- diagnóstico ----------
const achatar = (o, pre = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) achatar(v, `${pre}${k}.`, out);
    else out[`${pre}${k}`] = v;
  }
  return out;
};

const comparar = (geradas, atuais, tolerancia = 0.005) => {
  const porGP = new Map(atuais.map((a) => [a.GP, a]));
  let total = 0, maior = { diff: 0, onde: "" };
  const fora = [];
  for (const g of geradas) {
    const a = porGP.get(g.GP);
    if (!a) { fora.push(`${g.GP}: ausente em pesos.json`); continue; }
    const fa = achatar(g), fb = achatar(a);
    for (const [k, v] of Object.entries(fa)) {
      if (typeof v !== "number") continue;
      total++;
      const diff = Math.abs(v - fb[k]);
      if (!(diff <= tolerancia)) fora.push(`${g.GP} ${k}: novo ${v} | atual ${fb[k]}`);
      if (diff > maior.diff) maior = { diff, onde: `${g.GP} ${k}` };
    }
  }
  console.log(`${total} campos comparados; maior diferença ${maior.diff.toFixed(4)} (${maior.onde}).`);
  console.log(fora.length ? `${fora.length} acima de ${tolerancia}:\n${fora.join("\n")}` : `Nenhum campo acima de ${tolerancia}.`);
};

// DNFs esperados reaplicando a função COMPARTILHADA sobre os fatores gravados (já arredondados).
const esperadoDeFalhas = (falhas, ctx) => {
  const soma = (tipo, fator) => ctx.grid.reduce(
    (s, g) => s + calcularProbabilidadeFalha(fator, g[CAMPO_ATRIBUTO[tipo]], tipo, ctx.config), 0);
  const humano = soma("humana", falhas.FatorBaseFalhaHumana) * falhas.FracaoDNFHumana;
  const mecanico = soma("mecanica", falhas.FatorBaseFalhaMecanica) * falhas.FracaoDNFMecanica;
  return { humano, mecanico, total: humano + mecanico };
};

// Falhas esperadas por sessão (soma das probabilidades do grid), sem considerar DNF.
const eventosEsperados = (falhas, ctx) => ({
  humana: ctx.grid.reduce((s, g) => s + calcularProbabilidadeFalha(falhas.FatorBaseFalhaHumana, g.consistencia, "humana", ctx.config), 0),
  mecanica: ctx.grid.reduce((s, g) => s + calcularProbabilidadeFalha(falhas.FatorBaseFalhaMecanica, g.durabilidade, "mecanica", ctx.config), 0),
});

const verificarFalhas = (arquivo, geradas, ctx) => {
  const padroes = validarPadroes(arquivo.padroes);
  console.log("GP".padEnd(18), "meta  esperado | %humano meta  obtido | fatorH  fatorM | falhas/corrida: humana mecanica | falhas/quali: humana mecanica");
  let pior = 0;
  arquivo.pistas.forEach((pista, i) => {
    const d = normalizarPista(pista, padroes);
    const fl = geradas[i].pesos.corrida.falhas;
    const e = esperadoDeFalhas(fl, ctx);
    const eq = eventosEsperados(geradas[i].pesos.qualificacao.falhas, ctx);
    const er = eventosEsperados(fl, ctx);
    pior = Math.max(pior, Math.abs(e.total - d.corrida.falhas.dnfPorCorrida));
    console.log(
      d.GP.padEnd(18), d.corrida.falhas.dnfPorCorrida.toFixed(2), "  ", e.total.toFixed(3), "  |",
      (d.corrida.falhas.pctDnfHumano * 100).toFixed(1).padStart(5), "%  ", ((e.humano / e.total) * 100).toFixed(1).padStart(5), "% |",
      fl.FatorBaseFalhaHumana.toFixed(3), " ", fl.FatorBaseFalhaMecanica.toFixed(3), "|",
      er.humana.toFixed(2).padStart(21), er.mecanica.toFixed(2).padStart(8), "|",
      eq.humana.toFixed(2).padStart(20), eq.mecanica.toFixed(2).padStart(8),
    );
  });
  console.log(`Maior desvio em relação à meta: ${pior.toFixed(4)} DNF por corrida.`);
};

const imprimirEstatisticas = (ctx) => {
  for (const tipo of ["humana", "mecanica"]) {
    const v = ctx.grid.map((g) => g[CAMPO_ATRIBUTO[tipo]]);
    const c = ctx.config[tipo];
    console.log(
      `${CAMPO_ATRIBUTO[tipo]}: min ${Math.min(...v)} | média ${media(v).toFixed(1)} | máx ${Math.max(...v)}` +
      `   (config: atributoMinimo ${c.atributoMinimo}, atributoMaximo ${c.atributoMaximo}, centro ${c.centro}, escala ${c.escala})`,
    );
  }
};

const imprimirResumo = (arquivo, ctx) => {
  const padroes = validarPadroes(arquivo.padroes);
  const f2 = (v, n = 2) => Number(v).toFixed(n);
  console.log("GP".padEnd(18), "largada piloto equipe | ritmo racec gerenc fisico adapt (peso absoluto do piloto) | DNF  falhas/corrida | fatorH fatorM");
  for (const pista of arquivo.pistas) {
    const d = normalizarPista(pista, padroes);
    const g = gerarPesos(d, ctx);
    const c = g.pesos.corrida, w = c.pesosGerais, p = c.piloto, fl = d.corrida.falhas;
    const eventos = fl.dnfPorCorrida * fl.pctDnfHumano / fl.letalidadeHumana +
      fl.dnfPorCorrida * (1 - fl.pctDnfHumano) / fl.letalidadeMecanica;
    console.log(
      d.GP.padEnd(18), f2(w.WPosInicial), "  ", f2(w.WPiloto), " ", f2(w.WEquipe), "  |",
      f2(w.WPiloto * p.VelocidadeCorrida, 3), f2(w.WPiloto * p.Racecraft, 3), f2(w.WPiloto * p.Gerenciamento, 3),
      f2(w.WPiloto * p.Fisico, 3), f2(w.WPiloto * p.Adaptabilidade, 3), "|", f2(fl.dnfPorCorrida), "  ", f2(eventos),
      "|", f2(c.falhas.FatorBaseFalhaHumana, 3), " ", f2(c.falhas.FatorBaseFalhaMecanica, 3),
    );
  }
};

const executarCLI = () => {
  const arquivo = readJson("gerar-pesos/descritores.json");
  const ctx = contextoDoGrid();
  const tem = (flag) => process.argv.includes(flag);
  if (tem("--estatisticas")) return imprimirEstatisticas(ctx);
  if (tem("--resumo")) return imprimirResumo(arquivo, ctx);
  const resultado = gerarConfiguracoes(arquivo, ctx);
  if (tem("--verificar")) return verificarFalhas(arquivo, resultado, ctx);
  if (tem("--comparar")) {
    const arg = process.argv.find((a) => a.startsWith("--tolerancia="));
    return comparar(resultado, readJson("pesos.json"), arg ? Number(arg.split("=")[1]) : undefined);
  }
  const json = `${JSON.stringify(resultado, null, 2)}\n`;
  if (tem("--escrever")) {
    const arquivoPesos = path.join(__dirname, "pesos.json");
    if (fs.existsSync(arquivoPesos)) fs.copyFileSync(arquivoPesos, `${arquivoPesos}.bak`);
    fs.writeFileSync(arquivoPesos, json, "utf8");
    console.log("pesos.json atualizado (backup em pesos.json.bak).");
    return;
  }
  process.stdout.write(json);
};

// Removida: usava faixa fixa (4%-18%) diferente do config. Use probabilidadeBanda("mecanica", durabilidade).
const probFalhaMecEquipe = () => {
  throw new Error('probFalhaMecEquipe foi removida. Use probabilidadeBanda("mecanica", durabilidade) de funcoes/calcularProbabilidadeFalha.');
};

module.exports = {
  ATRIBUTOS_EQUIPE, CARRO, PILOTO_CORRIDA, PILOTO_QUALI, CFG,
  gerarPesos, gerarConfiguracoes, normalizarPista, validarPadroes, contextoDoGrid,
  comparar, esperadoDeFalhas, probFalhaMecEquipe, desvioNormalTruncada,
};

if (require.main === module) executarCLI();