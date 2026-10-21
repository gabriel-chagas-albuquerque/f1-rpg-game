const criarNomeArquivo = (nomeGP) => {
  const slug = nomeGP
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  return `resultados_${slug}.json`;
};

module.exports = criarNomeArquivo;