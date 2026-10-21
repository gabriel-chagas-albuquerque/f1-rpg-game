// Mede o PE médio de um piloto NEUTRO (todos os atributos iguais à média do grid) em cada equipe.
// Se o PE fosse justo, todas as equipes teriam média próxima de PE_BASE.
// Uso: node diagnostico-pe-neutro.js [--simulacoes=2000] [--pistas=Monza,Monaco,Austria,Singapura] [--clima=seco]
// Pré-requisito: expectativas.json atualizado (node calibrar-expectativas.js).
const fs = require("node:fs");
const path = require("node:path");

const readJson = require("./funcoes/readJson");
const CONFIG_PE = require("./config/pe.config");
const { calcularPE } = require("./funcoes/sistemaPE");
const simularFimDeSemanaPE = require("./funcoes/simularFimDeSemanaPE");

const argumento = (nome, padrao) => {
  const encontrado = process.argv.find((item) => item.startsWith(`--${nome}=`));
  return encontrado ? encontrado.split("=")[1] : padrao;
};
const simulacoes = Number(argumento("simulacoes", 2000));
const clima = argumento("clima", "seco");
const nomesPistas = argumento("pistas", "Monza,Monaco,Austria,Singapura")
  .split(",")
  .map((nome) => nome.trim().toLowerCase());
if (!Number.isInteger(simulacoes) || simulacoes < 1) {
  throw new Error("--simulacoes deve ser um inteiro positivo.");
}
if (!["seco", "chuva"].includes(clima)) {
  throw new Error("--clima deve ser 'seco' ou 'chuva'.");
}

const pilotos = readJson("pilotos.json");
const equipes = readJson("equipes.json");
const configuracoes = readJson("pesos.json").filter((configuracao) =>
  nomesPistas.includes(configuracao.GP.toLowerCase()),
);
if (configuracoes.length === 0) {
  throw new Error("Nenhuma das pistas informadas foi encontrada em pesos.json.");
}
const caminhoNovoExpectativas = path.join(
  __dirname,
  "outputs",
  "calibrar-expectativas",
  "expectativas.json",
);
const caminhoExpectativas = fs.existsSync(caminhoNovoExpectativas)
  ? caminhoNovoExpectativas
  : path.join(__dirname, "expectativas.json");
const expectativas = JSON.parse(
  fs.readFileSync(caminhoExpectativas, "utf8"),
);

const medias = Object.fromEntries(
  Object.values(CONFIG_PE.CAMPOS_ATRIBUTOS_PILOTO).map((campo) => [
    campo,
    pilotos.reduce((soma, piloto) => soma + piloto[campo], 0) / pilotos.length,
  ]),
);
const pilotosNeutros = pilotos.map((piloto) => ({
  ...piloto,
  ...medias,
  pilotoJogador: false,
}));
const pilotoPorNome = new Map(pilotosNeutros.map((piloto) => [piloto.piloto, piloto]));
const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));

const acumulados = {}; // equipe -> pista -> { pe, q, r, n }
for (const configuracao of configuracoes) {
  for (let indice = 0; indice < simulacoes; indice++) {
    const fimDeSemana = simularFimDeSemanaPE({
      configuracao,
      pilotos: pilotosNeutros,
      equipePorNome,
      clima,
    });
    for (const resultado of fimDeSemana.resultados) {
      const piloto = { ...pilotoPorNome.get(resultado.piloto), pilotoJogador: true };
      const calculo = calcularPE(
        {
          pista: configuracao.GP,
          clima,
          safetyCar: fimDeSemana.safetyCar,
          piloto,
          qualificacao: resultado.qualificacao,
          corrida: { ...resultado.corrida, pontos: 0 },
        },
        expectativas,
        { catchUp: { zRating: 0 } },
      );
      const alvo = ((acumulados[piloto.equipe] ??= {})[configuracao.GP] ??= {
        pe: 0,
        q: 0,
        r: 0,
        n: 0,
      });
      alvo.pe += calculo.pe;
      alvo.q += calculo.componentes.Q;
      alvo.r += calculo.componentes.R;
      alvo.n++;
    }
  }
  console.log(`${configuracao.GP}: ${simulacoes} fins de semana simulados.`);
}

const formatar = (numero) => numero.toFixed(2);
const nomesPistasUsadas = configuracoes.map((configuracao) => configuracao.GP);
const linhas = Object.entries(acumulados).map(([equipe, porPista]) => {
  const total = Object.values(porPista).reduce(
    (soma, item) => ({
      pe: soma.pe + item.pe,
      q: soma.q + item.q,
      r: soma.r + item.r,
      n: soma.n + item.n,
    }),
    { pe: 0, q: 0, r: 0, n: 0 },
  );
  return {
    equipe,
    peMedio: total.pe / total.n,
    qMedio: total.q / total.n,
    rMedio: total.r / total.n,
    porPista: Object.fromEntries(
      nomesPistasUsadas.map((pista) => [pista, porPista[pista].pe / porPista[pista].n]),
    ),
  };
});
linhas.sort((a, b) => b.peMedio - a.peMedio);

console.log(`\nPE médio de um piloto neutro (${clima}); PE_BASE = ${CONFIG_PE.PE_BASE}`);
console.log(["Equipe", "PE", "Q", "R", ...nomesPistasUsadas].join(" | "));
for (const linha of linhas) {
  console.log(
    [
      linha.equipe,
      formatar(linha.peMedio),
      formatar(linha.qMedio),
      formatar(linha.rMedio),
      ...nomesPistasUsadas.map((pista) => formatar(linha.porPista[pista])),
    ].join(" | "),
  );
}
const maior = linhas[0];
const menor = linhas[linhas.length - 1];
console.log(
  `\nAmplitude entre equipes: ${formatar(maior.peMedio - menor.peMedio)} PE (${maior.equipe} ${formatar(maior.peMedio)} contra ${menor.equipe} ${formatar(menor.peMedio)}).`,
);
if (maior.peMedio - menor.peMedio > CONFIG_PE.TOLERANCIA_CONTROLE * 2) {
  console.warn(
    "Aviso: o PE de um piloto neutro depende da equipe. A normalização por alcance está enviesada.",
  );
}
const pastaSaida = path.join(__dirname, "outputs", "diagnostico-pe-neutro");
fs.mkdirSync(pastaSaida, { recursive: true });
fs.writeFileSync(
  path.join(pastaSaida, "diagnostico_pe_neutro.json"),
  `${JSON.stringify({ clima, simulacoes, pistas: nomesPistasUsadas, equipes: linhas }, null, 2)}\n`,
  "utf8",
);