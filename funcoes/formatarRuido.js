const arredondarZ = require("./arredondarZ");

const formatarRuido = (ruido) => ({
  limite: arredondarZ(ruido.limite),
  valor: arredondarZ(ruido.valor),
});

module.exports = formatarRuido;