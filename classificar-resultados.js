const fs = require("node:fs");
const path = require("node:path");

const readJson = require("./funcoes/readJson");
const calcularGridDeLargada = require("./funcoes/calcularGridDeLargada");
const calcularOrdemDeChegada = require("./funcoes/calcularOrdemDeChegada");
const calcularClassificacaoCampeonato = require("./funcoes/calcularClassificacaoCampeonato");
const { calcularPontos } = require("./funcoes/calcularClassificacaoCampeonato");
const {
  calcularMetricasDuplaPilotos,
  encontrarCompanheiroEquipe,
} = require("./funcoes/calcularMetricasDuplaPilotos");
const { calcularPE } = require("./funcoes/sistemaPE");
const calcularZRatingPiloto = require("./funcoes/calcularZRatingPiloto");
const avisarExpectativasDesatualizadas = require("./funcoes/avisarExpectativasDesatualizadas");
const CONFIG_PE = require("./config/pe.config");
const { sortearClima } = require("./funcoes/sortearClima");
const CONFIG_CHUVA = require("./funcoes/configChuva");

const pilotos = readJson("pilotos.json");
const equipes = readJson("equipes.json");
const configuracoesGP = readJson("pesos.json");
const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));
const pastaSaida = path.join(__dirname, "outputs", "classificar-resultados");
fs.mkdirSync(pastaSaida, { recursive: true });
const arquivoSaida = path.join(pastaSaida, "classificacao_por_pista.json");
const arquivoClassificacaoCampeonato = path.join(
  pastaSaida,
  "classificacao_campeonato.json",
);
/*
const arquivoMetricasDupla = path.join(
  pastaSaida,
  "metricas_gabriel_albuquerque.json",
);
const arquivoProgressoPE = path.join(
  pastaSaida,
  "progresso_pe.json",
);
const NOME_PILOTO_METRICAS = "Gabriel Albuquerque";
const { piloto: pilotoMetricas, companheiro: companheiroMetricas } =
  encontrarCompanheiroEquipe(pilotos, NOME_PILOTO_METRICAS);
const pilotosJogador = pilotos.filter(
  (piloto) => piloto.pilotoJogador === true,
);
if (pilotosJogador.length > 1) {
  throw new Error(
    "Marque pilotoJogador=true em apenas um piloto para calcular o PE do jogador.",
  );
}
*/
const classificarCondicaoChuva = (pc) => {
  if (pc === 0) return "seco";
  if (pc < CONFIG_CHUVA.limitesCategoria.garoa) return "garoa";
  if (pc < CONFIG_CHUVA.limitesCategoria.chuva) return "chuva";
  return "tempestade";
};

const circuitos = configuracoesGP.map((configuracao) => {
  const { pcQualy, pcCorrida } = sortearClima(configuracao.pct_chuva);
  const gridDeLargada = calcularGridDeLargada(
    configuracao,
    pilotos,
    equipePorNome,
    pcQualy,
  );
  const ordemDeChegada = calcularOrdemDeChegada(
    gridDeLargada,
    configuracao.pesos.corrida,
    pcCorrida,
    configuracao.multiplicadorSeveridadeFalha,
    configuracao.voltas,
    {
      teto_dnf: configuracao.teto_dnf,
      intensidadeOperacoes: configuracao.intensidadeOperacoes,
    },
  );

  const resultados = ordemDeChegada;
  const finalizados = [];
  const dnf = [];

  for (const resultado of resultados) {
    const piloto = {
      piloto: resultado.piloto,
      equipe: resultado.equipe,
      largada: resultado.posicaoLargada,
      falhaHumana: resultado.falhaHumana.ocorreu,
      falhaHumanaModerada:
        resultado.falhaHumana.ocorreu && !resultado.falhaHumana.dnf,
      falhaMecanicaModerada:
        resultado.falhaDurabilidade.ocorreu &&
        !resultado.falhaDurabilidade.dnf,
      falhaMecanica: resultado.falhaDurabilidade.ocorreu,
      posicaoRitmo: resultado.posicaoRitmo,
      posicaoMediaReal: resultado.posicaoMediaReal,
      scoreRitmoBase: resultado.scoreRitmoBase,
      scoreTotal: resultado.scoreTotal,
    };

    if (resultado.dnf.ocorreu) {
      dnf.push({
        ...piloto,
        motivo:
          resultado.dnf.causa === "falhaDurabilidade"
            ? "falha mecânica"
            : "erro humano",
        voltaAbandono: resultado.dnf.voltaAbandono,
      });
    } else {
      const motivosPenalidade = [];
      if (resultado.falhaDurabilidade.penalidade > 0) {
        motivosPenalidade.push("falhaMecanica");
      }
      if (resultado.falhaHumana.penalidade > 0) {
        motivosPenalidade.push("falhaHumana");
      }
      const motivoPenalidadeScore =
        motivosPenalidade.length === 2
          ? "ambas"
          : (motivosPenalidade[0] ?? null);

      finalizados.push({
        ...piloto,
        penalidadeScore: {
          aplicada: resultado.penalidadeFalhas > 0,
          valor: resultado.penalidadeFalhas,
          motivo: motivoPenalidadeScore,
        },
      });
    }
  }

  const classificacaoCorrida = [
    ...finalizados.map((resultado, indice) => ({
      ...resultado,
      posicao: indice + 1,
      status: "finalizado",
    })),
    ...dnf.map((resultado, indice) => ({
      ...resultado,
      posicao: finalizados.length + indice + 1,
      status: "dnf",
    })),
  ].map((resultado) => ({
    ...resultado,
    pontos: calcularPontos(resultado),
  }));
  const linhaDoTempo = [
    ...(ordemDeChegada[0]?.eventos ?? []).map((evento) => ({
      tipo: "incidente",
      ...evento,
    })),
    ...(ordemDeChegada[0]?.eventosSafetyCar ?? []).map((evento) => ({
      tipo: "safetyCar",
      ...evento,
      volta: evento.voltaInicio,
    })),
  ].sort(
    (a, b) =>
      a.volta - b.volta ||
      (a.grupoId ?? a.id) - (b.grupoId ?? b.id),
  );

  return {
    GP: configuracao.GP,
    condicao: classificarCondicaoChuva(pcCorrida),
    safetyCar: ordemDeChegada[0]?.eventosSafetyCar ?? [],
    linhaDoTempo,
    classificacao: classificacaoCorrida,
  };
});

fs.writeFileSync(
  arquivoSaida,
  `${JSON.stringify({ circuitos }, null, 2)}\n`,
  "utf8",
);
const classificacaoCampeonato =
  calcularClassificacaoCampeonato(circuitos);
fs.writeFileSync(
  arquivoClassificacaoCampeonato,
  `${JSON.stringify(classificacaoCampeonato, null, 2)}\n`,
  "utf8",
);
/*const metricasDupla = calcularMetricasDuplaPilotos(
  circuitos,
  pilotoMetricas,
  companheiroMetricas,
);
fs.writeFileSync(
  arquivoMetricasDupla,
  `${JSON.stringify(metricasDupla, null, 2)}\n`,
  "utf8",
);
let progressoPE;
if (!CONFIG_PE.ATIVAR_PE) {
  progressoPE = {
    status: "desativado",
    aviso: "O sistema de PE está desativado em config/pe.config.js.",
    pilotos: [],
  };
  console.warn(progressoPE.aviso);
} else if (pilotosJogador.length === 0) {
  progressoPE = {
    status: "aguardando_piloto_jogador",
    aviso:
      "Nenhum piloto está marcado com pilotoJogador=true; nenhum PE foi calculado.",
    pilotos: [],
  };
  console.warn(progressoPE.aviso);
} else {
  avisarExpectativasDesatualizadas(__dirname);
  const caminhoNovoExpectativas = path.join(
    __dirname,
    "outputs",
    "calibrar-expectativas",
    "expectativas.json",
  );
  const arquivoExpectativas = fs.existsSync(caminhoNovoExpectativas)
    ? caminhoNovoExpectativas
    : path.join(__dirname, "expectativas.json");
  if (!fs.existsSync(arquivoExpectativas)) {
    throw new Error(
      "expectativas.json não encontrado. Execute node calibrar-expectativas.js antes de calcular PE.",
    );
  }
  const expectativas = JSON.parse(
    fs.readFileSync(arquivoExpectativas, "utf8"),
  );
  const pilotoJogador = pilotosJogador[0];
  let peAcumulado = 0;
  const finsDeSemana = circuitos.map((circuito) => {
    const resultado = circuito.classificacao.find(
      (item) => item.piloto === pilotoJogador.piloto,
    );
    if (!resultado) {
      throw new Error(
        `Resultado do piloto ${pilotoJogador.piloto} ausente no GP ${circuito.GP}.`,
      );
    }
    const dnf =
      resultado.status !== "dnf"
        ? null
        : resultado.motivo === "erro humano"
          ? "humano"
          : "mecanico";
    const clima = circuito.condicao === "seco" ? "seco" : "chuva";
    const calculo = calcularPE(
      {
        pista: circuito.GP,
        clima,
        safetyCar: circuito.safetyCar.length > 0,
        piloto: pilotoJogador,
        qualificacao: { posicao: resultado.largada },
        corrida: {
          posicaoLargada: resultado.largada,
          posicaoFinal: resultado.posicao,
          pontos: calcularPontos(resultado),
          dnf,
          falhaHumanaModerada: resultado.falhaHumanaModerada,
          falhaMecanicaModerada: resultado.falhaMecanicaModerada,
        },
      },
      expectativas,
      {
        peGanhoNaTemporada: peAcumulado,
        catchUp: {
          zRating: calcularZRatingPiloto(pilotoJogador, pilotos),
        },
      },
    );
    peAcumulado += calculo.pe;
    return {
      GP: circuito.GP,
      clima,
      posicaoQualificacao: resultado.largada,
      posicaoFinal: resultado.posicao,
      dnf,
      pontos: calcularPontos(resultado),
      ...calculo,
      peAcumulado,
    };
  });
  progressoPE = {
    status: "calculado",
    piloto: pilotoJogador.piloto,
    equipe: pilotoJogador.equipe,
    peTotalTemporada: peAcumulado,
    finsDeSemana,
  };
}
fs.writeFileSync(
  arquivoProgressoPE,
  `${JSON.stringify(progressoPE, null, 2)}\n`,
  "utf8",
);
*/
for (const circuito of circuitos) {
  const dnfs = circuito.classificacao.filter(
    (resultado) => resultado.status === "dnf",
  ).length;
  console.log(
    `${circuito.GP}: ${circuito.classificacao.length - dnfs} finalizados, ${dnfs} DNF (${circuito.condicao}).`,
  );
}
console.log(`Classificações gravadas em ${path.basename(arquivoSaida)}.`);
console.log(
  `Classificação do campeonato gravada em ${path.basename(arquivoClassificacaoCampeonato)}.`,
);
/*console.log(
  `Métricas de ${NOME_PILOTO_METRICAS} e companheiro gravadas em ${path.basename(arquivoMetricasDupla)}.`,
);
console.log(`Progresso de PE gravado em ${path.basename(arquivoProgressoPE)}.`);
*/