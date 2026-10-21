# F1 RPG Backend

Backend em JavaScript/Node.js para simular fins de semana e temporadas de Fórmula 1. O projeto combina atributos de pilotos e equipes, pesos específicos por Grande Prêmio, clima, aleatoriedade, falhas, safety car e classificação. Também contém um sistema de Pontos de Evolução (PE) para o piloto controlado pelo jogador.

## Requisitos e execução

- Node.js instalado.
- O projeto usa CommonJS e as APIs nativas do Node.js; não há dependências de runtime declaradas em `package.json`.

Execute os comandos a partir da pasta raiz do projeto:

```bash
# Simula a temporada para todos os GPs, com 10.000 repetições por padrão
npm run races

# Simula um único GP e grava um resultado detalhado
node simular-corrida.js Monza

# Gera a classificação e os relatórios de uma execução por GP
npm run race

# Gera resultados secos para toda a temporada
node index.js --seco

# Executa a suíte configurada de testes
npm run tests
```

`index.js` também aceita um GP e uma quantidade de simulações:

```bash
node index.js Monza 1000
node index.js --seco Monza 1000
```

Na execução normal, o clima é sorteado conforme a probabilidade configurada para cada pista. `--seco` força as simulações para condições secas. Os resultados estatísticos de cada execução são gravados na pasta raiz.

## Visão geral do fluxo

1. **Dados de entrada:** `pilotos.json`, `equipes.json` e `pesos.json` definem o grid, os atributos das equipes e pilotos, e as regras específicas de cada pista.
2. **Qualificação:** `calcularGridDeLargada` combina os atributos e pesos da pista para calcular scores e ordenar o grid.
3. **Corrida:** `calcularOrdemDeChegada` calcula os scores de corrida, aplica clima, falhas e o limite de DNF, e processa eventos como safety car e mudanças de posição.
4. **Resultados:** `index.js` agrega muitas simulações para produzir estatísticas da temporada; `simular-corrida.js` executa um fim de semana individual.
5. **Classificação e evolução:** `classificar-resultados.js` calcula pontos do campeonato e métricas de dupla. O PE é calculado somente para o piloto marcado como jogador.

## Sistema de Pontos de Evolução (PE)

O PE substitui o sistema antigo de XP e se aplica exclusivamente a um piloto:

1. Em `pilotos.json`, defina `"pilotoJogador": true` no piloto controlado pelo jogador. Os pilotos que já estavam no arquivo ficam com o campo `false`.
2. Deve haver no máximo um piloto com a flag `true`. Os comandos de classificação e corrida individual rejeitam mais de um piloto marcado.
3. Gere ou atualize as expectativas antes de calcular PE:

   ```bash
   npm run expectativas-pe
   ```

   Isso cria ou substitui `expectativas.json`. O comando completo usa 10.000 simulações por pista e clima; para uma execução de teste, use `node calibrar-expectativas.js --simulacoes=100`.

4. Execute a classificação ou simulação de corrida. O cálculo de PE usa o desempenho de qualificação e corrida em relação às expectativas para a pista, clima e equipe. Falhas humanas, falhas mecânicas, DNF e safety car têm tratamento próprio.

As regras, limites e custos estão em `config/pe.config.js`; a fórmula, validações e compra de níveis de atributo estão em `funcoes/sistemaPE.js`. O estado de saldo e gasto é recebido pelo sistema de evolução, não persistido como uma conta de jogador por este backend.

Para conferir e calibrar o comportamento:

```bash
npm run calibrar-pe
npm run temporada-pe
```

`calibrar-pe` compara builds e grava as métricas em `calibracao_pe_builds.json`; `temporada-pe` compara perfis e grava `simulacao_temporada_pe.json`. Esses scripts são ferramentas de análise e não alteram automaticamente os fatores de custo.

## Arquivos principais

### Entradas e configurações

| Arquivo | Função |
| --- | --- |
| `pilotos.json` | Grid de pilotos, equipe e atributos individuais. `pilotoJogador` identifica o piloto que recebe PE. |
| `equipes.json` | Atributos de cada equipe, usados nos scores de qualificação, corrida e falhas. |
| `pesos.json` | Configuração por GP: voltas, probabilidade de chuva, pesos de piloto e equipe, pesos de RNG e parâmetros de falha. |
| `config/pe.config.js` | Parâmetros centrais do PE: base, escala, limites, custos, tetos sazonais e critérios de calibração. |
| `funcoes/configuracoes.js` | Atributos usados nos cálculos, médias de referência, teto de DNF e parâmetros gerais do safety car. |
| `funcoes/configChuva.js` | Limites e parâmetros usados para classificar e aplicar condições de chuva. |
| `funcoes/configFalhas.js` | Configuração compartilhada do sistema de falhas. |

### Entradas de execução

| Arquivo | Função |
| --- | --- |
| `index.js` | Executa simulações estatísticas por GP (ou por uma pista selecionada) e agrega resultados de temporada. |
| `simular-corrida.js` | Simula um único GP, imprime o resultado da corrida e o salva em `resultado_<GP>.json`. O GP é opcional; o padrão é Monza. |
| `classificar-resultados.js` | Executa uma simulação por GP, calcula as classificações de pilotos e equipes, registra métricas comparativas da dupla configurada e calcula PE para o piloto marcado. |
| `descritoresParaPesos.js` | Converte os descritores em `gerar-pesos/` em configurações compatíveis com `pesos.json`; `npm run writeweights` grava o arquivo e cria um backup. |
| `calcularOverall.js` | Gera `overall_carros_por_pista.csv` com o overall dos carros a partir dos pesos e atributos de equipe. |
| `validar-atributos-equipe.js` | Ferramenta para validar os atributos e resultados das equipes. |
| `comparar-safety-car.js` | Compara estatísticas com safety car em uma pista e quantidade de simulações informadas. |

### Módulos centrais (`funcoes/`)

| Arquivo | Função |
| --- | --- |
| `calcularGridDeLargada.js` | Calcula os scores de qualificação e gera a ordem de largada. |
| `calcularOrdemDeChegada.js` | Executa os cálculos de corrida, incluindo scores, falhas, DNF, timeline e safety car. |
| `calcularScore.js`, `calcularScoreQualificacao.js`, `calcularScoreCorrida.js` | Calculam as contribuições de atributos e scores das sessões. |
| `calcularClassificacaoCampeonato.js` | Converte resultados em pontos e ordena as classificações de pilotos e equipes. |
| `sortearClima.js`, `aplicarEfeitosChuva.js` | Sorteiam as condições e ajustam os pesos conforme a chuva. |
| `sortearFalhasCorrida.js`, `calcularFalha.js`, `determinarDNF.js`, `aplicarTetoDNF.js` | Sorteiam falhas, determinam abandonos e aplicam o limite de DNF. |
| `sortearSafetyCar.js`, `resolverTimelineCorrida.js`, `aplicarSafetyCarAoScore.js` | Modelam a entrada do safety car, os eventos da corrida e seu efeito nos scores. |
| `sistemaPE.js` | Calcula PE, valida entradas, calcula custo de evolução e tenta aplicar compras de atributos. |
| `simularFimDeSemanaPE.js` | Adapta as funções de grid e corrida para fornecer simulações aos scripts de calibração e temporada do PE. |
| `calcularZRatingPiloto.js` | Calcula o rating padronizado do piloto usado pelo mecanismo opcional de catch-up. |
| `avisarExpectativasDesatualizadas.js` | Avisa quando as expectativas geradas podem estar desatualizadas em relação às configurações usadas. |
| `calcularMetricasDuplaPilotos.js` | Gera métricas comparativas entre um piloto e seu companheiro de equipe; não concede XP. |
| `readJson.js` | Lê arquivos JSON usados pelo projeto. |

Os demais módulos de `funcoes/` dão suporte a ruído e RNG, normalização, validação, agregação e formatação dos resultados.

### Arquivos auxiliares e históricos

- `gerar-pesos/` contém os descritores de pista usados por `descritoresParaPesos.js`.
- `legacy/` guarda a versão antiga do ponto de entrada e dados legados; não faz parte do fluxo atual.
- `baseline_pre_fracao_dnf_20261003/` e `metricas_testes_builds/` armazenam resultados de referência e experimentos de calibração.
- `pilotos_original.json`, `equipes_original.json` e `pesos.json.bak` são cópias de referência; não substituem os arquivos ativos sem uma decisão explícita.
- `teste_durabilidade.js` é um script auxiliar para experimentos com durabilidade.
- Todos os arquivos JSON gerados pelos scripts de simulação e calibração são direcionados para subpastas dedicadas em `outputs/`.

### Calibração, testes e dados gerados

| Arquivo ou pasta | Função |
| --- | --- |
| `outputs/calibrar-expectativas/expectativas.json` | Resultados da calibração de expectativas gerados por `calibrar-expectativas.js`. |
| `outputs/calibrar-pe-builds/calibracao_pe_builds.json` | Relatório gerado por `calibrar-pe-builds.js`. |
| `outputs/simular-temporada-pe/simulacao_temporada_pe.json` | Relatório gerado por `simular-temporada-pe.js`. |
| `outputs/diagnostico-pe-neutro/diagnostico_pe_neutro.json` | Relatório gerado por `diagnosticoPENeutro.js`. |
| `outputs/simular-corrida/resultado_<GP>.json` | Saída de simulação individual gerada por `simular-corrida.js`. |
| `outputs/classificar-resultados/` | Contém `classificacao_por_pista.json`, `classificacao_campeonato.json` e `progresso_pe.json`. |
| `outputs/index/` | Contém `resultados_<gp>.json` e `resultados_equipes.json` gerados por `index.js`. |
| `tests/` | Testes de chuva, safety car, DNF, timeline, classificação, métricas de dupla, configuração de equipe e PE. |

Arquivos de resultado e relatórios são sobrescritos em suas respectivas pastas quando o comando correspondente for executado novamente.

## Scripts npm

| Comando | Descrição |
| --- | --- |
| `npm run races` | Executa `index.js` para todos os GPs. |
| `npm run race` | Executa `classificar-resultados.js`. |
| `npm run readweights` | Mostra a configuração de pesos gerada a partir dos descritores. |
| `npm run writeweights` | Atualiza `pesos.json` a partir dos descritores e cria um backup. |
| `npm run expectativas-pe` | Gera as expectativas usadas pelo PE. |
| `npm run calibrar-pe` | Executa a calibração de builds do PE. |
| `npm run temporada-pe` | Simula perfis de evolução do PE em uma temporada. |
| `npm run tests` | Executa, em sequência, os testes listados no script `tests` do `package.json`. |

## Testes

Os testes são executados com o runner nativo `node:test`. Para rodar um teste individual:

```bash
node tests/sistemaPE.test.js
node tests/chuva.test.js
```

O comando agregado `npm run tests` interrompe a sequência quando um teste falha. Para verificar os nomes e a ordem atuais dos testes, consulte o script `tests` em `package.json`.
