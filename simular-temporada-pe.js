const fs = require("node:fs");
const path = require("node:path");

const readJson = require("./funcoes/readJson");
const CONFIG_PE = require("./config/pe.config");
const { calcularPE, gastarPE } = require("./funcoes/sistemaPE");
const simularFimDeSemanaPE = require("./funcoes/simularFimDeSemanaPE");
const calcularZRatingPiloto = require("./funcoes/calcularZRatingPiloto");
const avisarExpectativasDesatualizadas = require("./funcoes/avisarExpectativasDesatualizadas");

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
  throw new Error("Execute node calibrar-expectativas.js antes da simulação de temporada.");
}
avisarExpectativasDesatualizadas(__dirname);
const expectativas = JSON.parse(fs.readFileSync(caminhoExpectativas, "utf8"));
const pilotos = readJson("pilotos.json");
const equipes = readJson("equipes.json");
const configuracoes = readJson("pesos.json").slice(
  0,
  CONFIG_PE.TEMPORADA_FINS_DE_SEMANA,
);
if (configuracoes.length !== CONFIG_PE.TEMPORADA_FINS_DE_SEMANA) {
  throw new Error(
    `São necessárias ${CONFIG_PE.TEMPORADA_FINS_DE_SEMANA} pistas para simular a temporada.`,
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
const mediasDados = Object.fromEntries(
  Object.values(atributosDados).map((nome) => [
    nome,
    pilotos.reduce((soma, piloto) => soma + piloto[nome], 0) / pilotos.length,
  ]),
);
const mediasRatingPilotos = pilotos.map(
  (piloto) =>
    Object.values(atributosDados).reduce(
      (soma, atributo) => soma + piloto[atributo],
      0,
    ) / atributos.length,
);
const mediaRating =
  mediasRatingPilotos.reduce((soma, valor) => soma + valor, 0) /
  mediasRatingPilotos.length;
const desvioRating = Math.sqrt(
  mediasRatingPilotos.reduce(
    (soma, valor) => soma + (valor - mediaRating) ** 2,
    0,
  ) / mediasRatingPilotos.length,
);
const alvo = pilotos.find(
  (piloto) => piloto.equipe === CONFIG_PE.EQUIPE_CALIBRACAO,
);
if (!alvo) {
  throw new Error(`Equipe de calibração não encontrada: ${CONFIG_PE.EQUIPE_CALIBRACAO}.`);
}
const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));

const simularPerfil = (multiplicadorRating) => {
  const pilotoSintetico = {
    ...alvo,
    ...Object.fromEntries(
      Object.entries(atributosDados).map(([atributo, campo]) => [
        campo,
        mediasDados[campo] + multiplicadorRating * desvioRating,
      ]),
    ),
    pilotoJogador: true,
  };
  const gridSintetico = pilotos.map((piloto) =>
    piloto.piloto === alvo.piloto
      ? pilotoSintetico
      : {
          ...piloto,
          ...mediasDados,
          pilotoJogador: false,
        },
  );
  const estado = {
    pe: 0,
    atributos: Object.fromEntries(
      atributos.map((atributo) => [
        atributo,
        pilotoSintetico[atributosDados[atributo]],
      ]),
    ),
    gastoTemporada: {},
  };
  let peGanho = 0;
  let pontosComprados = 0;
  let finsDeSemanaComPE = 0;

  for (const configuracao of configuracoes) {
    const clima =
      Math.random() < configuracao.pct_chuva ? "chuva" : "seco";
    const fimDeSemana = simularFimDeSemanaPE({
      configuracao: {
        ...configuracao,
        pct_chuva: clima === "seco" ? 0 : 1,
      },
      pilotos: gridSintetico,
      equipePorNome,
      clima,
    });
    const resultado = fimDeSemana.resultados.find(
      (item) => item.piloto === pilotoSintetico.piloto,
    );
    const calculo = calcularPE(
      {
        pista: configuracao.GP,
        clima,
        safetyCar: fimDeSemana.safetyCar,
        piloto: pilotoSintetico,
        qualificacao: resultado.qualificacao,
        corrida: { ...resultado.corrida, pontos: 0 },
      },
      expectativas,
      {
        peGanhoNaTemporada: peGanho,
        catchUp: {
          zRating: calcularZRatingPiloto(pilotoSintetico, gridSintetico),
        },
      },
    );
    peGanho += calculo.pe;
    estado.pe += calculo.pe;
    if (calculo.pe > 0) finsDeSemanaComPE++;

    while (true) {
      const candidatos = [...atributos].sort(
        (a, b) => estado.atributos[a] - estado.atributos[b],
      );
      let compraRealizada = false;
      for (const atributo of candidatos) {
        const compra = gastarPE(estado, atributo, 1);
        if (compra.ok) {
          estado.pe = compra.estado.pe;
          estado.atributos = compra.estado.atributos;
          estado.gastoTemporada = compra.estado.gastoTemporada;
          pilotoSintetico[atributosDados[atributo]] =
            compra.estado.atributos[atributo];
          pontosComprados++;
          compraRealizada = true;
          break;
        }
      }
      if (!compraRealizada) break;
    }
  }

  return {
    ratingEmDesviosDoGrid: multiplicadorRating,
    peTotal: peGanho,
    pontosAtributoComprados: pontosComprados,
    saldoPE: estado.pe,
    finsDeSemanaComPE,
  };
};

const perfis = [
  { nome: "Neutro", desvios: 0 },
  { nome: "Um desvio acima do companheiro", desvios: 1 },
  { nome: "Dois desvios acima do companheiro", desvios: 2 },
].map((perfil) => ({
  nome: perfil.nome,
  ...simularPerfil(perfil.desvios),
}));
const controle = perfis[0].peTotal;
console.log("Perfil | PE total | Atributos comprados | Razão vs. neutro");
for (const perfil of perfis) {
  const razao = controle === 0 ? null : perfil.peTotal / controle;
  console.log(
    `${perfil.nome} | ${perfil.peTotal.toFixed(2)} | ${perfil.pontosAtributoComprados} | ${razao === null ? "n/a" : `${razao.toFixed(2)}x`}`,
  );
  perfil.razaoControle = razao;
}

const avisos = [];
if (perfis[1].razaoControle > CONFIG_PE.LIMITE_PE_UM_DESVIO) {
  avisos.push(
    "O piloto 1 desvio acima ultrapassou 1,5x o PE neutro; revisar retornos decrescentes/custo crescente antes dos tetos.",
  );
}
if (perfis[2].razaoControle > CONFIG_PE.LIMITE_PE_DOIS_DESVIOS) {
  avisos.push(
    "O piloto 2 desvios acima ultrapassou 1,8x o PE neutro; revisar retornos decrescentes/custo crescente antes dos tetos.",
  );
}
if (avisos.length > 0) {
  for (const aviso of avisos) console.warn(`Aviso: ${aviso}`);
} else {
  console.log("Ambos os limites de domínio foram atendidos.");
}
const pastaSaida = path.join(__dirname, "outputs", "simular-temporada-pe");
fs.mkdirSync(pastaSaida, { recursive: true });
fs.writeFileSync(
  path.join(pastaSaida, "simulacao_temporada_pe.json"),
  `${JSON.stringify({ finsDeSemana: configuracoes.length, perfis, avisos }, null, 2)}\n`,
  "utf8",
);
