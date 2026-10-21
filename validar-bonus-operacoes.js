const readJson = require("./funcoes/readJson");
const calcularGridDeLargada = require("./funcoes/calcularGridDeLargada");
const calcularOrdemDeChegada = require("./funcoes/calcularOrdemDeChegada");
const { sortearClima } = require("./funcoes/sortearClima");
const arredondarScore = require("./funcoes/arredondarScore");

const pilotos = readJson("pilotos.json");
const equipes = readJson("equipes.json");
const configuracoesGP = readJson("pesos.json");
const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));

// Processar argumentos da linha de comando
const args = process.argv.slice(2);
let pistasSelecionadas = null;
let quantidadeSimulacoes = 5000;

for (const arg of args) {
  if (arg.startsWith("--pistas=")) {
    pistasSelecionadas = arg
      .slice("--pistas=".length)
      .split(",")
      .map((p) => p.trim());
  } else if (arg.startsWith("--simulacoes=")) {
    quantidadeSimulacoes = Number(arg.slice("--simulacoes=".length));
  }
}

if (!Number.isInteger(quantidadeSimulacoes) || quantidadeSimulacoes < 1) {
  throw new Error("A quantidade de simulações deve ser um número inteiro positivo.");
}

const gpsParaSimular = pistasSelecionadas
  ? configuracoesGP.filter((gp) => pistasSelecionadas.includes(gp.GP))
  : configuracoesGP;

if (gpsParaSimular.length === 0) {
  throw new Error(`Nenhum GP encontrado para as pistas: ${pistasSelecionadas?.join(", ")}`);
}

console.log("================================================================================");
console.log(`VALIDAÇÃO DO BÔNUS DE OPERAÇÕES (${quantidadeSimulacoes} simulações por GP)`);
console.log(`Pistas (${gpsParaSimular.length}): ${gpsParaSimular.map((gp) => gp.GP).join(", ")}`);
console.log("================================================================================\n");

function executarSimulacao(ativarBonus) {
  const acumuladoGeral = new Map(
    equipes.map((e) => [
      e.equipe,
      {
        equipe: e.equipe,
        operacoes: e.operacoes,
        total: { somaPos: 0, count: 0 },
        seco: { somaPos: 0, count: 0 },
        sc: { somaPos: 0, count: 0 },
        chuva: { somaPos: 0, count: 0 },
      },
    ]),
  );

  const porPista = new Map();
  let somaBonusGridTotal = 0;
  let contagemBonusGridTotal = 0;

  for (const gp of gpsParaSimular) {
    const dadosPista = new Map(
      equipes.map((e) => [e.equipe, { somaPos: 0, count: 0 }]),
    );

    for (let i = 0; i < quantidadeSimulacoes; i++) {
      const { pcQualy, pcCorrida } = sortearClima(gp.pct_chuva);
      const grid = calcularGridDeLargada(
        gp,
        pilotos,
        equipePorNome,
        pcQualy,
        { ATIVAR_BONUS_OPERACOES: ativarBonus },
      );

      const resultados = calcularOrdemDeChegada(
        grid,
        gp.pesos.corrida,
        pcCorrida,
        gp.multiplicadorSeveridadeFalha,
        gp.voltas,
        {
          teto_dnf: gp.teto_dnf,
          intensidadeOperacoes: gp.intensidadeOperacoes,
          configOperacoes: { ATIVAR_BONUS_OPERACOES: ativarBonus },
        },
      );

      const eventosSC = resultados[0]?.eventosSafetyCar ?? [];
      const teveSC = eventosSC.length > 0;
      const teveChuva = pcCorrida > 0;
      const ehSeco = !teveSC && !teveChuva;

      for (let pos = 0; pos < resultados.length; pos++) {
        const pilotoRes = resultados[pos];
        const equipeRes = pilotoRes.equipe;
        const posicaoFinal = pos + 1;

        if (ativarBonus && typeof pilotoRes.bonusOperacoes === "number") {
          somaBonusGridTotal += pilotoRes.bonusOperacoes;
          contagemBonusGridTotal++;
        }

        const statsGeral = acumuladoGeral.get(equipeRes);
        statsGeral.total.somaPos += posicaoFinal;
        statsGeral.total.count++;

        if (ehSeco) {
          statsGeral.seco.somaPos += posicaoFinal;
          statsGeral.seco.count++;
        }
        if (teveSC) {
          statsGeral.sc.somaPos += posicaoFinal;
          statsGeral.sc.count++;
        }
        if (teveChuva) {
          statsGeral.chuva.somaPos += posicaoFinal;
          statsGeral.chuva.count++;
        }

        const statsPista = dadosPista.get(equipeRes);
        statsPista.somaPos += posicaoFinal;
        statsPista.count++;
      }
    }

    porPista.set(gp.GP, dadosPista);
  }

  return {
    acumuladoGeral,
    porPista,
    mediaBonusGrid:
      contagemBonusGridTotal > 0
        ? somaBonusGridTotal / contagemBonusGridTotal
        : 0,
  };
}

console.log("Executando simulações com ATIVAR_BONUS_OPERACOES = false...");
const resOFF = executarSimulacao(false);

console.log("Executando simulações com ATIVAR_BONUS_OPERACOES = true...");
const resON = executarSimulacao(true);

// 1. Tabela geral por equipe: delta de posição média geral (com bônus menos sem bônus)
console.log("\n--- 1. DELTA DE POSIÇÃO MÉDIA GERAL POR EQUIPE (Com Bônus - Sem Bônus) ---");
console.log("(Valores negativos indicam melhora na posição média final)\n");

const tabelaGeral = [];
let maxShiftAbs = 0;

for (const equipe of equipes) {
  const off = resOFF.acumuladoGeral.get(equipe.equipe);
  const on = resON.acumuladoGeral.get(equipe.equipe);

  const posMediaOFF = off.total.count > 0 ? off.total.somaPos / off.total.count : 0;
  const posMediaON = on.total.count > 0 ? on.total.somaPos / on.total.count : 0;
  const deltaGeral = posMediaON - posMediaOFF;

  const deltaSeco =
    on.seco.count > 0 && off.seco.count > 0
      ? on.seco.somaPos / on.seco.count - off.seco.somaPos / off.seco.count
      : 0;

  const deltaSC =
    on.sc.count > 0 && off.sc.count > 0
      ? on.sc.somaPos / on.sc.count - off.sc.somaPos / off.sc.count
      : 0;

  const deltaChuva =
    on.chuva.count > 0 && off.chuva.count > 0
      ? on.chuva.somaPos / on.chuva.count - off.chuva.somaPos / off.chuva.count
      : 0;

  if (Math.abs(deltaGeral) > maxShiftAbs) {
    maxShiftAbs = Math.abs(deltaGeral);
  }

  tabelaGeral.push({
    Equipe: equipe.equipe,
    Operacoes: equipe.operacoes,
    "Média OFF": arredondarScore(posMediaOFF),
    "Média ON": arredondarScore(posMediaON),
    "Delta Geral": Number(deltaGeral.toFixed(3)),
    "Delta Seco": Number(deltaSeco.toFixed(3)),
    "Delta SC": Number(deltaSC.toFixed(3)),
    "Delta Chuva": Number(deltaChuva.toFixed(3)),
  });
}

// Ordenar por rating de Operações decrescente
tabelaGeral.sort((a, b) => b.Operacoes - a.Operacoes);
console.table(tabelaGeral);

// 2. Destaque para Mercedes vs Haas por pista
console.log("\n--- 2. COMPARATIVO MERCEDES (Ops 92) vs HAAS (Ops 74) POR PISTA ---");
const pistasDestaque = [
  "Monaco",
  "Singapura",
  "Baku",
  "Monza",
  "Austria",
];
const tabelaDestaque = [];
const deltasMercedesHaas = new Map();

for (const gp of gpsParaSimular) {
  const dadosPistaOFF = resOFF.porPista.get(gp.GP);
  const dadosPistaON = resON.porPista.get(gp.GP);

  const mercOFF = dadosPistaOFF.get("Mercedes");
  const mercON = dadosPistaON.get("Mercedes");
  const haasOFF = dadosPistaOFF.get("Haas");
  const haasON = dadosPistaON.get("Haas");

  const mediaMercOFF = mercOFF.somaPos / mercOFF.count;
  const mediaMercON = mercON.somaPos / mercON.count;
  const deltaMerc = mediaMercON - mediaMercOFF;

  const mediaHaasOFF = haasOFF.somaPos / haasOFF.count;
  const mediaHaasON = haasON.somaPos / haasON.count;
  const deltaHaas = mediaHaasON - mediaHaasOFF;

  // Ganho relativo da Mercedes sobre a Haas = deltaHaas (que piorou) - deltaMerc (que melhorou)
  const ganhoRelativoMercHaas = deltaHaas - deltaMerc;
  deltasMercedesHaas.set(gp.GP, ganhoRelativoMercHaas);

  if (pistasDestaque.includes(gp.GP) || pistasSelecionadas) {
    tabelaDestaque.push({
      GP: gp.GP,
      Intensidade: gp.intensidadeOperacoes,
      "Delta Merc": Number(deltaMerc.toFixed(3)),
      "Delta Haas": Number(deltaHaas.toFixed(3)),
      "Ganho Relativo (Merc vs Haas)": Number(ganhoRelativoMercHaas.toFixed(3)),
    });
  }
}

console.table(tabelaDestaque);

// 3. Verificação dos critérios de aceite
console.log("\n--- 3. VERIFICAÇÃO DOS CRITÉRIOS DE ACEITE ---");

const criterios = [];

// Critério 1: Mônaco, Singapura e Baku entre 0.5 e 2.5 posições
for (const pistaAlta of ["Monaco", "Singapura", "Baku"]) {
  if (deltasMercedesHaas.has(pistaAlta)) {
    const val = deltasMercedesHaas.get(pistaAlta);
    const passou = val >= 0.5 && val <= 2.5;
    criterios.push({
      Critério: `Delta Merc vs Haas em ${pistaAlta} entre 0.5 e 2.5`,
      Esperado: "[0.5, 2.5]",
      Obtido: Number(val.toFixed(3)),
      Status: passou ? "PASS" : "ALERTA (Ajuste sugerido)",
    });
  }
}

// Critério 2: Monza e Áustria < 1.5 posições
for (const pistaBaixa of ["Monza", "Austria"]) {
  if (deltasMercedesHaas.has(pistaBaixa)) {
    const val = deltasMercedesHaas.get(pistaBaixa);
    const passou = val < 1.5;
    criterios.push({
      Critério: `Delta Merc vs Haas em ${pistaBaixa} < 1.5`,
      Esperado: "< 1.5",
      Obtido: Number(val.toFixed(3)),
      Status: passou ? "PASS" : "ALERTA (Ajuste sugerido)",
    });
  }
}

// Critério 3: Bônus médio no grid ≈ 0
const mediaGrid = resON.mediaBonusGrid;
const passouMediaGrid = Math.abs(mediaGrid) < 0.05;
criterios.push({
  Critério: "Bônus médio de Operações no grid ≈ 0",
  Esperado: "≈ 0 (±0.05)",
  Obtido: Number(mediaGrid.toFixed(4)),
  Status: passouMediaGrid ? "PASS" : "FAIL",
});

// Critério 4: Máximo shift médio de equipe no geral <= 1.5
const passouMaxShift = maxShiftAbs <= 1.5;
criterios.push({
  Critério: "Nenhum shift geral de equipe > 1.5 posições",
  Esperado: "<= 1.5",
  Obtido: Number(maxShiftAbs.toFixed(3)),
  Status: passouMaxShift ? "PASS" : "FAIL",
});

console.table(criterios);

console.log("\nValidação concluída.");
