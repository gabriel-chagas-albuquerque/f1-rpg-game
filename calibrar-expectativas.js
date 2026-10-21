// Reexecute após alterações em pesos.json ou equipes.json.
// Padrão: 10.000 corridas por pista e por clima; aceita --simulacoes=N para teste.
const fs = require("node:fs");
const path = require("node:path");

const readJson = require("./funcoes/readJson");
const CONFIG_PE = require("./config/pe.config");
const simularFimDeSemanaPE = require("./funcoes/simularFimDeSemanaPE");
const avisarExpectativasDesatualizadas = require("./funcoes/avisarExpectativasDesatualizadas");
const {
  calcularQuantis,
  viesPosicoes,
  viesResiduos,
} = require("./funcoes/distribuicoesPE");

const diretorioProjeto = __dirname;
avisarExpectativasDesatualizadas(diretorioProjeto);
const pilotos = readJson("pilotos.json");
const equipes = readJson("equipes.json");
const configuracoesGP = readJson("pesos.json");
const simulacoesArgumento = process.argv.find((argumento) =>
  argumento.startsWith("--simulacoes="),
);
const quantidadeSimulacoes = simulacoesArgumento
  ? Number(simulacoesArgumento.split("=")[1])
  : CONFIG_PE.EXPECTATIVAS_SIMULACOES;

if (!Number.isInteger(quantidadeSimulacoes) || quantidadeSimulacoes < 1) {
  throw new Error("--simulacoes deve ser um inteiro positivo.");
}
if (pilotos.length !== CONFIG_PE.N_PILOTOS) {
  throw new Error(
    `A configuração PE define N_PILOTOS=${CONFIG_PE.N_PILOTOS}, mas pilotos.json contém ${pilotos.length}.`,
  );
}

const atributosPiloto = [
  "velocidade_qualificacao",
  "velocidade_corrida",
  "consistencia",
  "racecraft",
  "gerenciamento",
  "adaptabilidade",
  "fisico",
];
const medias = Object.fromEntries(
  atributosPiloto.map((atributo) => [
    atributo,
    pilotos.reduce((soma, piloto) => soma + piloto[atributo], 0) / pilotos.length,
  ]),
);
const pilotosNeutros = pilotos.map((piloto) => ({
  ...piloto,
  ...medias,
  pilotoJogador: false,
}));
const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));

const resolverSistema = (matriz, vetor) => {
  const aumentado = matriz.map((linha, indice) => [...linha, vetor[indice]]);
  for (let coluna = 0; coluna < aumentado.length; coluna++) {
    let pivo = coluna;
    for (let linha = coluna + 1; linha < aumentado.length; linha++) {
      if (
        Math.abs(aumentado[linha][coluna]) >
        Math.abs(aumentado[pivo][coluna])
      ) {
        pivo = linha;
      }
    }
    if (Math.abs(aumentado[pivo][coluna]) < 1e-12) {
      throw new Error("Não foi possível ajustar a regressão das expectativas.");
    }
    [aumentado[coluna], aumentado[pivo]] = [
      aumentado[pivo],
      aumentado[coluna],
    ];
    const divisor = aumentado[coluna][coluna];
    for (let indice = coluna; indice <= aumentado.length; indice++) {
      aumentado[coluna][indice] /= divisor;
    }
    for (let linha = 0; linha < aumentado.length; linha++) {
      if (linha === coluna) continue;
      const fator = aumentado[linha][coluna];
      for (let indice = coluna; indice <= aumentado.length; indice++) {
        aumentado[linha][indice] -= fator * aumentado[coluna][indice];
      }
    }
  }
  return aumentado.map((linha) => linha[aumentado.length]);
};

const ajustarModeloCorrida = (amostras, ecPorEquipe) => {
  const somas = Array.from({ length: 3 }, () => [0, 0, 0]);
  const produtos = [0, 0, 0];
  for (const amostra of amostras) {
    const x = [1, amostra.largada, ecPorEquipe[amostra.equipe]];
    for (let linha = 0; linha < 3; linha++) {
      produtos[linha] += x[linha] * amostra.final;
      for (let coluna = 0; coluna < 3; coluna++) {
        somas[linha][coluna] += x[linha] * x[coluna];
      }
    }
  }
  const [a, b, c] = resolverSistema(somas, produtos);
  return { a, b, c };
};

const saida = {};
for (const configuracao of configuracoesGP) {
  const resultadoPista = {};
  for (const clima of ["seco", "chuva"]) {
    const qualy = Object.fromEntries(
      equipes.map((equipe) => [
        equipe.equipe,
        {
          soma: 0,
          amostras: 0,
          hist: Array(CONFIG_PE.N_PILOTOS).fill(0),
        },
      ]),
    );
    const corrida = Object.fromEntries(
      equipes.map((equipe) => [
        equipe.equipe,
        { soma: 0, amostras: 0 },
      ]),
    );
    const amostrasRegressao = [];
    const configClima = {
      ...configuracao,
      pct_chuva: clima === "seco" ? 0 : 1,
    };

    for (let indice = 0; indice < quantidadeSimulacoes; indice++) {
      const fimDeSemana = simularFimDeSemanaPE({
        configuracao: configClima,
        pilotos: pilotosNeutros,
        equipePorNome,
        clima,
      });
      const porEquipe = new Map(
        fimDeSemana.resultados.map((resultado) => [
          resultado.piloto,
          resultado,
        ]),
      );
      for (const piloto of pilotosNeutros) {
        const resultado = porEquipe.get(piloto.piloto);
        const acumuladoQualy = qualy[piloto.equipe];
        acumuladoQualy.soma += resultado.qualificacao.posicao;
        acumuladoQualy.amostras++;
        acumuladoQualy.hist[resultado.qualificacao.posicao - 1]++;
        if (resultado.corrida.dnf === null) {
          const acumuladoCorrida = corrida[piloto.equipe];
          acumuladoCorrida.soma += resultado.corrida.posicaoFinal;
          acumuladoCorrida.amostras++;
          amostrasRegressao.push({
            largada: resultado.corrida.posicaoLargada,
            final: resultado.corrida.posicaoFinal,
            equipe: piloto.equipe,
          });
        }
      }
    }

    const eq = Object.fromEntries(
      Object.entries(qualy).map(([equipe, acumulado]) => [
        equipe,
        acumulado.soma / acumulado.amostras,
      ]),
    );
    const ec = Object.fromEntries(
      Object.entries(corrida).map(([equipe, acumulado]) => [
        equipe,
        acumulado.amostras > 0 ? acumulado.soma / acumulado.amostras : null,
      ]),
    );
    if (Object.values(ec).some((valor) => valor === null)) {
      throw new Error(
        `Sem amostras de corridas finalizadas para uma equipe em ${configuracao.GP}/${clima}.`,
      );
    }
    if (amostrasRegressao.length < CONFIG_PE.EXPECTATIVAS_AMOSTRA_MINIMA) {
      if (clima === "chuva") {
        console.warn(
          `Aviso: amostra de chuva pequena em ${configuracao.GP}; usando expectativas de pista seca.`,
        );
        resultadoPista.chuva = {
          ...resultadoPista.seco,
          fallback: "seco",
          amostras: amostrasRegressao.length,
        };
        continue;
      }
      throw new Error(`Amostra de regressão insuficiente em ${configuracao.GP}.`);
    }

    const modelo = ajustarModeloCorrida(amostrasRegressao, ec);
    // Distribuições dos pilotos neutros por equipe: base da normalização por percentil.
    const residuosPorEquipe = {};
    for (const amostra of amostrasRegressao) {
      const esperado =
        modelo.a + modelo.b * amostra.largada + modelo.c * ec[amostra.equipe];
      (residuosPorEquipe[amostra.equipe] ??= []).push(amostra.final - esperado);
    }
    const todosResiduos = Object.values(residuosPorEquipe).flat();
    const distQ = {};
    const distR = {};
    const viesQ = {};
    const viesR = {};
    for (const nomeEquipe of Object.keys(ec)) {
      const hist = qualy[nomeEquipe].hist;
      distQ[nomeEquipe] = { hist, amostras: qualy[nomeEquipe].amostras };
      viesQ[nomeEquipe] = viesPosicoes(hist, CONFIG_PE.EXPOENTE);
      const proprios = residuosPorEquipe[nomeEquipe] ?? [];
      const usarGeral = proprios.length < CONFIG_PE.AMOSTRA_MINIMA_EQUIPE;
      if (usarGeral) {
        console.warn(
          `Aviso: poucas corridas finalizadas de ${nomeEquipe} em ${configuracao.GP}/${clima}; usando resíduos de todas as equipes.`,
        );
      }
      const base = usarGeral ? todosResiduos : proprios;
      const quantis = calcularQuantis(base, CONFIG_PE.QUANTIS_RESIDUO);
      distR[nomeEquipe] = {
        quantis,
        amostras: base.length,
        fallbackGeral: usarGeral,
      };
      viesR[nomeEquipe] = viesResiduos(proprios, quantis, CONFIG_PE.EXPOENTE);
    }

    resultadoPista[clima] = {
      EQ: eq,
      EC: ec,
      modeloCorrida: modelo,
      distQ,
      distR,
      viesQ,
      viesR,
      expoente: CONFIG_PE.EXPOENTE,
      amostras: {
        corridas: quantidadeSimulacoes,
        resultadosRegressao: amostrasRegressao.length,
        qualyPorEquipe: Object.fromEntries(
          Object.entries(qualy).map(([equipe, acumulado]) => [
            equipe,
            acumulado.amostras,
          ]),
        ),
        corridaPorEquipe: Object.fromEntries(
          Object.entries(corrida).map(([equipe, acumulado]) => [
            equipe,
            acumulado.amostras,
          ]),
        ),
      },
    };
    if (clima === "chuva" && !resultadoPista.chuva.fallback) {
      resultadoPista.chuva.fallback = null;
    }
  }
  saida[configuracao.GP] = resultadoPista;
  console.log(
    `${configuracao.GP}: ${quantidadeSimulacoes} simulações por clima.`,
  );
}

const caminhoSaida = path.join(diretorioProjeto, "expectativas.json");
fs.writeFileSync(caminhoSaida, `${JSON.stringify(saida, null, 2)}\n`, "utf8");
console.log(`Expectativas gravadas em ${path.basename(caminhoSaida)}.`);
