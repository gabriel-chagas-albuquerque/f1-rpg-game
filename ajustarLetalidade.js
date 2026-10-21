// Reduz (ou aumenta) a fração de falhas que viram DNF, mantendo a FREQUÊNCIA de falhas.
// Uso: node ajustarLetalidade.js <multiplicador humana> <multiplicador mecânica> [--exceto=Pista1,Pista2]
//   ex.: node ajustarLetalidade.js 0.7 0.8                  -> 30% menos DNFs humanos e 20% menos mecânicos
//   ex.: node ajustarLetalidade.js 0.7 0.8 --exceto=Monaco  -> Mônaco fica exatamente como está
//   (pistas em --exceto não são alteradas: mantêm a letalidade e o fator calculado pela meta de DNF)
//
// 1) Congela o fator de falha atual de cada pista (lido do pesos.json) em fator_base_falha.
//    Sem isso, reduzir a letalidade faria o gerador AUMENTAR as falhas para manter dnf_por_corrida.
// 2) Multiplica letalidade_humana e letalidade_mecanica de todas as pistas (máximo 1).
//
// Rode antes: node descritoresParaPesos.js --escrever (o pesos.json deve refletir o que você quer congelar).
// Faça uma cópia do descritores.json. Depois: node descritoresParaPesos.js --escrever
const fs = require("node:fs");

const args = process.argv.slice(2);
const excetoArg = args.find((a) => a.startsWith("--exceto="));
const exceto = new Set(
  (excetoArg ? excetoArg.split("=")[1] : "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean),
);
const [mh, mm] = args.filter((a) => !a.startsWith("--")).map(Number);
if (![mh, mm].every((v) => Number.isFinite(v) && v > 0)) {
  console.error("Uso: node ajustarLetalidade.js <multiplicador humana> <multiplicador mecânica> [--exceto=Pista1,Pista2] (valores > 0)");
  process.exit(1);
}

const caminho = "gerar-pesos/descritores.json";
const descritores = JSON.parse(fs.readFileSync(caminho, "utf8"));
const pesos = new Map(JSON.parse(fs.readFileSync("pesos.json", "utf8")).map((p) => [p.GP, p]));

const ignoradas = [];
for (const pista of descritores.pistas) {
  if (exceto.has(pista.GP.toLowerCase())) { ignoradas.push(pista.GP); continue; }
  const f = pista.corrida.falhas;
  const atual = pesos.get(pista.GP)?.pesos.corrida.falhas;
  if (!atual) throw new Error(`pesos.json não tem a pista ${pista.GP}; rode --escrever antes.`);
  f.fator_base_falha = {
    humana: f.fator_base_falha?.humana ?? atual.FatorBaseFalhaHumana,
    mecanica: f.fator_base_falha?.mecanica ?? atual.FatorBaseFalhaMecanica,
  };
  f.letalidade_humana = Math.min(1, Number((f.letalidade_humana * mh).toFixed(3)));
  f.letalidade_mecanica = Math.min(1, Number((f.letalidade_mecanica * mm).toFixed(3)));
}

fs.writeFileSync(caminho, `${JSON.stringify(descritores, null, 2)}\n`, "utf8");
const desconhecidas = [...exceto].filter((n) => !descritores.pistas.some((p) => p.GP.toLowerCase() === n));
if (desconhecidas.length) console.warn(`Aviso: pistas de --exceto não encontradas: ${desconhecidas.join(", ")}`);
console.log(`Letalidade ajustada (humana x${mh}, mecânica x${mm}) em ${descritores.pistas.length - ignoradas.length} pistas.`);
if (ignoradas.length) console.log(`Mantidas sem alteração: ${ignoradas.join(", ")}.`);