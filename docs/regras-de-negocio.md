# Regras de Negócio — realestate-ops-platform

Este documento consolida as regras de negócio definidas para o projeto **realestate-ops-platform**
(Cambará Empreendimentos). Cada regra inclui o que foi decidido, por que, e como foi analisada
contra o banco real — não são suposições, são decisões fundamentadas em evidência.

Fontes primárias desta consolidação: `realestate-ops-platform-instrucoes.md` (estado operacional
do projeto) e `refs/analise-banco-consolidada.md` (evidência bruta da análise do banco). Este
documento resume; para o SQL exato e as contagens linha a linha, consulte as fontes primárias.

Não estão aqui: decisões de stack técnica (Next.js, pnpm, Playwright), infraestrutura de CI, ou
mecanismo de autenticação (hash de senha, cookie) — essas são decisões de arquitetura, não de
regra de negócio, e vivem no `AGENTS.md` e no `instrucoes.md`.

---

## A — Normalização de dado

### A1. Normalização de status de unidade

**Regra**: `unidades.status` chega com 11 grafias brutas diferentes na base (variações de
capitalização, acentuação e um valor `Cancelado` distinto). Todas são reduzidas a 4 categorias
canônicas: `vendida`, `disponivel`, `reservada`, `distrato`.

**Por quê**: sem normalização, qualquer contagem por status (unidades disponíveis, vendidas etc.)
subestimaria ou fragmentaria os números, já que `'disponivel'` e `'disponível'`, por exemplo,
seriam tratados como categorias diferentes.

**Como foi analisado**: contagem de valores distintos em `unidades.status` contra o banco real,
antes de qualquer normalização. `Cancelado` foi unido a `distrato` (não tratado como categoria
própria) porque toda unidade com esse status está vinculada a uma venda com status distrato ou
distratada — nunca a uma venda ativa. Isso é evidência de que são o mesmo evento de negócio com
grafia diferente, não duas categorias distintas.

**Implementação**: view `v_unidades_norm`, coluna `status_canonico`.

---

### A2. Normalização de status de venda

**Regra**: `vendas.status_venda` chega com 6 grafias brutas, reduzidas a 2 categorias canônicas:
`ativa`, `distrato`.

**Por quê**: mesmo motivo da A1 — consistência de contagem.

**Como foi analisado**: contagem de valores distintos em `vendas.status_venda` contra o banco
real.

**Implementação**: view `v_vendas_norm`, coluna `status_canonico`.

---

### A3. Fonte de verdade em divergência status × data

**Regra**: quando `vendas.status_venda` (texto) e `vendas.data_distrato` (data) discordam sobre
se uma venda está ativa ou distratada, o **texto vence**, nunca a data.

**Por quê**: o texto de status é o campo de decisão original da operação comercial; a data é um
campo auxiliar mais sujeito a erro de preenchimento.

**Como foi analisado**: existem 46 vendas (de 2.206, ~2,1%) onde os dois campos discordam (ex.:
status `ativa` com `data_distrato` preenchida). Testado contra `unidades.status` da unidade
vinculada a cada uma dessas 46 vendas: em 100% dos casos, o status da unidade concorda com o
texto de `status_venda`, nunca com o que a data sugeriria. Essa é a evidência que decidiu a regra
— não foi uma suposição inicial (a hipótese original, antes da análise, era o oposto: que a data
seria mais confiável).

Reforço adicional encontrado durante a implementação da sessão 2: um subconjunto dessas mesmas 46
vendas tem `data_distrato` posterior à data atual do sistema, com gaps de ~400–445 dias entre
venda e distrato — sem padrão de erro de digitação isolado, mais evidência de que o campo de data
não é confiável de forma sistemática, não um caso pontual.

**Implementação**: view `v_vendas_norm` — `data_distrato` fica exposta como coluna informativa,
mas não decide `status_canonico`.

---

## B — Métricas de negócio (as 4 perguntas do enunciado)

### B1. "Total ofertado" (denominador da velocidade de vendas)

**Regra**: todas as 3.300 unidades cadastradas em `unidades`, independentemente do status atual
(vendida, disponível, reservada ou em distrato).

**Por quê**: representa o universo de estoque construído/planejado, não o estoque disponível no
momento da consulta.

**Como foi analisado**: verificado que nenhum valor de status na base sinaliza remoção de
oferta/portfólio (não existe, por exemplo, um status "cancelado do catálogo" que justificaria
excluir uma unidade do denominador).

---

### B2. Velocidade de vendas líquida de distrato

**Regra**: velocidade de vendas por empreendimento = unidades com `status_canonico = 'vendida'`
(que já é líquido — uma unidade cancelada aparece como `'distrato'`, não `'vendida'`) dividido
pelo total ofertado (regra B1).

**Por quê**: uma unidade que foi vendida e depois distratada não deve contar como venda líquida —
o cliente desistiu, a unidade voltou ao estoque.

**Como foi analisado**: consequência direta da normalização A1 — o merge de `Cancelado` em
`distrato` garante que nenhuma unidade cancelada seja contada como vendida.

**Limitação conhecida**: esta métrica não é normalizada pelo tempo desde o lançamento do
empreendimento — mistura "vende mal" com "foi lançado há pouco tempo". Fica para uma métrica
futura.

---

### B3. Magnitude de estouro de custo

**Regra**: magnitude acumulada de estouro de custo por empreendimento = soma apenas dos meses com
`custo_realizado > custo_orcado` (estouro positivo, critério bruto) — não a soma líquida de todos
os meses (que permitiria estouros e folgas se cancelarem).

**Por quê**: uma soma líquida pode mascarar risco real quando meses de estouro e de folga se
cancelam no mesmo empreendimento.

**Como foi analisado**: o caso **Cume Tower** foi usado como evidência decisiva — pelo critério
bruto, entra no top-4 de risco (R$ 3,1M de estouro acumulado nos meses ruins); pelo critério
líquido, o desvio cai para praticamente irrelevante (R$ 54 mil), porque meses de estouro e de
economia se cancelam. Um critério líquido esconderia um projeto de risco real do ranking. O
desvio líquido é mantido como métrica de referência secundária, não como critério principal.

---

### B4. Deduplicação de cliente

**Regra**: clientes são agrupados por chave normalizada (`nome` + `cidade`, minúsculo, sem
acento, espaços colapsados). Um grupo é classificado como **alta confiança** (fusão automática no
cálculo de métricas) se ao menos um membro tem e-mail no padrão `contatoN@exemplo.com` (sinal de
dado sintético/gerado). Caso contrário, **baixa confiança** — nunca fundido automaticamente,
sempre exibido como "requer verificação manual".

**Por quê**: sem tratamento, cadastros duplicados distorceriam contagem de clientes únicos e
ticket médio por cliente (o mesmo cliente contado várias vezes, dividindo o valor total por um
denominador inflado).

**Como foi analisado**: tentativa de implementar como SQL (view com `REPLACE()` encadeado para
tratar acentuação) estourou o parser do SQLite — reimplementado como função TypeScript
(`chaveDedup`, `classificarGruposDedup`), calculada em tempo de leitura, sem materialização.
Contra o banco real: 97 grupos duplicados identificados, 89 de alta confiança (fundidos), 8 pares
(16 registros) de baixa confiança sem nenhum sinal discriminante confiável — tratados como
ambiguidade genuína, não uma falha do critério.

**Achado correlato**: `clientes.email` é uma heurística de dedup inutilizável de forma geral —
gerado a partir do próprio `id` em todos os registros, garante unicidade artificial mesmo entre
prováveis duplicatas reais. Só o subconjunto sintético (`contatoN@exemplo.com`) serve como sinal.

**Nota — divergência entre o número atual e o número histórico da análise**: o dashboard
analítico (`lib/features/analitico/repository.ts`) reporta **1.440 clientes compradores únicos /
R$ 3.167.271,61 de ticket médio** (vendas com `status_canonico = 'ativa'`) como o número **atual**,
consistente com a política hoje implementada — merge automático só dos grupos de alta confiança;
os 8 pares de baixa confiança nunca entram em nenhum cálculo numérico. O número **1.436 / R$
3.176.094,10**, registrado em `refs/analise-banco-consolidada.md` §5c, veio de uma análise anterior
que mesclava alta e baixa confiança juntas — está desatualizado frente à política atual e é mantido
aqui só como referência de como o critério evoluiu, não como o número correto a citar hoje.

---

## C — Camada de escrita (venda e distrato)

### C1. Guard de disponibilidade — não vender unidade indisponível

**Regra**: não é possível registrar uma venda para uma unidade que já está `vendida` ou
`reservada`. A checagem acontece dentro do próprio `WHERE` da query de escrita (`UPDATE unidades
SET status = 'vendida' WHERE id = ? AND LOWER(TRIM(status)) IN ('disponivel', 'disponível')`), não
em um `SELECT` prévio seguido de checagem no código da aplicação.

**Por quê**: um padrão "ler → checar em JS → escrever" não garante atomicidade sob requisições
concorrentes — o `UPDATE...WHERE` resolve a garantia independentemente de concorrência, porque o
lock de arquivo do próprio SQLite serializa as escritas, e a condição do `WHERE` decide no momento
exato da escrita se a unidade ainda está disponível.

**Como foi analisado**: decisão arquitetural fundamentada em como SQLite lida com escrita
concorrente — não depende de contagem específica do banco, é uma garantia de corretude por
construção da query.

---

### C2. Distrato devolve a unidade ao status correto

**Regra**: registrar um distrato reverte `vendas.status_venda` para `distrato` (condicionado a que
a venda estivesse `ativa`) e devolve `unidades.status` para `disponivel`, na mesma transação.

**Por quê**: espelha a regra C1 no sentido inverso — sem isso, uma unidade distratada ficaria
presa como indisponível, mesmo estando livre para nova venda.

**Como foi analisado**: mesmo raciocínio de atomicidade da C1. Importante: este código só vale
para ações feitas pela aplicação a partir de agora — não corrige as 122 unidades do histórico
legado que já ficaram presas nesse estado antes da aplicação existir (ver regra D1).

---

### C3. `valor_venda` é campo livre negociado

**Regra**: o valor de cada venda é digitado no momento da venda, não puxado automaticamente de
`unidades.valor_tabela`.

**Por quê**: reflete a prática comercial real — o valor de tabela é referência, mas o valor
efetivamente negociado pode divergir (desconto, condição especial).

**Como foi analisado**: decisão de modelagem de formulário, não uma contagem contra o banco —
mas consistente com o fato de a base já ter `valor_venda` como campo próprio em `vendas`,
independente de `valor_tabela` em `unidades`.

---

### C4. `forma_pagamento` é enum fechado

**Regra**: o campo aceita exatamente 3 valores: `Financiamento`, `Parcelado Direto`, `À vista`.
Validado no formulário (select, não campo livre) e no backend via Zod.

**Por quê**: ao contrário dos demais campos de texto da base (que vieram sujos), este campo não
apresentou nenhuma variação de grafia — tratá-lo como enum fechado evita que a aplicação introduza
sujeira nova num campo que hoje está limpo.

**Como foi analisado**: verificação manual confirmou exatamente 3 valores distintos, sempre no
mesmo padrão exato — diferente da auditoria formal de contagem por valor distinto usada nos
campos de status (A1/A2). Ressalva registrada: se uma 4ª variante aparecer ao rodar contra o
banco real no futuro, não deve ser mapeada silenciosamente como "só mais uma grafia" — exige
confirmação antes de ampliar o enum.

---

### C5. `cidade` obrigatória no cadastro de cliente novo

**Regra**: embora `clientes.cidade` seja nullable no schema do banco, o formulário de cadastro de
cliente novo exige o preenchimento.

**Por quê**: a deduplicação (regra B4) depende do par nome+cidade — um cliente cadastrado sem
cidade quebraria silenciosamente a classificação de confiança daquele registro específico.

**Como foi analisado**: trade-off consciente entre fidelidade ao schema original (que permite
nulo) e a necessidade da regra B4 de ter os dois campos preenchidos. Decisão tomada e travada
durante a sessão de implementação da camada de escrita, não é mais tratada como premissa em
aberto.

---

### C6. Sem checagem de duplicidade de cliente no cadastro

**Regra**: o fluxo de venda que cria um cliente novo não verifica duplicidade no momento do
cadastro — a dedup (regra B4) é responsabilidade exclusiva da camada de leitura/analítica.

**Por quê**: checar duplicidade em tempo de escrita exigiria decidir, na hora, se um possível
duplicado deve bloquear o cadastro ou não — uma decisão de UX/negócio que não estava no escopo
definido, e que poderia impedir cadastros legítimos por falso positivo.

**Como foi analisado**: decisão de escopo, não uma contagem — mantém a responsabilidade de
dedup centralizada em um único lugar (lib/features/clientes/dedup.ts), evitando lógica duplicada
ou divergente entre o momento de escrita e o de leitura.

---

## D — Governança de dado legado

### D1. Unidades presas em status inconsistente

**Regra**: 122 unidades têm `status_canonico = 'distrato'` (via `v_unidades_norm`) e nunca
voltaram a `disponivel` no histórico, mesmo sem nenhuma venda ativa vinculada. Tratadas como
bucket separado na view — **não** reclassificadas automaticamente, e **não** corrigidas na fonte.

**Por quê**: reclassificar ou corrigir esses registros seria uma alteração de dado histórico sem
uma regra de negócio clara sobre o que de fato aconteceu com cada unidade (a aplicação não tem
como saber se a unidade deveria estar disponível hoje ou se há um motivo de negócio real para o
status atual). Corrigir na fonte é uma proposta pendente de aprovação humana explícita — nunca
foi aplicada.

**Como foi analisado**: contagem de unidades com status canônico `distrato` sem venda ativa
correspondente, contra o banco real.

**Nota importante**: este é um problema do dado histórico anterior à aplicação. O código da
camada de escrita (regras C1/C2) só garante corretude para ações novas feitas pela aplicação a
partir de agora — não corrige retroativamente o histórico legado.

---

### E1. Ausência de RBAC (controle de acesso por papel)

**Regra**: qualquer usuário autenticado, independentemente do `papel` (`diretoria`, `comercial`,
`engenharia`, `financeiro`), tem acesso às mesmas rotas — incluindo vender e distratar. Não há
distinção de permissão implementada.

**Por quê**: o enunciado do teste técnico explicitamente lista "autenticação de nível produção"
como algo que **não** está sendo avaliado. RBAC não foi decidido como requisito em nenhum momento
do projeto — implementá-lo por analogia com "boa prática genérica" seria assumir escopo não
travado.

**Como foi analisado**: não é uma análise de dado — é uma decisão de escopo deliberada, registrada
para não ser confundida com descuido. Se a distinção de acesso por papel se tornar necessária,
depende de definição explícita de quais ações cada papel pode/não pode fazer — isso ainda não foi
especificado por ninguém.

---

## Resumo — tabela de rastreabilidade

| #   | Regra                                                | Categoria   | Evidência                                                      |
| --- | ---------------------------------------------------- | ----------- | -------------------------------------------------------------- |
| A1  | Normalização de status de unidade                    | Dado        | 11 grafias contadas contra o banco                             |
| A2  | Normalização de status de venda                      | Dado        | 6 grafias contadas contra o banco                              |
| A3  | Status texto vence sobre data                        | Dado        | 46 vendas divergentes, 100% concordância com status da unidade |
| B1  | Total ofertado = todas as unidades                   | Métrica     | Nenhum status sinaliza remoção de oferta                       |
| B2  | Velocidade líquida de distrato                       | Métrica     | Consequência de A1                                             |
| B3  | Estouro de custo = soma bruta positiva               | Métrica     | Caso Cume Tower (bruto R$3,1M vs. líquido R$54mil)             |
| B4  | Dedup nome+cidade, confiança por e-mail sintético    | Métrica     | 97 grupos, 89 alta / 8 baixa confiança                         |
| C1  | Guard de disponibilidade via UPDATE...WHERE          | Escrita     | Garantia por construção (lock SQLite)                          |
| C2  | Distrato devolve unidade                             | Escrita     | Espelha C1                                                     |
| C3  | valor_venda livre, não de valor_tabela               | Escrita     | Decisão de modelagem                                           |
| C4  | forma_pagamento enum fechado (3 valores)             | Escrita     | Verificação manual, sem grafia suja                            |
| C5  | cidade obrigatória em cliente novo                   | Escrita     | Dependência da regra B4                                        |
| C6  | Sem checagem de dedup no cadastro                    | Escrita     | Decisão de escopo                                              |
| D1  | 122 unidades presas — bucket separado, não corrigido | Governança  | Contagem contra o banco                                        |
| E1  | Sem RBAC                                             | Autorização | Fora de escopo do enunciado                                    |
