# Relatório de análise do F1 RPG Backend

## 1. Escopo e resumo

Este relatório descreve o comportamento implementado no código atual do projeto: entradas, atributos, pesos, constantes, fluxos de simulação, ferramentas auxiliares, saídas e discrepâncias verificáveis. O backend é uma aplicação Node.js/CommonJS executada principalmente por scripts de linha de comando; não há servidor HTTP nem dependências de runtime declaradas no `package.json`.

O fluxo de simulação combina o grid de pilotos e equipes com uma configuração por Grande Prêmio (GP). Para cada sessão, calcula scores ponderados normalizados em relação ao grid, sorteia ruído/falhas, resolve incidentes e safety cars, ordena os resultados e, conforme o script, agrega estatísticas ou calcula classificação/PE.

## 2. Entradas da aplicação

### 2.1 Dados centrais

| Fonte | Conteúdo | Como é usada |
| --- | --- | --- |
| [pilotos.json](./pilotos.json) | 22 registros: `piloto`, `pilotoJogador`, `equipe`, `velocidade_qualificacao`, `velocidade_corrida`, `consistencia`, `racecraft`, `gerenciamento`, `adaptabilidade`, `fisico`. | Identifica o piloto e sua equipe; fornece os valores usados no score, ruído, falhas e PE. No estado atual nenhum piloto tem `pilotoJogador: true`. |
| [equipes.json](./equipes.json) | 11 registros: `equipe`, `aero_carga`, `aero_eficiencia`, `chassi`, `tracao`, `potencia`, `operacoes`, `gestao_pneus`, `durabilidade`. | Fornece os valores de carro/operações e durabilidade. |
| [pesos.json](./pesos.json) | 24 configurações de GP com voltas, clima, pesos, falhas e parâmetros da sessão. | Fonte operacional principal dos pesos e parâmetros específicos de pista para os scripts de corrida. |
| [config/operacoes.config.js](./config/operacoes.config.js) | Ativação e coeficientes do bônus de Operações. | Desacopla o efeito de Operações do score ponderado de equipe e aplica bônus independente. |
| [config/pe.config.js](./config/pe.config.js) | Pesos, limites, custos e parâmetros de cálculo/calibração de Pontos de Evolução. | Usado pelas rotinas de PE e scripts de calibração. |
| [funcoes/configChuva.js](./funcoes/configChuva.js) | Distribuição de intensidade, persistência entre sessões, limites de categoria e modificadores de chuva. | Usado pelo sorteio do clima e ajuste dos pesos/risco/RNG. |
| [funcoes/configuracoes.js](./funcoes/configuracoes.js) | Mapas de atributos, médias calculadas do grid, constantes globais de RNG, DNF e safety car. | Parâmetros compartilhados pelos módulos de score, ruído, falhas e timeline. |
| [funcoes/configFalhas.js](./funcoes/configFalhas.js) | Referências de escala de penalidade: qualificação `0.5`, corrida `0.25`. | Multiplica a penalidade total de falhas em cada sessão. |

Os valores de `pilotos.json` e `equipes.json` são lidos em tempo de execução; médias de consistência, velocidade de corrida, durabilidade e operações são calculadas desses arquivos e reutilizadas nos cálculos de ruído.

### 2.2 Atributos e seus usos efetivos

**Piloto**

| Campo | Efeito no código |
| --- | --- |
| `velocidade_qualificacao` | Participa do score ponderado de qualificação e do rating médio usado nas rotinas PE/catch-up. |
| `velocidade_corrida` | Participa do score ponderado de corrida; também é a referência do ruído de largada. |
| `consistencia` | Determina a probabilidade de falha humana e a amplitude do ruído do piloto. Não é atributo ponderado diretamente no score de ritmo. |
| `racecraft` | Peso de piloto em qualificação/corrida; o valor do peso é definido por GP. |
| `gerenciamento` | Peso de piloto em qualificação/corrida; influencia com mais/menos peso conforme o GP. |
| `adaptabilidade` | Peso de piloto em qualificação/corrida e contribuição ajustada em pista molhada. |
| `fisico` | Peso de piloto na corrida e contribuição ajustada em pista molhada. |
| `pilotoJogador` | Flag de elegibilidade ao PE; não é atributo de performance. Deve haver no máximo um jogador nos scripts que calculam PE. |
| `piloto`, `equipe` | Identidade e vínculo para associar atributos, scores, resultados e expectativas. |

**Equipe**

| Campo | Efeito no código |
| --- | --- |
| `aero_carga`, `aero_eficiencia`, `chassi`, `tracao`, `potencia`, `gestao_pneus` | Score de equipe por sessão, com pesos específicos da pista; os pesos também são ajustados pela chuva. |
| `operacoes` | Bônus baseado no z-score da equipe; mistura também ruído de Operações e de carro. Com o bônus ativo, o peso de Operações é retirado do score regular da equipe e os outros pesos são renormalizados. |
| `durabilidade` | Afeta a probabilidade de falha mecânica e o limite do ruído de carro. Não faz parte do score ponderado normal de equipe. |
| `equipe` | Chave para relacionar o piloto aos dados da equipe. |

Os campos usados pelo score ponderado são mapeados em `funcoes/configuracoes.js`. `consistencia` e `durabilidade` têm função importante mesmo sem integrarem os vetores de peso de ritmo.

### 2.3 Estrutura de `pesos.json`

Cada configuração de GP contém:

- Metadados: `GP`, `voltas`, `pct_chuva`, `intensidadeOperacoes`, `multiplicadorSeveridadeFalha`, `pesos` e `pct_safety_car`.
- Para cada uma das sessões `qualificacao` e `corrida`:
  - `pesosGerais`: combinações de score e limites de RNG.
  - `falhas`: probabilidades-base, frações de DNF e intervalo da penalidade.
  - `piloto`: pesos dos seis atributos de piloto usados pelo score ponderado.
  - `equipe`: pesos dos sete atributos de equipe.

Campos existentes nos pesos gerais:

| Sessão | Chaves | Interpretação |
| --- | --- | --- |
| Qualificação | `WPiloto`, `WEquipe` | Misturam scores z normalizados de piloto/equipe; devem somar 1. |
| Qualificação | `RngPiloto`, `RngCarro`, `RngOperacoes` | Intensidades-base de ruído para esses componentes. |
| Corrida | `WPosInicial`, `WPiloto`, `WEquipe` | Misturam posição de largada, score z de piloto e score z de equipe; devem somar 1. |
| Corrida | `RngPiloto`, `RngCarro`, `RngOperacoes`, `RngLargada`, `RngSafetyCar` | Intensidades-base de ruído para os componentes listados. |

Os vetores de pesos por atributo são:

- **Piloto/qualificação:** `VelocidadeQualificacao`, `Adaptabilidade`, `Racecraft`, `Gerenciamento`, `VelocidadeCorrida`, `Fisico`.
- **Piloto/corrida:** as mesmas seis chaves.
- **Equipe/qualificação e corrida:** `AeroCarga`, `AeroEficiencia`, `Chassi`, `Tracao`, `Potencia`, `Operacoes`, `GestaoPneus`.
- Cada vetor de atributos deve somar 1, dentro da tolerância de validação `0,001`.

Os vetores numéricos completos de todos os atributos, falhas e RNG por GP estão em [pesos.json](./pesos.json), que é a fonte de verdade para os valores individuais. A tabela abaixo registra os metadados e os pesos gerais que definem o balanço principal de cada pista. `WQ P/E` são `WPiloto/WEquipe` da qualificação; `WR larg./P/E` são os pesos gerais da corrida.

| GP | Voltas | Chuva | Intensidade Ops. | Severidade | WQ P/E | WR larg./P/E |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Monza | 53 | 0,12 | 0,90 | 1,00 | 0,55 / 0,45 | 0,50 / 0,25 / 0,25 |
| Monaco | 78 | 0,38 | 1,25 | 0,20 | 0,62 / 0,38 | 0,90 / 0,068 / 0,032 |
| Austria | 71 | 0,05 | 0,85 | 1,00 | 0,49 / 0,51 | 0,45 / 0,192 / 0,358 |
| Suzuka | 53 | 0,14 | 0,75 | 0,80 | 0,65 / 0,35 | 0,70 / 0,225 / 0,075 |
| Barcelona | 66 | 0,12 | 0,85 | 0,80 | 0,61 / 0,39 | 0,70 / 0,195 / 0,105 |
| Baku | 51 | 0,05 | 1,15 | 1,00 | 0,59 / 0,41 | 0,425 / 0,345 / 0,23 |
| Singapura | 62 | 0,16 | 1,35 | 0,20 | 0,63 / 0,37 | 0,90 / 0,07 / 0,03 |
| Spa-Francorchamps | 44 | 0,19 | 1,05 | 1,00 | 0,63 / 0,37 | 0,575 / 0,297 / 0,128 |
| Bahrein | 57 | 0,05 | 0,90 | 1,00 | 0,55 / 0,45 | 0,475 / 0,263 / 0,262 |
| Interlagos | 71 | 0,14 | 1,05 | 1,00 | 0,61 / 0,39 | 0,60 / 0,26 / 0,14 |
| Australia | 58 | 0,14 | 1,05 | 1,00 | 0,57 / 0,43 | 0,625 / 0,206 / 0,169 |
| China | 56 | 0,06 | 1,00 | 1,00 | 0,58 / 0,42 | 0,65 / 0,201 / 0,149 |
| Jeddah | 50 | 0,06 | 1,10 | 0,90 | 0,61 / 0,39 | 0,675 / 0,211 / 0,114 |
| Miami | 57 | 0,06 | 1,10 | 1,00 | 0,57 / 0,43 | 0,50 / 0,275 / 0,225 |
| Montreal | 70 | 0,14 | 1,05 | 1,00 | 0,59 / 0,41 | 0,625 / 0,225 / 0,15 |
| Silvestone | 52 | 0,18 | 1,10 | 1,00 | 0,61 / 0,39 | 0,50 / 0,325 / 0,175 |
| Hungria | 70 | 0,20 | 1,05 | 1,00 | 0,61 / 0,39 | 0,45 / 0,358 / 0,192 |
| Zandvoort | 72 | 0,16 | 0,90 | 0,30 | 0,62 / 0,38 | 0,825 / 0,118 / 0,057 |
| Madrid | 57 | 0,10 | 1,05 | 1,00 | 0,59 / 0,41 | 0,65 / 0,21 / 0,14 |
| Austin | 56 | 0,05 | 1,40 | 1,00 | 0,59 / 0,41 | 0,575 / 0,255 / 0,17 |
| Mexico | 71 | 0,05 | 1,00 | 1,00 | 0,58 / 0,42 | 0,575 / 0,244 / 0,181 |
| LasVegas | 50 | 0,08 | 0,85 | 1,00 | 0,55 / 0,45 | 0,575 / 0,213 / 0,212 |
| Catar | 57 | 0,07 | 0,95 | 1,00 | 0,59 / 0,41 | 0,625 / 0,225 / 0,15 |
| AbuDhabi | 58 | 0,05 | 1,15 | 1,00 | 0,59 / 0,41 | 0,60 / 0,24 / 0,16 |

Em todas as 24 entradas `pct_safety_car` é `0,1`. Esse campo **não** determina atualmente a geração de Safety Car na simulação (detalhes na seção 7).

### 2.4 Entradas de chuva

O campo `pct_chuva` por GP é uma probabilidade entre 0 e 1. Quando ocorre chuva, `configChuva.js` sorteia uma intensidade base: garoa `0,3` (50% dos sorteios molhados), chuva `0,6` (35%) ou tempestade `1,0` (15%). Adiciona jitter de amplitude total `0,2`, centralizado em `0,5`, e limita a intensidade ao intervalo `[0,1]` (com mínimo de chuva `0,1`).

A probabilidade de chuva na corrida depende da sessão de qualificação: se a quali ficou molhada, há probabilidade `0,75` de corrida molhada; a intensidade varia entre sessões com amplitude definida por `0,4`. A classificação de intensidade usa os cortes `<0,45` para garoa, `<0,8` para chuva e `>=0,8` para tempestade. Os relatórios agregados agrupam intensidade não nula como molhado quando necessário.

Com chuva, os pesos de atributos são ajustados proporcionalmente à intensidade e renormalizados. Na qualificação, há transferência geral de peso para o piloto (`0,1` por unidade de chuva), aumento do RNG e maior probabilidade-base de falha humana. Na corrida, parte do peso da posição inicial é transferida para piloto/equipe (`0,25`, dividida em `65%/35%`), alteram-se os pesos de performance e aumentam RNG e probabilidades de falha. Os deltas por atributo e coeficientes completos estão em [funcoes/configChuva.js](./funcoes/configChuva.js).

### 2.5 Pesos e parâmetros de falha

`pesos.json` contém, em cada sessão, `ProbFalhaMecanicaBase`, `ProbFalhaHumanaBase`, `FracaoDNFMecanica`, `FracaoDNFHumana`, `PenalidadeZMin` e `PenalidadeZMax`.

- Falha humana: `min(1, ProbFalhaHumanaBase × (100 - consistencia) / 100)`.
- Falha mecânica: probabilidade-base multiplicada por um fator sigmoide decrescente com durabilidade, limitada superiormente. No código atual, o fator usa piso `0,04`, teto `0,18`, centro `64,5` e escala `12`.
- Após a ocorrência da falha, `FracaoDNF...` determina se ela é abandono. Falha não-DNF recebe uma penalidade aleatória uniforme entre `PenalidadeZMin` e `PenalidadeZMax`.
- A severidade da penalidade de score é multiplicada por `multiplicadorSeveridadeFalha` e pelo fator de referência da sessão (`0,5` na quali e `0,25` na corrida). Se há DNF, essa penalidade de score combinada não é aplicada.
- Na qualificação, as frações de DNF configuradas em `pesos.json` são zero.

O parâmetro `voltas` é usado na alocação de incidentes/abandono e na validação das funções de falha; as probabilidades de falha não são escaladas por volta.

### 2.6 Aleatoriedade, DNF, operações e Safety Car

- O RNG usa `Math.random()` sem seed configurável. O ruído normal padrão é gerado por Box-Muller e truncado por rejeição em `±3σ`.
- O limite do ruído é `rngBase × (110 - atributo) / (110 - média de referência)`; o valor sorteado é o limite dividido por 3 e multiplicado pela normal truncada. Referências: média de consistência dos pilotos, durabilidade e operações das equipes, e velocidade de corrida dos pilotos. A largada usa velocidade de corrida; o ruído de Safety Car usa operações da equipe.
- O teto global de DNF está em modo `fixo`, valor `6`; parâmetros disponíveis para o modo dinâmico são mínimo `5` e `2` desvios da média estimada. A configuração por GP poderia fornecer `teto_dnf`, mas não há esse campo nas 24 configurações atuais.
- O Safety Car é avaliado a partir de DNFs alocados na timeline. Cada DNF humano gera um candidato com chance `0,10`, e cada DNF mecânico com chance `0,05`; duração sorteada entre 1 e 6 voltas. Eventos sobrepostos ou iniciados na última volta são descartados. Esses valores estão em `funcoes/configuracoes.js`.
- Se há Safety Car, a pontuação-base é comprimida por lambda calculado pela posição temporal do último evento, com mínimo `0,15`; também é adicionado ruído de SC por evento. O ruído inicial é atenuado conforme o evento ocorre mais cedo, com `SC_FRACAO_INICIO = 0,3`.
- O bônus de Operações está ativo por padrão. Configuração: `K_OPS=0,10`, fator de quali `0,3`, extra por SC `0,5`, extra por chuva `0,3` por unidade de intensidade e limite absoluto `0,35`. O bônus bruto usa o z-score de Operações, intensidade da pista e multiplicadores de evento, e é limitado a `±0,35`.

### 2.7 Entradas do gerador de pesos

[gerar-pesos/descritores.json](./gerar-pesos/descritores.json) é usado pelo script de geração, não diretamente pelos fluxos normais de corrida. Os campos aceitos são `GP`/`gp`, `voltas`, `pct_chuva`, `dnf_alvo`, descritores de `potencia`, `aero_carga`, `aero_eficiencia`, `chassi`, `tracao`, `operacoes`, `pneus`, `dificuldade_ultrapassagem`, `influencia_piloto`, `precisao`, `fisico`, `risco_erro`, `estresse_mecanico`, `imprevisibilidade` e campos opcionais `fatores_quali`, faixas de penalidade, `multiplicador_severidade` e `intensidade_operacoes`.

`descritoresParaPesos.js` converte esses descritores em pesos, calculando a distribuição geral de score, pesos de atributos, RNG, taxas/frações de falha e parâmetros de severidade. Quando atualiza pesos, preserva os valores existentes de `pct_safety_car` e `RngSafetyCar` (ou usa defaults). `--escrever` sobrescreve `pesos.json` e cria `pesos.json.bak`; sem a flag, imprime o JSON gerado no stdout.

## 3. Fluxos principais

### 3.1 Pipeline de qualificação e corrida

1. **Carregamento e validação:** os scripts carregam pilotos, equipes e configurações. Validam GP, número de simulações, probabilidades, soma dos pesos gerais e vetores de atributos, e parâmetros de ruído.
2. **Clima:** em cada simulação, `sortearClima(pct_chuva)` sorteia intensidade da quali e da corrida, com correlação entre as sessões. `--seco` no `index.js` força ambas a zero.
3. **Score de qualificação:** para cada piloto, associa a equipe, calcula score bruto como soma `atributo × peso`, converte scores brutos de piloto e equipe em z-scores relativos ao grid, combina-os por `WPiloto/WEquipe`, adiciona RNG e subtrai penalidade de falhas. Em seguida adiciona bônus de Operações, ordena por score decrescente e atribui a posição de largada.
4. **Falhas da corrida:** para cada piloto, sorteia falha de durabilidade e falha humana. Se o total de candidatos a DNF excede o teto, embaralha e corta os excedentes; falhas cortadas deixam de ser DNF e recebem penalidade não-DNF.
5. **Score-base da corrida:** calcula scores brutos e z-scores de piloto/equipe e posição inicial; soma contribuições por `WPosInicial/WPiloto/WEquipe`, ruído de piloto/carro/operações/largada e penalidades. A ordenação de ritmo produz uma posição projetada; a posição média real é a média entre largada e posição de ritmo.
6. **Timeline:** falhas humanas/mecânicas viram grupos potenciais de incidentes por posição de largada ou posição média real. São alocados a voltas disponíveis (eventos da largada entre voltas 1–5; demais a partir da volta 6), determinando a volta do DNF e podendo gerar Safety Car.
7. **Efeito de Safety Car e Operações:** se aplicável, ajusta o score de ritmo por lambda e ruído do evento; adiciona o bônus de Operações. Ordena resultados, separando finalizados e DNFs nos scripts de apresentação.
8. **Saída:** o script chamador imprime, agrega ou grava os resultados.

### 3.2 Scripts de execução

| Script/comando | Entradas adicionais | Fluxo/saída |
| --- | --- | --- |
| `npm run races` / `node index.js` | Padrão: 10.000 simulações por GP. Aceita `node index.js [GP] [quantidade]` e `node index.js --seco [GP] [quantidade]`. | Monte Carlo por GP; grava estatísticas em `outputs/index/resultados_<gp>.json`. Quando roda temporada completa com clima normal, grava também `resultados_equipes.json`. |
| `node simular-corrida.js [GP]` | GP opcional; padrão Monza. | Um fim de semana estocástico, classificação, timeline e eventual PE; grava `outputs/simular-corrida/resultado_<GP>.json`. |
| `npm run race` / `node classificar-resultados.js` | Nenhuma opção de CLI. | Uma simulação para cada GP; grava classificação por pista e campeonato em `outputs/classificar-resultados/`. |
| `npm run expectativas-pe` | Padrão 10.000 simulações; `--simulacoes=N` reduz/define a amostra. | Faz simulações secas e molhadas por pista/equipe, estima expectativas Q/R e modelo de posição final; grava `outputs/calibrar-expectativas/expectativas.json`. |
| `npm run calibrar-pe` | Padrão 5.000 simulações; `--simulacoes=N`. | Compara builds sintéticas de atributos usando expectativas e resultados simulados; grava relatório de calibração. |
| `npm run temporada-pe` | Usa 24 fins de semana, custos e limites de `pe.config.js`. | Simula perfis de jogador e compras de atributos ao longo da temporada; grava `outputs/simular-temporada-pe/simulacao_temporada_pe.json`. |
| `node diagnosticoPENeutro.js` | `--simulacoes=`, `--pistas=` e `--clima=seco\|chuva`; defaults no cabeçalho do script. | Mede PE para pilotos com atributos médios e compara equipes; exige expectativas calibradas. |
| `node comparar-safety-car.js [GP] [quantidade]` | Padrão Monza e 10.000 repetições por cenário. | Compara a mesma simulação com SC ativado/desativado e imprime métricas comparativas. |

`calcularOverall.js` é ferramenta auxiliar que lê `pesos.json` e `equipes.json` e gera `overall_carros_por_pista.csv`. `validar-atributos-equipe.js`, `validar-bonus-operacoes.js` e `teste_durabilidade.js` são verificadores/experimentos, não etapas necessárias da execução principal. `legacy/` e arquivos `*_original.json`/backups são referências históricas e não substituem os dados ativos.

### 3.3 Classificação do campeonato

`calcularClassificacaoCampeonato.js` atribui pontos apenas a finalizados: posições 1–10 recebem `25, 18, 15, 12, 10, 8, 6, 4, 2, 1`; as demais posições e DNFs recebem zero. Soma pontos por piloto e equipe, desempata por quantidade de posições (começando da posição 1) e, persistindo empate, por nome.

### 3.4 Fluxo de Pontos de Evolução (PE)

O PE usa expectativas por pista/clima/equipe, posição de qualificação e posições de largada/final, motivo de DNF, falhas e presença de SC. As expectativas são geradas por simulações com pilotos sintéticos de atributos médios:

- `EQ`: posição média de qualificação por equipe.
- `EC`: posição média de corrida entre os finalistas por equipe.
- Modelo de corrida ajustado por regressão linear: `esperadoFinal = a + b × posiçãoLargada + c × EC`.
- A chuva na geração de expectativas é simulada com intensidade fixa 1; as sessões secas têm intensidade 0. Se a amostra de chuva ficar abaixo de `EXPECTATIVAS_AMOSTRA_MINIMA=100`, pode usar expectativa seca como fallback.

Parâmetros de PE em `config/pe.config.js`:

| Parâmetro | Valor atual | Papel |
| --- | ---: | --- |
| `ATIVAR_PE` | `true` | Liga o cálculo. |
| `PE_BASE`, `PE_ESCALA` | `3`, `6` | Base e escala das contribuições de Q/R. |
| `PESO_Q`, `PESO_R`, `PESO_PONTOS` | `0,4`, `0,6`, `0` | Pesos de qualificação, corrida e pontos adicionais. Q+R deve somar 1. |
| `PE_MAX_FIM_DE_SEMANA` | `10` | Teto por fim de semana. |
| `N_PILOTOS`, `ALCANCE_MINIMO`, `EXPOENTE` | `22`, `3`, `0,7` | Normalização relativa e retornos decrescentes. |
| `PENAL_FALHA_HUMANA`, `PENAL_DNF_HUMANO` | `0,5`, `3` | Penalidades específicas de falha humana. |
| `FATOR_R_COM_SC` | `0,85` | Reduz em 15% o componente de corrida quando há SC. |
| `CUSTO_BASE`, `FATOR_CUSTO_ATRIBUTO` | `0,015`, `1` para cada atributo | Custo por nível: `CUSTO_BASE × nívelAtual^1,5 × fator`. |
| `NIVEL_MAXIMO_ATRIBUTO` | `99` | Limite do nível. |
| Tetos sazonais | `30` PE por atributo e `120` PE ganhos na temporada | Ambos ativados. |
| `ATIVAR_CATCH_UP`, `CATCH_UP_K`, limites | `false`, `0,15`, `[0,6; 1,2]` | Catch-up por z-rating, atualmente desligado. |
| Amostras | expectativas `10.000`, mínimo `100`, calibração `5.000` | Tamanhos de simulação. |
| Temporada/build | `24` fins de semana, bônus de build `10`, impacto `3` | Parâmetros dos scripts de calibração. |
| Controle de calibração | equipe `Haas`, tolerâncias `0,15`/`0,5`, limite de variância `0,6`, percentil `0,95`, razões `1,5`/`1,8` | Diagnósticos de neutralidade e domínio de builds. |

O resultado de Q/R é normalizado pelo alcance disponível no grid, limitado a `[-1,1]`, transformado por `sign(x) × |x|^0,7`, combinado com a base/escala e limitado. DNF torna o componente R neutro; falha mecânica moderada impede R negativo; falha humana moderada e DNF humano aplicam penalidades distintas. `gastarPE` pode atualizar um estado em memória, mas este backend não persiste uma conta/saldo de jogador.

## 4. Saídas

- `outputs/index/`: estatísticas agregadas de Monte Carlo, inclusive resultados por piloto/GP e equipes.
- `outputs/simular-corrida/`: classificação e timeline de um GP, com estado de PE quando calculado.
- `outputs/classificar-resultados/`: classificação por circuito e classificação do campeonato.
- `outputs/calibrar-expectativas/`: expectativas que alimentam os cálculos de PE.
- `outputs/calibrar-pe-builds/`, `outputs/simular-temporada-pe/` e `outputs/diagnostico-pe-neutro/`: relatórios de análise/calibração.
- `overall_carros_por_pista.csv`: saída auxiliar de `calcularOverall.js`.

Os arquivos gerados são sobrescritos pelo script correspondente. Os módulos de apresentação serializam os dados produzidos; `outputs/` não é entrada da simulação principal, exceto `expectativas.json` nos fluxos de PE e as rotinas de validação que deliberadamente carregam resultados anteriores.

## 5. Observações sobre documentação e dados não efetivos

1. **Safety Car configurado versus implementado:** `pct_safety_car` está preenchido como `0,1` em cada GP e é preservado pelo gerador de pesos, mas os módulos de corrida não o leem. A ocorrência efetiva deriva de falhas/DNFs e das constantes `SC_Q_HUMANA=0,1` e `SC_Q_MECANICA=0,05`. `RngSafetyCar`, em contrapartida, é usado para o ruído quando há SC.
2. **Curva mecânica em duas fontes divergentes:** o runtime usa os parâmetros codificados em `descritoresParaPesos.js` (`durabilidadePiso=0,04`, `durabilidadeTeto=0,18`, centro `64,5`, escala `12`). [configuracaoFalhaMecanica.json](./configuracaoFalhaMecanica.json) declara limites de 15% e 45%, mas não é carregado pelos módulos de corrida; o teste `tests/descritoresParaPesos.test.js` tenta validar a relação entre essas fontes. Não se deve interpretar esse JSON isolado como configuração ativa do runtime.
3. **Descritor `precisao`:** é exigido/normalizado pelo gerador de pesos, mas não aparece nas fórmulas de `gerarPesos`; alterar esse campo não muda os pesos gerados atualmente.
4. **PE em classificação:** o bloco de cálculo de PE de `classificar-resultados.js` está comentado e, portanto, não executa atualmente. `simular-corrida.js` mantém o fluxo PE ativo, condicionado a existir exatamente um piloto `pilotoJogador=true` e arquivo de expectativas. A documentação do README que afirma PE no comando de classificação não corresponde ao comportamento atual.
5. **Flag de jogador não configurada:** o arquivo ativo `pilotos.json` tem 22 pilotos e nenhum marcado como jogador. Assim, o PE do `simular-corrida.js` não é calculado no estado atual, mesmo com `ATIVAR_PE=true`.
6. **Teto de DNF por pista:** nenhum GP contém `teto_dnf`; a chamada cai no padrão global de teto fixo 6. Os parâmetros dinâmicos só são usados quando o modo global muda ou quando uma chamada explícita fornece configuração.
7. **Reprodutibilidade:** não há semente RNG configurável nos comandos principais; resultados variam entre execuções.
8. **Cobertura do comando de testes:** `npm run tests` executa as dez suítes relacionadas no `package.json`; há também `tests/descritoresParaPesos.test.js`, que não está incluído nesse script npm.

## 6. Referências principais do código

- Entrada Monte Carlo: [index.js](./index.js)
- Corrida individual e PE: [simular-corrida.js](./simular-corrida.js)
- Temporada e classificação: [classificar-resultados.js](./classificar-resultados.js)
- Score de qualificação/grid: [funcoes/calcularGridDeLargada.js](./funcoes/calcularGridDeLargada.js), [funcoes/calcularScoreQualificacao.js](./funcoes/calcularScoreQualificacao.js)
- Score, falhas, timeline e SC: [funcoes/calcularOrdemDeChegada.js](./funcoes/calcularOrdemDeChegada.js), [funcoes/calcularScoreCorrida.js](./funcoes/calcularScoreCorrida.js), [funcoes/resolverTimelineCorrida.js](./funcoes/resolverTimelineCorrida.js)
- Geração de pesos: [descritoresParaPesos.js](./descritoresParaPesos.js)
- Configuração de atributos e regras globais: [funcoes/configuracoes.js](./funcoes/configuracoes.js), [funcoes/configChuva.js](./funcoes/configChuva.js), [config/pe.config.js](./config/pe.config.js)
- PE e classificação: [funcoes/sistemaPE.js](./funcoes/sistemaPE.js), [funcoes/calcularClassificacaoCampeonato.js](./funcoes/calcularClassificacaoCampeonato.js)
