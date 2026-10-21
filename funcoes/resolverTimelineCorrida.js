const sortearSafetyCar = require("./sortearSafetyCar");

const sortearIndice = (tamanho, rand) => {
  const sorteio = rand();
  if (
    typeof sorteio !== "number" ||
    !Number.isFinite(sorteio) ||
    sorteio < 0 ||
    sorteio >= 1
  ) {
    throw new Error("O gerador aleatório do timeline retornou valor inválido.");
  }
  return Math.floor(sorteio * tamanho);
};

const criarGrupos = (participantes, campoPosicao, categoria, proximoId) => {
  const ordenados = [...participantes].sort(
    (a, b) =>
      a[campoPosicao] - b[campoPosicao] ||
      a.piloto.localeCompare(b.piloto),
  );
  const grupos = [];
  let atual = [];
  let posicaoInicialGrupo;

  for (const participante of ordenados) {
    if (
      atual.length > 0 &&
      participante[campoPosicao] - posicaoInicialGrupo > 3
    ) {
      grupos.push(atual);
      atual = [];
    }
    if (atual.length === 0) posicaoInicialGrupo = participante[campoPosicao];
    atual.push(participante);
  }
  if (atual.length > 0) grupos.push(atual);

  return grupos.flatMap((pilotos) => {
    const contemFalhaHumana = pilotos.some((participante) =>
      participante.falhas.some((falha) => falha.tipo === "humana"),
    );
    const gruposValidos = contemFalhaHumana
      ? [pilotos]
      : pilotos.map((participante) => [participante]);
    return gruposValidos.map((participantesGrupo) => ({
      id: proximoId(),
      categoria,
      pilotos: participantesGrupo,
    }));
  });
};

const resolverTimelineCorrida = (
  resultados,
  quantidadeVoltas,
  rand = Math.random,
  safetyCarAtivo = true,
) => {
  if (!Array.isArray(resultados)) {
    throw new Error("Os resultados da corrida devem ser uma lista.");
  }
  if (!Number.isInteger(quantidadeVoltas) || quantidadeVoltas <= 0) {
    throw new Error("Quantidade de voltas inválida para resolver o timeline.");
  }

  const participantes = resultados
    .filter(
      (resultado) =>
        resultado.falhaDurabilidade.ocorreu || resultado.falhaHumana.ocorreu,
    )
    .map((resultado) => ({
      resultado,
      piloto: resultado.piloto,
      posicaoLargada: resultado.posicaoLargada,
      posicaoMediaReal: resultado.posicaoMediaReal,
      falhas: [
        ["mecanica", resultado.falhaDurabilidade],
        ["humana", resultado.falhaHumana],
      ]
        .filter(([, falha]) => falha.ocorreu)
        .map(([tipo, falha]) => ({ tipo, dnf: falha.dnf })),
    }));

  let proximoId = 1;
  const novoId = () => proximoId++;
  let catalogo = [
    ...criarGrupos(
      participantes,
      "posicaoLargada",
      "posicaoLargada",
      novoId,
    ),
    ...criarGrupos(
      participantes,
      "posicaoMediaReal",
      "posicaoMediaReal",
      novoId,
    ),
  ];
  const voltasDisponiveis = new Set(
    Array.from({ length: quantidadeVoltas }, (_, indice) => indice + 1),
  );
  const eventos = [];
  const eventosSafetyCar = [];
  let incidenteLargadaAlocado = false;

  while (catalogo.length > 0) {
    const categoriaPreferida =
      sortearIndice(10, rand) === 0
        ? "posicaoLargada"
        : "posicaoMediaReal";
    const gruposDisponiveis = catalogo.filter((grupo) =>
      grupo.categoria === "posicaoLargada"
        ? !incidenteLargadaAlocado &&
          [...voltasDisponiveis].some((volta) => volta >= 1 && volta <= 5)
        : [...voltasDisponiveis].some(
            (volta) => volta >= 6 && volta <= quantidadeVoltas,
          ),
    );
    if (gruposDisponiveis.length === 0) break;

    const gruposDaCategoria = gruposDisponiveis.filter(
      (grupo) => grupo.categoria === categoriaPreferida,
    );
    const gruposAlternativos =
      gruposDaCategoria.length > 0
        ? gruposDaCategoria
        : gruposDisponiveis;
    const grupo =
      gruposAlternativos[
        sortearIndice(gruposAlternativos.length, rand)
      ];
    const voltasDoGrupo = [...voltasDisponiveis].filter((volta) =>
      grupo.categoria === "posicaoLargada"
        ? volta >= 1 && volta <= 5
        : volta >= 6 && volta <= quantidadeVoltas,
    );
    const volta = voltasDoGrupo[sortearIndice(voltasDoGrupo.length, rand)];
    const dnfs = [];

    for (const participante of grupo.pilotos) {
      const { resultado, falhas } = participante;
      const falhasDNF = falhas.filter((falha) => falha.dnf);
      if (falhasDNF.length > 0) {
        const causa = falhasDNF[0].tipo === "humana"
          ? "falhaHumana"
          : "falhaDurabilidade";
        resultado.dnf = {
          ocorreu: true,
          causa,
          voltaAbandono: volta,
          grupoId: grupo.id,
        };
        resultado.voltaAbandono = volta;
        for (const falha of [
          resultado.falhaDurabilidade,
          resultado.falhaHumana,
        ]) {
          if (falha.dnf) falha.voltaAbandono = volta;
        }
        dnfs.push({
          volta,
          tipo: falhasDNF[0].tipo,
        });
      }
    }

    const evento = {
      id: grupo.id,
      grupoId: grupo.id,
      categoria: grupo.categoria,
      volta,
      pilotos: grupo.pilotos.map((participante) => ({
        piloto: participante.piloto,
        dnf: participante.falhas.some((falha) => falha.dnf),
        falhas: participante.falhas.map((falha) => falha.tipo),
      })),
    };
    eventos.push(evento);

    if (dnfs.length > 0 && safetyCarAtivo) {
      const safetyCarsDoGrupo = sortearSafetyCar({
        dnfs,
        voltas: quantidadeVoltas,
        rand,
      });
      for (const safetyCar of safetyCarsDoGrupo) {
        const eventoSafetyCar = { ...safetyCar, grupoId: grupo.id };
        eventosSafetyCar.push(eventoSafetyCar);
        for (
          let voltaBloqueada = volta;
          voltaBloqueada <= volta + safetyCar.duracao &&
          voltaBloqueada <= quantidadeVoltas;
          voltaBloqueada++
        ) {
          voltasDisponiveis.delete(voltaBloqueada);
        }
      }
    }

    const idsPilotosAlocados = new Set(
      grupo.pilotos.map((participante) => participante.piloto),
    );
    catalogo = catalogo.filter(
      (outroGrupo) =>
        outroGrupo.id !== grupo.id &&
        !outroGrupo.pilotos.some((participante) =>
          idsPilotosAlocados.has(participante.piloto),
        ),
    );
    if (grupo.categoria === "posicaoLargada") {
      incidenteLargadaAlocado = true;
      catalogo = catalogo.filter(
        (outroGrupo) => outroGrupo.categoria !== "posicaoLargada",
      );
    }
    voltasDisponiveis.delete(volta);
  }

  if (catalogo.length > 0) {
    throw new Error(
      "Não há voltas disponíveis para alocar todos os grupos de incidentes.",
    );
  }

  eventosSafetyCar.sort((a, b) => a.voltaInicio - b.voltaInicio);
  return { eventos, eventosSafetyCar };
};

module.exports = resolverTimelineCorrida;
