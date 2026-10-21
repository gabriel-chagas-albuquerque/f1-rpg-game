const fs = require("node:fs");
const path = require("node:path");

const readJson = require("./funcoes/readJson");
const CONFIG_PE = require("./config/pe.config");
const calcularPE = require("./funcoes/sistemaPE").calcularPE;
const simularFimDeSemanaPE = require("./funcoes/simularFimDeSemanaPE");
const calcularZRatingPiloto = require("./funcoes/calcularZRatingPiloto");
const avisarExpectativasDesatualizadas = require("./funcoes/avisarExpectativasDesatualizadas");

const simulacoesArgumento = process.argv.find((argumento) =>
  argumento.startsWith("--simulacoes="),
);
const quantidadeSimulacoes = simulacoesArgumento
  ? Number(simulacoesArgumento.split("=")[1])
  : CONFIG_PE.CALIBRACAO_SIMULACOES;
if (!Number.isInteger(quantidadeSimulacoes) || quantidadeSimulacoes < 1) {
  throw new Error("--simulacoes deve ser um inteiro positivo.");
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
if (!fs.existsSync(caminhoExpectativas)) {
  throw new Error("Execute node calibrar-expectativas.js antes da calibração PE.");
}
avisarExpectativasDesatualizadas(__dirname);
const expectativas = JSON.parse(fs.readFileSync(caminhoExpectativas, "utf8"));
const pilotos = readJson("pilotos.json");
const equipes = readJson("equipes.json");
const configuracoes = readJson("pesos.json");
if (pilotos.length !== CONFIG_PE.N_PILOTOS) {
  throw new Error(
    `A configuração PE define ${CONFIG_PE.N_PILOTOS} pilotos, mas a lista tem ${pilotos.length}.`,
  );
}

const atributosDados = {
  VelocidadeQualificacao: "velocidade_qualificacao",
  VelocidadeCorrida: "velocidade_corrida",
  Consistencia: "consistencia",
  Racecraft: "racecraft",
  Gerenciamento: "gerenciamento",
  Adaptabilidade: "adaptabilidade",
  Fisico: "fisico",
};
const atributos = Object.keys(atributosDados);
const medias = Object.fromEntries(
  Object.entries(atributosDados).map(([atributo, chave]) => [
    atributo,
    pilotos.reduce((total, piloto) => total + piloto[chave], 0) / pilotos.length,
  ]),
);
const alvos = pilotos.filter(
  (piloto) => piloto.equipe === CONFIG_PE.EQUIPE_CALIBRACAO,
);
if (alvos.length === 0) {
  throw new Error(`Equipe de calibração não encontrada: ${CONFIG_PE.EQUIPE_CALIBRACAO}.`);
}
const alvo = alvos[0];
const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));
const arquetipos = [
  { nome: "Neutro", atributo: null, pontos: 0 },
  ...atributos.map((atributo) => ({
    nome: atributo,
    atributo,
    pontos: CONFIG_PE.BONUS_BUILD,
  })),
];

const criarPilotosSinteticos = (atributo, pontos) =>
  pilotos.map((piloto) => {
    const sintetico = {
      ...piloto,
      ...Object.fromEntries(
        Object.entries(atributosDados).map(([nome, chave]) => [
          chave,
          medias[nome],
        ]),
      ),
      pilotoJogador: piloto.piloto === alvo.piloto,
    };
    if (piloto.piloto === alvo.piloto && atributo) {
      sintetico[atributosDados[atributo]] += pontos;
    }
    return sintetico;
  });

const variancia = (valores) => {
  if (valores.length < 2) return 0;
  const media = valores.reduce((soma, valor) => soma + valor, 0) / valores.length;
  return (
    valores.reduce((soma, valor) => soma + (valor - media) ** 2, 0) /
    valores.length
  );
};
const covariancia = (esquerda, direita) => {
  const mediaEsquerda = media(esquerda);
  const mediaDireita = media(direita);
  return esquerda.reduce(
    (soma, valor, indice) =>
      soma + (valor - mediaEsquerda) * (direita[indice] - mediaDireita),
    0,
  ) / esquerda.length;
};
const media = (valores) =>
  valores.length === 0
    ? 0
    : valores.reduce((soma, valor) => soma + valor, 0) / valores.length;
const desvio = (valores) => Math.sqrt(variancia(valores));
const percentil95 = (valores) => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[
    Math.ceil(ordenados.length * CONFIG_PE.PERCENTIL_CALIBRACAO) - 1
  ];
};
const resumir = (valores) => ({
  media: media(valores),
  desvio: desvio(valores),
  p95: percentil95(valores),
});
const resultados = new Map(
  arquetipos.map((arquetipo) => [
    arquetipo.nome,
    { porPista: new Map(), pe: [], componentes: { Q: [], R: [], CF: [] } },
  ]),
);

const medirPerfil = (configuracao, clima, pilotosSinteticos, alvoInfo) => {
  const pePorCorrida = [];
  const componentes = { Q: [], R: [], CF: [] };
  for (let indice = 0; indice < quantidadeSimulacoes; indice++) {
    const fimDeSemana = simularFimDeSemanaPE({
      configuracao: {
        ...configuracao,
        pct_chuva: clima === "seco" ? 0 : 1,
      },
      pilotos: pilotosSinteticos,
      equipePorNome,
      clima,
    });
    const resultado = fimDeSemana.resultados.find(
      (item) => item.piloto === alvoInfo.piloto,
    );
    const pe = calcularPE(
      {
        pista: configuracao.GP,
        clima,
        safetyCar: fimDeSemana.safetyCar,
        piloto: alvoInfo,
        qualificacao: resultado.qualificacao,
        corrida: {
          ...resultado.corrida,
          pontos: 0,
        },
      },
      expectativas,
      {
        catchUp: {
          zRating: calcularZRatingPiloto(alvoInfo, pilotosSinteticos),
        },
      },
    );
    pePorCorrida.push(pe.pe);
    componentes.Q.push(CONFIG_PE.PE_ESCALA * CONFIG_PE.PESO_Q * pe.componentes.Q);
    componentes.R.push(CONFIG_PE.PE_ESCALA * CONFIG_PE.PESO_R * pe.componentes.R);
    componentes.CF.push(pe.componentes.CF);
  }
  return { pePorCorrida, componentes };
};

const progresso = {
  simulacoesPorPistaClimaPerfil: quantidadeSimulacoes,
  equipe: CONFIG_PE.EQUIPE_CALIBRACAO,
  atribuicaoPontosExtras: CONFIG_PE.BONUS_BUILD,
  resultados: {},
  recomendacoesFatorCusto: {},
};

for (const configuracao of configuracoes) {
  for (const clima of ["seco", "chuva"]) {
    for (const arquetipo of arquetipos) {
      const pilotosSinteticos = criarPilotosSinteticos(
        arquetipo.atributo,
        arquetipo.pontos,
      );
      const alvoInfo = pilotosSinteticos.find(
        (piloto) => piloto.piloto === alvo.piloto,
      );
      const medicao = medirPerfil(
        configuracao,
        clima,
        pilotosSinteticos,
        alvoInfo,
      );
      const registro = resultados.get(arquetipo.nome);
      const perfilGP = registro.porPista.get(configuracao.GP) ?? [];
      perfilGP.push(...medicao.pePorCorrida);
      registro.porPista.set(configuracao.GP, perfilGP);
      registro.pe.push(...medicao.pePorCorrida);
      for (const componente of ["Q", "R", "CF"]) {
        registro.componentes[componente].push(...medicao.componentes[componente]);
      }
    }
  }
}

const mediasGerais = Object.fromEntries(
  arquetipos.map((arquetipo) => [
    arquetipo.nome,
    media(resultados.get(arquetipo.nome).pe),
  ]),
);
const mediaArquetipos =
  media(Object.values(mediasGerais));
const mediaNeutro = mediasGerais.Neutro;

console.log("Arquétipo | Pista | PE médio | Desvio padrão");
for (const arquetipo of arquetipos) {
  const dados = resultados.get(arquetipo.nome);
  const porPista = {};
  for (const [pista, valores] of dados.porPista) {
    const resumo = resumir(valores);
    porPista[pista] = resumo;
    console.log(
      `${arquetipo.nome} | ${pista} | ${resumo.media.toFixed(2)} | ${resumo.desvio.toFixed(2)}`,
    );
  }
  const varianciaPE = variancia(dados.pe);
  const participacaoVariancia = Object.fromEntries(
    ["Q", "R", "CF"].map((componente) => [
      componente,
      varianciaPE === 0
        ? 0
        : covariancia(dados.componentes[componente], dados.pe) / varianciaPE,
    ]),
  );
  progresso.resultados[arquetipo.nome] = {
    porPista,
    mediaGeral: mediasGerais[arquetipo.nome],
    desvioPadrao: desvio(dados.pe),
    p95: percentil95(dados.pe),
    razaoControle:
      mediaNeutro === 0 ? null : mediasGerais[arquetipo.nome] / mediaNeutro,
    participacaoVarianciaComponentes: participacaoVariancia,
  };
}

const avisos = [];
for (const arquetipo of arquetipos) {
  const valor = mediasGerais[arquetipo.nome];
  if (
    mediaArquetipos > 0 &&
    Math.abs(valor - mediaArquetipos) / mediaArquetipos >
      CONFIG_PE.TOLERANCIA_MEDIA_ARQUETIPOS
  ) {
    avisos.push(
      `${arquetipo.nome}: PE médio fora de ±15% da média entre arquétipos.`,
    );
  }
  if (
    Object.values(progresso.resultados[arquetipo.nome].participacaoVarianciaComponentes)
      .some(
        (participacao) =>
          participacao > CONFIG_PE.LIMITE_VARIANCIA_COMPONENTE,
      )
  ) {
    avisos.push(`${arquetipo.nome}: um componente responde por mais de 60% da variância.`);
  }
  if (progresso.resultados[arquetipo.nome].p95 >= CONFIG_PE.PE_MAX_FIM_DE_SEMANA) {
    avisos.push(`${arquetipo.nome}: p95 do PE atingiu o teto por fim de semana.`);
  }
}
if (
  Math.abs(mediaNeutro - CONFIG_PE.PE_BASE) >
  CONFIG_PE.TOLERANCIA_CONTROLE
) {
  avisos.push(
    `Controle neutro: média ${mediaNeutro.toFixed(2)} difere da base ${CONFIG_PE.PE_BASE} em mais de 0,5 PE.`,
  );
}

for (const atributo of atributos) {
  const diferenças = [];
  for (const configuracao of configuracoes) {
    for (const clima of ["seco", "chuva"]) {
      const pilotosNeutros = criarPilotosSinteticos(null, 0);
      const pilotosMelhorados = criarPilotosSinteticos(
        atributo,
        CONFIG_PE.BONUS_IMPACTO_ATRIBUTO,
      );
      const neutro = medirPerfil(
        configuracao,
        clima,
        pilotosNeutros,
        pilotosNeutros.find((piloto) => piloto.piloto === alvo.piloto),
      );
      const melhorado = medirPerfil(
        configuracao,
        clima,
        pilotosMelhorados,
        pilotosMelhorados.find((piloto) => piloto.piloto === alvo.piloto),
      );
      diferenças.push(media(melhorado.pePorCorrida) - media(neutro.pePorCorrida));
    }
  }
  progresso.recomendacoesFatorCusto[atributo] = Math.max(
    0.1,
    Math.abs(media(diferenças)),
  );
}
const mediaImpactos = media(
  Object.values(progresso.recomendacoesFatorCusto),
);
for (const atributo of atributos) {
  progresso.recomendacoesFatorCusto[atributo] =
    mediaImpactos === 0
      ? 1
      : progresso.recomendacoesFatorCusto[atributo] / mediaImpactos;
}

progresso.avisos = avisos;
console.log("\nMédia geral e razão vs. controle:");
for (const arquetipo of arquetipos) {
  const dados = progresso.resultados[arquetipo.nome];
  console.log(
    `${arquetipo.nome}: ${dados.mediaGeral.toFixed(2)} PE, razão ${dados.razaoControle?.toFixed(2) ?? "n/a"}x`,
  );
}
console.log("\nFatores de custo sugeridos (proporcionais ao impacto médio +3):");
console.log(JSON.stringify(progresso.recomendacoesFatorCusto, null, 2));
if (avisos.length > 0) {
  console.warn("\nCritérios de calibração fora do alvo:");
  for (const aviso of avisos) console.warn(`- ${aviso}`);
} else {
  console.log("\nTodos os critérios de calibração foram atendidos nesta amostra.");
}

const pastaSaida = path.join(__dirname, "outputs", "calibrar-pe-builds");
fs.mkdirSync(pastaSaida, { recursive: true });
fs.writeFileSync(
  path.join(pastaSaida, "calibracao_pe_builds.json"),
  `${JSON.stringify(progresso, null, 2)}\n`,
  "utf8",
);
