const fs = require("node:fs");
const path = require("node:path");

const readJson = require("./funcoes/readJson");
const calcularGridDeLargada = require("./funcoes/calcularGridDeLargada");
const calcularOrdemDeChegada = require("./funcoes/calcularOrdemDeChegada");
const { calcularPontos } = require("./funcoes/calcularClassificacaoCampeonato");
const { sortearClima } = require("./funcoes/sortearClima");
const CONFIG_CHUVA = require("./funcoes/configChuva");
const CONFIG_PE = require("./config/pe.config");
const { calcularPE } = require("./funcoes/sistemaPE");
const calcularZRatingPiloto = require("./funcoes/calcularZRatingPiloto");
const avisarExpectativasDesatualizadas = require("./funcoes/avisarExpectativasDesatualizadas");

// Captura o nome do GP passado via argumento da CLI (ex: node simular-corrida.js Monza)
// Se não informado, define um GP padrão
const gpAlvo = process.argv[2] || "Monza";

const pilotos = readJson("pilotos.json");
const equipes = readJson("equipes.json");
const configuracoesGP = readJson("pesos.json");
const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));

const classificarCondicaoChuva = (pc) => {
  if (pc === 0) return "seco";
  if (pc < CONFIG_CHUVA.limitesCategoria.garoa) return "garoa";
  if (pc < CONFIG_CHUVA.limitesCategoria.chuva) return "chuva";
  return "tempestade";
};

// Busca a configuração da pista solicitada
const configuracao = configuracoesGP.find(
  (c) => c.GP.toLowerCase() === gpAlvo.toLowerCase()
);

if (!configuracao) {
  console.error(`Erro: Grande Prêmio "${gpAlvo}" não foi encontrado em pesos.json.`);
  console.log("GPs disponíveis:", configuracoesGP.map((c) => c.GP).join(", "));
  process.exit(1);
}

function simularCorrida(config) {
  const { pcQualy, pcCorrida } = sortearClima(config.pct_chuva);
  
  const gridDeLargada = calcularGridDeLargada(
    config,
    pilotos,
    equipePorNome,
    pcQualy
  );

  const ordemDeChegada = calcularOrdemDeChegada(
    gridDeLargada,
    config.pesos.corrida,
    pcCorrida,
    config.multiplicadorSeveridadeFalha,
    config.voltas,
    {
      teto_dnf: config.teto_dnf,
      intensidadeOperacoes: config.intensidadeOperacoes,
    }
  );

  const finalizados = [];
  const dnf = [];

  for (const resultado of ordemDeChegada) {
    const piloto = {
      piloto: resultado.piloto,
      equipe: resultado.equipe,
      largada: resultado.posicaoLargada,
      falhaHumana: resultado.falhaHumana.ocorreu,
      falhaHumanaModerada:
        resultado.falhaHumana.ocorreu && !resultado.falhaHumana.dnf,
      falhaMecanica: resultado.falhaDurabilidade.ocorreu,
      falhaMecanicaModerada:
        resultado.falhaDurabilidade.ocorreu &&
        !resultado.falhaDurabilidade.dnf,
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
      a.volta - b.volta || (a.grupoId ?? a.id) - (b.grupoId ?? b.id)
  );

  return {
    GP: config.GP,
    condicao: classificarCondicaoChuva(pcCorrida),
    safetyCar: ordemDeChegada[0]?.eventosSafetyCar ?? [],
    linhaDoTempo,
    classificacao: classificacaoCorrida,
  };
}

// Executa a simulação apenas do GP selecionado
const resultadoCorrida = simularCorrida(configuracao);
const pilotosJogador = pilotos.filter(
  (piloto) => piloto.pilotoJogador === true,
);
if (pilotosJogador.length > 1) {
  throw new Error(
    "Marque pilotoJogador=true em apenas um piloto para calcular o PE do jogador.",
  );
}
let progressoPE = {
  status: CONFIG_PE.ATIVAR_PE ? "aguardando_piloto_jogador" : "desativado",
  pilotos: [],
};
if (CONFIG_PE.ATIVAR_PE && pilotosJogador.length === 1) {
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
  const resultado = resultadoCorrida.classificacao.find(
    (item) => item.piloto === pilotoJogador.piloto,
  );
  if (!resultado) {
    throw new Error(
      `Resultado do piloto ${pilotoJogador.piloto} não está na classificação de ${resultadoCorrida.GP}.`,
    );
  }
  const calculo = calcularPE(
    {
      pista: resultadoCorrida.GP,
      clima: resultadoCorrida.condicao === "seco" ? "seco" : "chuva",
      safetyCar: resultadoCorrida.safetyCar.length > 0,
      piloto: pilotoJogador,
      qualificacao: { posicao: resultado.largada },
      corrida: {
        posicaoLargada: resultado.largada,
        posicaoFinal: resultado.posicao,
        pontos: resultado.pontos,
        dnf:
          resultado.status !== "dnf"
            ? null
            : resultado.motivo === "erro humano"
              ? "humano"
              : "mecanico",
        falhaHumanaModerada: resultado.falhaHumanaModerada,
        falhaMecanicaModerada: resultado.falhaMecanicaModerada,
      },
    },
    expectativas,
    {
      catchUp: {
        zRating: calcularZRatingPiloto(pilotoJogador, pilotos),
      },
    },
  );
  progressoPE = {
    status: "calculado",
    piloto: pilotoJogador.piloto,
    ...calculo,
  };
  for (const linha of progressoPE.log) console.log(linha);
} else {
  console.warn(
    CONFIG_PE.ATIVAR_PE
      ? "Nenhum piloto está marcado com pilotoJogador=true; nenhum PE foi calculado."
      : "O sistema de PE está desativado em config/pe.config.js.",
  );
}

// Salva o resultado em um arquivo com o nome da pista
const pastaSaida = path.join(__dirname, "outputs", "simular-corrida");
fs.mkdirSync(pastaSaida, { recursive: true });
const arquivoSaida = path.join(pastaSaida, `resultado_${resultadoCorrida.GP}.json`);
const resultadoComPE = { ...resultadoCorrida, progressoPE };
fs.writeFileSync(
  arquivoSaida,
  `${JSON.stringify(resultadoComPE, null, 2)}\n`,
  "utf8"
);

// Exibe resumo no console
const dnfs = resultadoCorrida.classificacao.filter((r) => r.status === "dnf").length;
console.log(
  `[${resultadoCorrida.GP}] ${resultadoCorrida.classificacao.length - dnfs} finalizados, ${dnfs} DNF (${resultadoCorrida.condicao}).`
);
console.log(`Resultado gravado em ${path.basename(arquivoSaida)}.`);