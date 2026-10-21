const readJson = require("./funcoes/readJson");
const calcularGridDeLargada = require("./funcoes/calcularGridDeLargada");
const calcularOrdemDeChegada = require("./funcoes/calcularOrdemDeChegada");
const { sortearClima } = require("./funcoes/sortearClima");

const [gp = "Monza", quantidadeTexto = "10000"] = process.argv.slice(2);
const quantidadeSimulacoes = Number(quantidadeTexto);
const pilotos = readJson("pilotos.json");
const equipes = readJson("equipes.json");
const configuracoes = readJson("pesos.json");
const configuracao = configuracoes.find((item) => item.GP === gp);

if (!configuracao) {
  throw new Error(`Grande Prêmio desconhecido: ${gp}.`);
}
if (!Number.isInteger(quantidadeSimulacoes) || quantidadeSimulacoes < 1) {
  throw new Error("A quantidade de simulações deve ser um inteiro positivo.");
}

const equipePorNome = new Map(equipes.map((equipe) => [equipe.equipe, equipe]));

const simular = (safetyCarAtivo) => {
  const porPiloto = new Map(
    pilotos.map((piloto) => [
      piloto.piloto,
      { finalizadas: 0, somaPosicoes: 0, somaQuadradosPosicoes: 0 },
    ]),
  );
  let vitoriasDaPole = 0;
  let ultrapassagens = 0;
  let dnfs = 0;
  let corridasComSafetyCar = 0;

  for (let indice = 0; indice < quantidadeSimulacoes; indice++) {
    const { pcQualy, pcCorrida } = sortearClima(configuracao.pct_chuva);
    const grid = calcularGridDeLargada(
      configuracao,
      pilotos,
      equipePorNome,
      pcQualy,
    );
    const resultados = calcularOrdemDeChegada(
      grid,
      configuracao.pesos.corrida,
      pcCorrida,
      configuracao.multiplicadorSeveridadeFalha,
      configuracao.voltas,
      {
        teto_dnf: configuracao.teto_dnf,
        safetyCarAtivo,
        intensidadeOperacoes: configuracao.intensidadeOperacoes,
      },
    );
    const eventos = resultados[0]?.eventosSafetyCar ?? [];

    if (eventos.length > 0) corridasComSafetyCar++;
    const vencedor = resultados.find((resultado) => !resultado.dnf.ocorreu);
    if (vencedor?.posicaoLargada === 1) vitoriasDaPole++;

    resultados.forEach((resultado, posicao) => {
      if (resultado.dnf.ocorreu) {
        dnfs++;
        return;
      }
      ultrapassagens += Math.max(
        0,
        resultado.posicaoLargada - (posicao + 1),
      );
      const acumulador = porPiloto.get(resultado.piloto);
      acumulador.finalizadas++;
      acumulador.somaPosicoes += posicao + 1;
      acumulador.somaQuadradosPosicoes += (posicao + 1) ** 2;
    });
  }

  const desviosPilotosFinalistas = [...porPiloto.values()]
    .filter((piloto) => piloto.finalizadas > 1)
    .map((piloto) => {
      const media = piloto.somaPosicoes / piloto.finalizadas;
      return Math.sqrt(
        Math.max(
          0,
          piloto.somaQuadradosPosicoes / piloto.finalizadas - media ** 2,
        ),
      );
    });

  return {
    vitoriasDaPole,
    desvioEntreFinalistas:
      desviosPilotosFinalistas.length > 0
        ? desviosPilotosFinalistas.reduce((total, valor) => total + valor, 0) /
          desviosPilotosFinalistas.length
        : null,
    ultrapassagens,
    percentualDNF: (dnfs / (quantidadeSimulacoes * pilotos.length)) * 100,
    corridasComSafetyCar,
  };
};

const semSafetyCar = simular(false);
const comSafetyCar = simular(true);

console.log(
  `GP ${gp} — ${quantidadeSimulacoes} simulações em cada cenário`,
);
console.table([
  {
    metrica: "Vitórias da pole",
    "sem SC": semSafetyCar.vitoriasDaPole,
    "com SC": comSafetyCar.vitoriasDaPole,
  },
  {
    metrica: "Desvio médio de posição dos finalistas",
    "sem SC": semSafetyCar.desvioEntreFinalistas,
    "com SC": comSafetyCar.desvioEntreFinalistas,
  },
  {
    metrica: "Ultrapassagens",
    "sem SC": semSafetyCar.ultrapassagens,
    "com SC": comSafetyCar.ultrapassagens,
  },
  {
    metrica: "% DNF",
    "sem SC": Number(semSafetyCar.percentualDNF.toFixed(2)),
    "com SC": Number(comSafetyCar.percentualDNF.toFixed(2)),
  },
  {
    metrica: "Corridas com SC",
    "sem SC": semSafetyCar.corridasComSafetyCar,
    "com SC": comSafetyCar.corridasComSafetyCar,
  },
]);
