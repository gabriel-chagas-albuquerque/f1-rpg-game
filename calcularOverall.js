// calcularOverall.js
const fs = require('fs');

// Mapeia os nomes dos atributos usados em pesos.json
// para os nomes usados em equipes.json
const MAPA_ATRIBUTOS = {
  AeroCarga: 'aero_carga',
  AeroEficiencia: 'aero_eficiencia',
  Chassi: 'chassi',
  Tracao: 'tracao',
  Potencia: 'potencia',
  Operacoes: 'operacoes',
  GestaoPneus: 'gestao_pneus'
};

function calcularOverall(pesos, equipes) {
  const resultados = [];

  for (const gp of pesos) {
    for (const fase of ['qualificacao', 'corrida']) {
      const pesosEquipe = gp.pesos[fase].equipe;

      for (const eq of equipes) {
        let overall = 0;

        for (const [attrPeso, attrEq] of Object.entries(MAPA_ATRIBUTOS)) {
          const peso = pesosEquipe[attrPeso] || 0;
          const valor = eq[attrEq] || 0;
          overall += peso * valor;
        }

        resultados.push({
          GP: gp.GP,
          Fase: fase,
          Equipe: eq.equipe,
          Overall: Number(overall.toFixed(3))
        });
      }
    }
  }

  return resultados;
}

// Execução direta via Node
if (require.main === module) {
  const pesos = JSON.parse(fs.readFileSync('pesos.json', 'utf8'));
  const equipes = JSON.parse(fs.readFileSync('equipes.json', 'utf8'));

  const resultados = calcularOverall(pesos, equipes);

  // Gera CSV
  const header = 'GP,Fase,Equipe,Overall\n';
  const linhas = resultados
    .map(r => `${r.GP},${r.Fase},${r.Equipe},${r.Overall}`)
    .join('\n');

  fs.writeFileSync('overall_carros_por_pista.csv', header + linhas, 'utf8');

  console.log('CSV gerado: overall_carros_por_pista.csv');

  // Exemplo: mostrar apenas Monza no console
  const monza = resultados.filter(r => r.GP === 'Monza');
  console.table(monza);
}

module.exports = { calcularOverall };