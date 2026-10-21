const fs = require("node:fs");
const path = require("node:path");

const avisarExpectativasDesatualizadas = (diretorioProjeto) => {
  const caminhoNovo = path.join(
    diretorioProjeto,
    "outputs",
    "calibrar-expectativas",
    "expectativas.json",
  );
  const arquivoExpectativas = fs.existsSync(caminhoNovo)
    ? caminhoNovo
    : path.join(diretorioProjeto, "expectativas.json");
  if (!fs.existsSync(arquivoExpectativas)) return false;

  const dataExpectativas = fs.statSync(arquivoExpectativas).mtimeMs;
  const fontes = ["pesos.json", "equipes.json"].filter((arquivo) => {
    const caminho = path.join(diretorioProjeto, arquivo);
    return (
      fs.existsSync(caminho) &&
      fs.statSync(caminho).mtimeMs > dataExpectativas
    );
  });
  if (fontes.length > 0) {
    console.warn(
      `Aviso: expectativas.json está desatualizado em relação a ${fontes.join(" e ")}. Execute node calibrar-expectativas.js.`,
    );
    return true;
  }
  return false;
};

module.exports = avisarExpectativasDesatualizadas;
