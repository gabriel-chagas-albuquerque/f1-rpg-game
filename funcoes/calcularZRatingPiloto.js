const CONFIG_PE = require("../config/pe.config");

const calcularZRatingPiloto = (piloto, pilotos) => {
  if (!Array.isArray(pilotos) || pilotos.length < 2) {
    throw new Error("O catch-up requer ao menos dois pilotos no grid.");
  }
  const ratingMedio = (item) => {
    const ratings = Object.values(CONFIG_PE.CAMPOS_ATRIBUTOS_PILOTO).map(
      (campo) => item[campo],
    );
    if (ratings.some((rating) => !Number.isFinite(rating))) {
      throw new Error(`Atributos incompletos para ${item.piloto}.`);
    }
    return ratings.reduce((soma, rating) => soma + rating, 0) / ratings.length;
  };
  const ratings = pilotos.map(ratingMedio);
  const media =
    ratings.reduce((soma, rating) => soma + rating, 0) / ratings.length;
  const desvio = Math.sqrt(
    ratings.reduce((soma, rating) => soma + (rating - media) ** 2, 0) /
      ratings.length,
  );
  return desvio === 0 ? 0 : (ratingMedio(piloto) - media) / desvio;
};

module.exports = calcularZRatingPiloto;
