// Migração única: converte gerar-pesos/descritores.json (formato antigo) + pesos.json atual
// em gerar-pesos/descritores.v2.json. Cada valor novo é lido do peso que a versão antiga já gerou,
// então o comportamento atual é preservado e a calibração passa a partir de números explícitos.
// Uso: node migrarDescritoresV2.js

const fs = require("node:fs");
const path = require("node:path");
const readJson = require("./funcoes/readJson");
const { CFG, PILOTO_CORRIDA } = require("./descritoresParaPesos");

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
// A versão antiga aceitava faixa [min, max] (usava o ponto médio).
const valor = (v) => (Array.isArray(v) ? (v[0] + v[1]) / 2 : v);

const PADROES = {
  escala_rng: 1,
  corrida: { safety_car: { prob: 0.1, rng: 0.1 } },
  quali: {
    piloto: { velocidade: 0.83, adaptabilidade: 0.12, gerenciamento: 0.05 },
    carro_fatores: { aero_carga: 0.8, aero_eficiencia: 0.6, chassi: 0.8, tracao: 0.7, potencia: 0.9, operacoes: 0.3, pneus: 0 },
  },
};

// shares (somam 1) -> importâncias com o maior valor = 1
const importanciasDe = (shares) => {
  const max = Math.max(...Object.values(PILOTO_CORRIDA).map((nome) => shares[nome]));
  return Object.fromEntries(Object.entries(PILOTO_CORRIDA).map(([k, nome]) => [k, r2(shares[nome] / max)]));
};

const antigos = readJson("gerar-pesos/descritores.json");
const pesos = new Map(readJson("pesos.json").map((p) => [p.GP, p]));

const pistas = antigos.map((d) => {
  const gp = d.GP ?? d.gp;
  const q = pesos.get(gp);
  if (!q) throw new Error(`pesos.json não tem o GP ${gp}.`);
  const c = q.pesos.corrida, g = c.pesosGerais, f = c.falhas, ql = q.pesos.qualificacao;
  const risco = valor(d.risco_erro), estresse = valor(d.estresse_mecanico);

  const pista = { GP: gp, voltas: d.voltas, pct_chuva: valor(d.pct_chuva) };
  const escala = r2(g.RngPiloto / CFG.rngBases.corrida.piloto);
  if (escala !== PADROES.escala_rng) pista.escala_rng = escala;

  pista.corrida = {
    peso_largada: g.WPosInicial,
    piloto_vs_carro: r3(g.WPiloto / (g.WPiloto + g.WEquipe)),
    piloto: importanciasDe(c.piloto),
    carro: {
      aero_carga: valor(d.aero_carga), aero_eficiencia: valor(d.aero_eficiencia), chassi: valor(d.chassi),
      tracao: valor(d.tracao), potencia: valor(d.potencia), operacoes: valor(d.operacoes), pneus: valor(d.pneus),
    },
    falhas: {
      dnf_por_corrida: valor(d.dnf_alvo),
      pct_dnf_humano: r3(risco / (risco + estresse)),
      letalidade_humana: f.FracaoDNFHumana,
      letalidade_mecanica: f.FracaoDNFMecanica,
      severidade: q.multiplicadorSeveridadeFalha,
      penalidade_z: [f.PenalidadeZMin, f.PenalidadeZMax],
    },
    intensidade_operacoes: q.intensidadeOperacoes,
  };
  const sc = { prob: q.pct_safety_car, rng: g.RngSafetyCar };
  if (sc.prob !== PADROES.corrida.safety_car.prob || sc.rng !== PADROES.corrida.safety_car.rng) {
    pista.corrida.safety_car = sc;
  }
  pista.quali = {
    piloto_vs_carro: ql.pesosGerais.WPiloto,
    carro_fatores: { ...PADROES.quali.carro_fatores, ...(d.fatores_quali ?? {}) },
  };
  return pista;
});

const saida = {
  _comentario: "Descritores V2: cada campo vira um peso/parâmetro direto. Veja o cabeçalho de descritoresParaPesosV2.js.",
  padroes: PADROES,
  pistas,
};
const destino = path.join(__dirname, "gerar-pesos", "descritores.json");
fs.writeFileSync(destino, `${JSON.stringify(saida, null, 2)}\n`, "utf8");
console.log(`${pistas.length} pistas migradas para gerar-pesos/descritores.v2.json`);