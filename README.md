# realestate-ops-platform

Plataforma operacional interna da **Cambará Empreendimentos**, construída sobre o banco de dados
`cambara_teste_tecnico.db` (SQLite). O objetivo é dar às áreas de diretoria, comercial,
engenharia e financeiro uma visão operacional dos empreendimentos, vendas, unidades e indicadores
financeiros, sem alterar a estrutura ou os dados originais do banco além de exceções explícitas e
documentadas.

Os 4 componentes obrigatórios do enunciado estão implementados: **autenticação** (login por
e-mail/senha com sessão em cookie assinado — ver seção "Autenticação"), **camada analítica**
(dashboard em `/analitico` respondendo as 4 perguntas de negócio do enunciado — ver seção "Camada
analítica"), **camada de escrita** (fluxo de venda e distrato, o componente mais observado da
avaliação — ver seção "Camada de escrita") e **assistente de linguagem natural** (pergunta em
português sobre os dados via duas chamadas à Groq, texto-para-SQL e SQL-para-resposta — ver seção
"Assistente de linguagem natural"). Esta sessão (5, final) é de revisão e consolidação da
documentação, sem código novo.

## Instalação e execução local

Pré-requisitos: Node.js 22.14+ (piso elevado de 20.9 nesta sessão: `better-sqlite3@13.0.3` inclui
um binário pré-compilado que exige NAPI versão 10, disponível a partir do Node 22.14.0 — versões
anteriores, incluindo toda a série 20.x, sofrem SIGSEGV ao abrir a conexão com o banco; ver
`.github/workflows/ci.yml` para o diagnóstico completo). O arquivo de trabalho
`data/cambara_teste_tecnico.db` (com as 3 views de normalização, ver seção abaixo) já vem
commitado no repositório — não é necessário providenciá-lo separadamente.

```bash
pnpm install

cp .env.example .env
# Edite .env:
#   DATABASE_PATH   -> data/cambara_teste_tecnico.db (valor padrão, já preenchido)
#   SESSION_SECRET  -> qualquer valor aleatório, ex.: `openssl rand -base64 32`
#   GROQ_API_KEY    -> pode ficar vazio nesta fase (usado só na sessão futura do assistente de LN)

pnpm seed   # gera as senhas reais dos 5 usuários (ver seção Autenticação abaixo)
pnpm dev    # http://localhost:3000
```

Outros scripts:

```bash
pnpm lint           # ESLint (base eslint-config-next)
pnpm format          # Prettier --write
pnpm format:check    # Prettier --check
pnpm build           # build de produção
pnpm setup:views     # recria as 3 views de normalização (idempotente, ver abaixo)
pnpm test:e2e        # teste E2E persistido de venda/distrato (ver seção "Camada de escrita")
```

**Reset a partir da cópia pristina**: `data/cambara_teste_tecnico.pristine.db` (não commitada, só
local) é o banco original sem as views, mantida como rede de segurança. Se precisar resetar o
arquivo de trabalho, copie a pristina por cima de `data/cambara_teste_tecnico.db` e rode
`pnpm setup:views` — o script recria as 3 views de normalização (definidas em
`scripts/setup-views.ts`) checando antes se cada uma já existe, sem duplicar nem falhar se rodado
mais de uma vez.

## Autenticação

- **Exceção documentada à regra de "não alterar dado existente"**: os 5 registros de `usuarios`
  tinham o valor placeholder literal `'trocar_no_setup'` em `senha_hash` (confirmado — não é um
  hash real, `LENGTH` = 15 nos 5 registros). O script `pnpm seed` sobrescreve esse placeholder
  por um hash `bcrypt` real, **de forma idempotente**: só atualiza linhas cujo `senha_hash` ainda
  seja exatamente `'trocar_no_setup'`. Essa é uma alteração de **dado**, não de **schema** — não
  há `ALTER TABLE`, índice ou constraint novo — e foi aprovada explicitamente como exceção à regra
  geral (ver `AGENTS.md`, seção 0).
- **Senha padrão para o avaliador logar**: `cambara2026`, igual para os 5 usuários (não é o papel
  de cada um, para evitar senha previsível a partir do e-mail). E-mails disponíveis:
  `diretoria@cambara-teste.com.br`, `comercial@cambara-teste.com.br`,
  `engenharia@cambara-teste.com.br`, `financeiro@cambara-teste.com.br`,
  `candidato@cambara-teste.com.br` (este último com papel `diretoria`, provavelmente a conta mais
  adequada para avaliar a aplicação).
- **Limitações de autenticação (ausência de OAuth/SSO, de revogação de sessão server-side e de
  RBAC)**: descritas em "## Limitações conhecidas" abaixo, junto com as demais limitações
  conhecidas do projeto.
- **Proteção de rota via `getSession()` em `app/(dashboard)/layout.tsx`, não via
  `middleware.ts`/`proxy.ts`**: nesta versão do Next.js (16.3.4), `middleware.ts` está
  **deprecated**, renomeado para `proxy.ts` — e o sucessor já roda no runtime Node.js por padrão
  (não Edge; a opção `runtime` nem existe em arquivos `proxy`, ver
  `node_modules/next/dist/docs/.../proxy.md`). Ou seja, o motivo clássico para evitar
  middleware/proxy em outras versões do Next.js — Edge Runtime não suporta `node:crypto`
  (`createHmac`/`timingSafeEqual`, usados na verificação de assinatura do cookie de sessão) — **não
  se aplica tecnicamente aqui**: um `proxy.ts` neste projeto já rodaria em Node.js sem configuração
  extra. Essa decisão não ficou registrada em nenhum lugar do projeto quando foi tomada (sessão de
  scaffolding da autenticação); a justificativa técnica que se sustenta, verificada nesta auditoria,
  é: Server Components (layouts/páginas) já rodam em Node.js por padrão sem precisar de
  `export const runtime`, então checar a sessão em `(dashboard)/layout.tsx` mantém runtime único e
  consistente com as Route Handlers (que já declaram `nodejs` explicitamente por causa do
  `better-sqlite3`) sem introduzir um arquivo `proxy.ts` extra — a própria documentação do Next.js
  recomenda evitar Proxy "a menos que não haja outra opção".
  - **Garantia de segurança equivalente**: `redirect()` lançado dentro de um Server Component
    "encerra a renderização do route segment em que foi lançado" (comportamento documentado). Como
    `(dashboard)/layout.tsx` é o topo da árvore protegida e o `layout.tsx` raiz não faz streaming
    nem busca de dado antes dele, a função da página filha nunca chega a ser invocada quando a
    sessão é inválida — nenhuma query roda, nenhum byte de conteúdo protegido é serializado antes
    do redirect. A garantia é equivalente à de um middleware/proxy bloqueando a requisição antes do
    roteamento; só o ponto do ciclo de requisição em que acontece é diferente (durante o render RSC,
    não antes do dispatch HTTP).

## Camada de escrita

Route Handlers (não Server Actions — rota inspecionável via `curl`/Postman) para os dois únicos
fluxos de escrita da aplicação: `POST /api/vendas` e `POST /api/distratos`
(`lib/features/vendas/repository.ts`).

- **Garantia de concorrência**: cada escrita roda dentro de `db.transaction()`, mas quem impede a
  venda dupla (ou o distrato duplicado) é o `UPDATE ... WHERE LOWER(TRIM(status)) IN (...)` —
  se `changes === 0`, a transação aborta com um erro de negócio explícito ("Unidade não
  disponível para venda." / "Venda não está ativa."), respondido como HTTP 409, nunca como 500
  genérico. O padrão é o mesmo definido nas instruções do projeto (venda: `INSERT cliente`
  condicional → `UPDATE unidade` → `INSERT venda`; distrato: `UPDATE venda` → `UPDATE unidade`),
  não modificado na implementação.
- **`valor_venda` é campo livre**: negociado no momento da venda, validado via Zod só como número
  positivo — nunca puxado automaticamente de `unidades.valor_tabela`.
- **Sem checagem de duplicidade de cliente no cadastro**: o fluxo de "cliente novo" insere
  livremente. A deduplicação (`lib/features/clientes/dedup.ts`) é responsabilidade exclusiva da
  camada de leitura — a busca de "cliente existente" no formulário reaproveita a mesma
  normalização (`normalizarTexto`), sem `LIKE` em SQL puro, filtrando no cliente o universo
  completo já carregado pelo Server Component.
- **Premissa assumida**: `clientes.cidade` é `NULL`-ável no schema real, mas o formulário de
  cliente novo exige nome e cidade (só `uf`/`email` são opcionais) — a dedup de leitura depende de
  nome+cidade normalizados, então permitir cidade vazia criaria clientes que nunca entram em
  nenhum grupo de dedup por engano do cadastro. Não fechado formalmente no documento de decisões;
  se essa exigência não for a intenção do avaliador, é um ajuste de uma linha em
  `lib/features/vendas/schema.ts`.
- **Não corrige o histórico legado**: as 122 unidades presas em `distrato` no dado legado (ver
  "Limitações conhecidas") não são reclassificadas por este código — a regra só passa a valer
  corretamente para ações novas feitas pela aplicação a partir de agora.
- **Teste E2E persistido**: o fluxo de venda/distrato tem um teste Playwright **commitado** em
  `tests/e2e/vendas-distratos.spec.ts`, por ser o componente mais observado da avaliação. Cobre:
  vender uma unidade disponível com sucesso; tentar vender a mesma unidade de novo e receber erro
  de negócio (409, não sucesso); distratar a venda e confirmar que a unidade volta a `disponivel`.
  **Atualização (sessão 5)**: Playwright passou a ser devDependency real do projeto
  (`@playwright/test@1.62.1`, versão pinada — a mesma usada para validar os 3 cenários), a pedido
  explícito do humano, revertendo a decisão original de mantê-lo como ferramenta de sessão só via
  `npx` (ver `AGENTS.md` seção 2 para o detalhe da mudança). O resto da aplicação continua validado
  via Playwright ad-hoc e descartável (não persistido) — só esse teste é commitado.
  ```bash
  pnpm install                             # já instala o Playwright junto (devDependency)
  npx playwright@1.62.1 install chromium   # uma vez, baixa o browser (não vem no pnpm install)
  pnpm dev                                 # em outro terminal — o teste espera localhost:3000
  pnpm test:e2e                            # roda o teste (equivalente a npx playwright@1.62.1 test tests/e2e/)
  ```
  O teste usa a unidade `id = 4` do banco de trabalho; como o próprio teste distrata a venda que
  cria, ele é seguro para rodar em sequência sem precisar resetar o banco a cada execução.

## Camada analítica

Dashboard em `/analitico` (`app/(dashboard)/analitico/`), Server Component que lê diretamente de
`lib/features/analitico/repository.ts` — sem hook, sem TanStack Query, sem cache — respondendo as
4 perguntas de negócio do enunciado. Mobile-first: filtros e cards empilhados em coluna única no
viewport mobile, layout expandindo a partir de `sm:`/`md:`. Cada seção traz uma nota visível (não
em tooltip) explicando a premissa de tratamento de dado aplicada — ver `docs/regras-de-negocio.md`
para o detalhamento completo de cada regra, com evidência contra o banco real.

O Server Component busca as listas **completas, sem agregação por filtro**; cada seção é um Client
Component que filtra e agrega localmente (`useState`/`useMemo`, sem sincronizar com a URL, sem nova
consulta ao banco por mudança de filtro). Nenhum filtro altera a fórmula de nenhuma métrica — muda
só o subconjunto de linhas exibido. Gráficos usam só bar chart e area chart do catálogo
[shadcn/ui](https://ui.shadcn.com/charts) (`components/ui/chart.tsx`, sobre `recharts`).

- **Velocidade de vendas líquida de distrato** — numerador `status_canonico = 'vendida'`
  (`v_unidades_norm`), denominador todas as unidades do empreendimento. Filtros: cidade/UF/tipo.
  Duas seções de bar chart horizontal, recalculadas sobre o subconjunto filtrado: "3 piores" e "3
  melhores". Sem filtro: Essência Living (6,84%), Atelier Tower (18,82%), Cume Tower (24,66%) nos 3
  piores.
- **Risco de estouro de custo** — direto contra `obra_andamento`, magnitude = soma só dos meses
  com estouro positivo (critério bruto), desvio líquido exposto como referência secundária. Filtros:
  cidade/UF/tipo + período (todo o período / últimos 6, 12 ou 24 meses). Bar chart duplo, top-5 por
  magnitude bruta; Cume Tower (evidência da regra B3) é mantido visível sempre que presente no
  subconjunto filtrado, mesmo fora do top-5 nominal.
- **Duplicidade de cliente** — usa `classificarGruposDedup`; só grupos de alta confiança (e-mail
  sintético `contatoN@exemplo.com`) entram no cálculo "corrigido" de clientes únicos/ticket médio;
  os 8 pares de baixa confiança ficam listados como "requer verificação manual", nunca mesclados.
  Sem filtro (retrato global da base inteira, independente dos filtros das outras 3 perguntas) e
  sem gráfico — stat cards + explicação em prosa do método.
- **Divergência financeira** — direto de `v_financeiro_reconciliado`, stat cards com os totais.
  Seletor de empreendimento local a este gráfico (não afeta as outras 3 perguntas), começa vazio;
  ao selecionar, area chart com `resultado_reportado` e `resultado_recalculado` sobrepostos ao
  longo do tempo — a divergência fica visível onde as duas áreas não coincidem.

**Nota sobre a métrica de dedup**: o número exibido no dashboard (1.440 clientes compradores
únicos / R$ 3.167.271,61 de ticket médio) reflete a política atual (merge só de alta confiança) e
diverge do número histórico da análise original (1.436 / R$ 3.176.094,10, que mesclava alta e
baixa confiança juntas) — divergência esperada por mudança de critério, não um erro de query. Ver
nota completa na regra B4 de `docs/regras-de-negocio.md`.

## Assistente de linguagem natural

Página em `/assistente` (`app/(dashboard)/assistente/`) — pergunta em português sobre os dados,
somente leitura, duas chamadas à API da Groq por pergunta:

1. **Call 1** (`openai/gpt-oss-120b`) — pergunta → SQL, saída forçada em JSON
   (`response_format: {type: "json_object"}`). O prompt de sistema
   (`lib/features/assistente/prompts.ts`) expõe `v_unidades_norm`, `v_vendas_norm` e
   `v_financeiro_reconciliado` (views normalizadas) **e também** as tabelas cruas
   `empreendimentos`, `obra_andamento` e `clientes` — as views só cobrem
   unidades/vendas/financeiro, então perguntas sobre nome/cidade de empreendimento ou estouro de
   custo não têm resposta possível vendo só as 3 views. `unidades`, `vendas` e `financeiro_mensal`
   (tabelas brutas, com grafia suja) ficam de fora do schema exposto — só as views correspondentes.
2. **Execução** contra `lib/db/connection-readonly.ts` — conexão SQLite **separada** da escrita,
   aberta com `{ readonly: true }`. Guardrail extra antes de executar: a consulta precisa começar
   com `SELECT` e não pode conter mais de um comando (`;`) — defesa em profundidade, a proteção
   real é o modo readonly do driver. Se a execução falhar (erro de sintaxe, coluna inexistente), o
   erro é reenviado ao LLM pedindo correção, **1 retry apenas**; se falhar de novo, a resposta ao
   usuário é "não consegui responder com confiança nos dados disponíveis" — nunca uma resposta
   incerta forçada.
3. **Call 2** (`openai/gpt-oss-20b`) — linhas retornadas + pergunta original → resposta em
   português, parafraseando só o que veio da query.

A UI sempre mostra os três juntos: resposta em português, a SQL efetivamente executada (ou a que
falhou, se caiu no caso "não consegui responder"), e a tabela de linhas retornadas.

**Sem view de deduplicação de cliente**: `clientes` entra no schema do prompt sem tratamento — o
prompt de sistema instrui explicitamente que este assistente não tem acesso à lógica de dedup
(`chaveDedup`/`classificarGruposDedup`, TypeScript, ver seção acima). Perguntas sobre
clientes únicos/duplicados geram SQL de contagem bruta, e a resposta em português é instruída a
avisar que esse número não reflete a deduplicação aplicada no dashboard analítico (`/analitico`).

**Troca de modelo em relação ao planejado originalmente**: os nomes registrados nas instruções do
projeto (`llama-3.3-70b-versatile` para a Call 1, `llama-3.1-8b-instant` para a Call 2) foram
desativados pela Groq em 16/08/2026 (confirmado contra `console.groq.com/docs/deprecations` nesta
sessão, 03/09/2026 — já depois do shutdown). Substituídos pelos sucessores recomendados pela
própria Groq: `openai/gpt-oss-120b` (Call 1) e `openai/gpt-oss-20b` (Call 2), ambos com contexto de
131.072 tokens e compatíveis com `response_format: {type: "json_object"}`.

**Teste manual das 4 perguntas de negócio — concluído em 4 rodadas, 2 divergências abertas**:
testado com chave Groq real (detalhamento completo, incluindo SQL gerada e números exatos, em
`docs/log-tecnico-decisoes.md` §11). Resumo:

- **1ª rodada** (fraseado livre): velocidade de vendas e estouro de custo bateram exatamente;
  duplicidade de cliente e divergência financeira bateram na contagem, mas erraram no valor
  agregado — corrigido via 2 instruções genéricas no prompt de sistema (`SYSTEM_PROMPT_SQL`):
  "média por X" sempre `SUM(valor)/COUNT(DISTINCT id_do_X)`, nunca `AVG()`; somas de
  desvio/divergência sempre `SUM(ABS(coluna))`, nunca `SUM(coluna)` puro.
- **2ª rodada** (as 4 perguntas literais do enunciado + variações de fraseado): confirmou as duas
  correções acima generalizando bem — mas expôs 2 divergências novas só com o fraseado literal: (1)
  "unidades vendidas **líquidas de distrato**" fazia o modelo subtrair a contagem de distrato da de
  vendida, quando `status_canonico = 'vendida'` já é líquido por construção da view; (2) "em quantos
  **meses**/empreendimentos isso ocorre" contava meses-calendário distintos (29) em vez de linhas
  divergentes empreendimento×mês (63). Corrigidas via 2 novas instruções genéricas: valores de
  `status_canonico` são mutuamente exclusivos (então "líquido de X" sobre um status-alvo já exclui
  X, sem subtração); "mês" em perguntas sobre `v_financeiro_reconciliado` significa uma linha da
  tabela, não mês-calendário distinto.
- **3ª rodada** (reteste + 2 variações novas de Q1 e Q4, fraseado diferente das rodadas anteriores):
  confirmou as duas correções da 2ª rodada generalizando corretamente (inclusive a pergunta 1
  literal, sem subtração no numerador) — mas expôs uma divergência nova, não corrigida (ver
  "Limitações conhecidas"): fraseados como "descontando os distratos" ou "excluindo as unidades
  distratadas" aplicados à velocidade de vendas fazem o modelo filtrar as unidades em `distrato` do
  **denominador** (total ofertado), violando a regra B1 (total ofertado = todas as unidades, sem
  exclusão por status). Mecanismo diferente do bug corrigido na 2ª rodada (aquele era subtração no
  numerador; este é filtro no denominador) — reproduzido de forma idêntica em 2 fraseados
  independentes.
- **4ª rodada** (revisão humana identificou que o "ticket médio bruto" da pergunta 3 usava
  `COUNT(cliente_id)` sem `DISTINCT` sobre as vendas — matematicamente idêntico a `AVG()`, o mesmo
  bug da 1ª rodada escapando da instrução por não usar o literal `AVG()`): a regra do prompt foi
  reescrita para proibir o padrão semântico ("nunca dividir pelo número de linhas/transações, seja
  via `AVG()`, `COUNT(coluna)` sem `DISTINCT`, ou `COUNT(*)`"), não só a sintaxe. Reteste confirmou
  que esse padrão específico não voltou a aparecer, mas expôs uma variação nova do mesmo tipo de
  erro (ver "Limitações conhecidas"): o denominador passou a usar `COUNT(*)`/`COUNT(DISTINCT ...)`
  sobre a tabela `clientes` inteira (todos os 2.691 cadastrados), não sobre os clientes que
  efetivamente compraram — produzindo ticket médio ~R$1,8M em vez do correto ~R$3,15M. Não é o
  mesmo mecanismo do bug original (que era ausência de `DISTINCT`), é dividir pela população
  errada. Não corrigido nesta sessão — última rodada de validação de prompt planejada para a sessão
  4; tempo restante dedicado à sessão 5.

## Operação/Runbook

**Resetar o banco de trabalho a partir da cópia pristina**: copiar `data/cambara_teste_tecnico.
pristine.db` por cima de `data/cambara_teste_tecnico.db` enquanto `pnpm dev` está rodando faz as
3 views de normalização **sumirem silenciosamente** — a conexão SQLite do servidor mantém o
arquivo em modo WAL aberto, então o `.db` principal nunca recebe o checkpoint das páginas de
`CREATE VIEW`, e o arquivo copiado por cima fica do tamanho da cópia pristina (sem views) mesmo
que `npm run setup:views` pareça ter rodado antes. Sintoma no servidor: `SqliteError: no such
table: v_vendas_norm`. Procedimento correto:

```bash
# 1. Parar qualquer `pnpm dev` em execução (encontrar e matar o processo):
ps aux | grep next-server
kill <pid-do-next-server> <pid-do-processo-pai>

# 2. Copiar a cópia pristina por cima do arquivo de trabalho:
cp data/cambara_teste_tecnico.pristine.db data/cambara_teste_tecnico.db
rm -f data/cambara_teste_tecnico.db-wal data/cambara_teste_tecnico.db-shm

# 3. Recriar as views:
pnpm setup:views

# 4. Forçar o checkpoint do WAL para o arquivo principal (senão o próximo
#    reset ou uma cópia manual do .db perde as views de novo):
node -e "
  const db = require('better-sqlite3')('data/cambara_teste_tecnico.db');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
"

# 5. Confirmar antes de religar o servidor — arquivo principal deve ter
#    716.800 bytes (pristina + views), não 708.608 (pristina sem views):
ls -la data/cambara_teste_tecnico.db

# 6. Só então: pnpm dev
```

Pular o passo 4 antes de apagar/copiar `-wal`/`-shm` de novo é a causa raiz de perder as views
neste fluxo.

## Agentes especialistas

O projeto usa subagentes do Claude Code divididos por domínio — **frontend**, **backend**,
**analista de dados** e **devops** —, definidos em [`.claude/agents/`](.claude/agents/). Cada um
lê o [`AGENTS.md`](AGENTS.md) do projeto antes de agir e permanece dentro do seu domínio; mudanças
que cruzam fronteira entre domínios são sinalizadas para o agente correspondente, não
implementadas fora de escopo. Veja `AGENTS.md` seção 5 para o detalhamento de cada papel.

## Decisões de modelagem e tratamento de dado

Esta seção resume as decisões da sessão de normalização (análise completa do banco). O SQL das
views e a lógica de dedup são definitivos — validados contra `data/cambara_teste_tecnico.db` real.
Ver [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md) para o detalhamento completo de cada
regra (o quê, por quê, como foi validado contra o banco), incluindo as regras de escrita e
governança de dado legado que não cabem neste resumo. Para o histórico técnico completo de
decisões de implementação e correções, ver
[`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md).

- **`v_unidades_norm`** — reduz as grafias inconsistentes de `unidades.status` (ex.:
  `disponivel`/`disponível`) a um `status_canonico` fechado (`vendida`, `disponivel`,
  `reservada`, `distrato`, `nao_mapeado`), unindo `Cancelado` em `distrato` — não existem duas
  categorias de "unidade que saiu da venda" no domínio de negócio.
- **`v_vendas_norm`** — mesma normalização de grafia para `vendas.status_venda`, reduzindo a
  `ativa` / `distrato` / `nao_mapeado`.
- **`v_financeiro_reconciliado`** — recalcula `resultado_recalculado` a partir de
  `receita_reconhecida - custo_incorrido - despesas_corporativas_rat` e expõe `diferenca` +
  flag `divergente` (>R$0,01 de diferença) contra o `resultado_reportado` original, sem alterar
  os valores da tabela-fonte.
- **Dedup de cliente não é uma view SQL** — tentativa anterior estourou o parser do SQLite em CTE
  encadeada. Implementado como função TypeScript (`lib/features/clientes/dedup.ts`), cálculo em
  tempo de leitura, sem materialização em tabela/cache. Critério de agrupamento: nome + cidade
  normalizados (minúsculo, sem acento, espaços colapsados). Um grupo com mais de um cliente é
  classificado como **alta confiança** se pelo menos um membro tem e-mail no padrão
  `contatoN@exemplo.com` (sinal de que o dado é sintético/gerado, não uma coincidência real de
  nome+cidade); caso contrário, **baixa confiança** — nunca fundido automaticamente, sempre
  exposto como "requer verificação manual" na interface (sessão futura).
- **"Total ofertado"** = todas as unidades cadastradas em `unidades`, sem exclusão por status
  (inclui vendidas, disponíveis, reservadas e em distrato) — é o universo de estoque, não o
  estoque disponível.
- **"Magnitude de estouro de custo"** = soma apenas dos meses com `diferenca` positiva (estouro),
  não a soma líquida de todos os meses. Uma soma líquida mascara estouro real quando meses de
  estouro e de folga se cancelam no mesmo empreendimento — caso do **Cume Tower**, onde a
  divergência bruta relevante em meses individuais fica escondida se somada com meses de sinal
  oposto no mesmo período.
- **Fonte de verdade em divergência status × data**: `vendas.status_venda` (texto) vence sobre
  `data_distrato` quando os dois discordam (ex.: status `ativa` com `data_distrato` preenchida, ou
  status `distrato`/`distratada` sem `data_distrato`). Motivo: 46 vendas nessa condição — texto
  como campo de decisão original da operação comercial, data como campo auxiliar mais sujeito a
  erro de preenchimento (ver "Limitações conhecidas").

## Limitações conhecidas

**Nota de calibração de confiança — cobertura de teste do assistente de linguagem natural**: os
testes manuais cobriram aproximadamente 17 fraseados distintos ao longo de 4 rodadas (5 na 1ª
rodada, 8 novos na 2ª, 4 novos na 3ª, mais retestes pontuais na 4ª) — não um levantamento
exaustivo do espaço de fraseado possível para as 4 perguntas de negócio. O padrão observado nas 4
rodadas foi consistente: cada correção de prompt eliminou exatamente o erro que a expôs, mas a
rodada seguinte, testando um fraseado novo da mesma pergunta, expôs uma variação diferente do
mesmo tipo de erro de agregação (rodada 1: `AVG()` direto; rodada 2: subtração indevida no
numerador e contagem de mês-calendário em vez de linha; rodada 3: filtro indevido no denominador;
rodada 4: `COUNT()` sem `DISTINCT` disfarçado, depois divisão pela população errada de clientes).
Isso indica que o espaço de erro de agregação foi reduzido a cada rodada, não esgotado — portanto
perguntas do avaliador com fraseado fora dos ~17 testados aqui carregam risco real de **erro
silencioso de definição** (um número plausível, mas matematicamente errado, sem nenhum sinal
visível de falha na resposta), e não apenas risco de indisponibilidade ou da resposta padrão "não
consegui responder com confiança nos dados disponíveis".

- **Filtro por `modelo_negocio` não implementado no dashboard analítico** — ao contrário de
  `cidade`/`uf`/`tipo` (limpos), `empreendimentos.modelo_negocio` tem 9 grafias brutas para ~3
  categorias reais (mesmo padrão sujo de A1/A2, mas sem view/regra fechada em
  `docs/regras-de-negocio.md` para essa coluna). Parado e perguntado ao humano na sessão de
  filtros/gráficos (04/09/2026, ver `docs/log-tecnico-decisoes.md` seção 13) — decisão explícita:
  excluir esse filtro desta sessão em vez de normalizar sem uma regra fechada. Só cidade/UF/tipo
  estão implementados.
- **Velocidade de vendas não é normalizada por tempo desde o lançamento** — comparar
  empreendimentos pela contagem/ritmo bruto de vendas mistura "vende mal" com "foi lançado há
  pouco tempo". Normalização por `data_lancamento` fica para sessão futura de métricas.
- **122 unidades presas em `distrato`** (`status_canonico` de `v_unidades_norm`) que nunca
  voltaram a `disponivel` no histórico — tratado como bucket separado na view, não reclassificado
  automaticamente. Correção na fonte é proposta pendente de aprovação humana (regra da seção 0 do
  `AGENTS.md`), não aplicada nesta sessão.
- **8 pares de cliente de baixa confiança** (nome + cidade normalizados repetidos, sem e-mail no
  padrão `contatoN@exemplo.com` como sinal discriminante) — exibidos como "requer verificação
  manual" na interface (sessão futura), nunca fundidos automaticamente por `classificarGruposDedup`.
- **5 vendas com `data_distrato` anterior a `data_venda`** — inconsistência de dado não corrigida
  na fonte. Adicionalmente, um subconjunto das vendas com `status_venda = 'ativa'` e
  `data_distrato` preenchida (a mesma divergência de 46 vendas citada acima) tem `data_distrato`
  posterior à data atual do sistema — não é um valor fixo documentado aqui (recalculado a cada
  execução contra a data corrente), e reforça a mesma decisão: `status_venda` como fonte de
  verdade, não a data. Os gaps entre `data_venda` e `data_distrato` nesses casos (~400–445 dias)
  não mostram um outlier isolado óbvio de erro de digitação de ano — é evidência adicional do
  campo de data não ser confiável, não um caso pontual isolado. Nenhuma correção foi feita na
  fonte.
- **Divergência financeira em 63 de 562 meses** (18 de 22 empreendimentos) entre
  `resultado_reportado` e `resultado_recalculado` — sem padrão sistemático identificado (não é
  sempre a favor ou contra a empresa, não concentrado em poucos empreendimentos). Tratado como
  possível erro de lançamento pontual, não como regra de negócio não capturada pela view.
- **CI (`.github/workflows/ci.yml`) ainda não roda testes E2E** — só lint, format check e build,
  conforme escopo do agente devops (`AGENTS.md` seção 5). O teste Playwright persistido do fluxo
  de venda/distrato (`tests/e2e/vendas-distratos.spec.ts`, ver `AGENTS.md` seção 2 e seção "Camada
  de escrita" acima) já existe e passa localmente via `pnpm test:e2e`, mas fica em aberto para
  decisão humana se ele entra no pipeline automatizado ou continua validação ad-hoc de sessão. O
  step de
  `next build` no CI define `DATABASE_PATH` apontando para o `data/cambara_teste_tecnico.db`
  commitado (necessário porque `lib/db/connection.ts` abre a conexão de forma eager, no import do
  módulo) — não define `SESSION_SECRET`/`GROQ_API_KEY`, confirmado dispensável para o build.
- **Limitação deliberada**: autenticação por e-mail/senha com hash `bcrypt` e cookie de sessão
  assinado (HMAC-SHA256 via `node:crypto`, sem dependência nova) — não há OAuth/SSO nem
  revogação de sessão server-side antes da expiração (8h). Aceitável neste escopo: aplicação
  interna, sem dados sensíveis além de id/nome/papel no cookie.
- **Sem RBAC nesta fase**: qualquer usuário autenticado acessa as rotas em `app/(dashboard)/` —
  não há distinção de permissão por `papel` ainda. Isso é deliberado e está fora de escopo desta
  sessão (ver `AGENTS.md`).
- **Assistente: "descontando"/"excluindo" distratos filtra o denominador da velocidade de vendas
  (Bug 6, não corrigido)** — perguntar "Descontando os distratos, quais os 3 empreendimentos com
  pior velocidade de vendas?" ou "Excluindo as unidades distratadas, qual a velocidade de vendas de
  cada empreendimento?" faz o LLM gerar
  `SUM(vendida) / SUM(CASE WHEN status_canonico != 'distrato' THEN 1 ELSE 0 END)` — filtrando as
  unidades em `distrato` do total considerado (denominador), em vez de usar todas as unidades como
  a regra B1 (`docs/regras-de-negocio.md`) exige ("total ofertado" = todas as unidades cadastradas,
  sem exclusão por status). Produz velocidade maior que a correta (ex.: Essência Living 7,03% em
  vez de 6,84%). Reproduzido de forma idêntica nos dois fraseados testados — não é acaso isolado.
  Mecanismo diferente de um bug já corrigido nesta sessão (aquele subtraía no numerador quando a
  pergunta usava "líquido de X"; este filtra o denominador quando a pergunta usa
  "descontando"/"excluindo"). Detalhe completo, incluindo a SQL gerada e a validação contra o
  banco, em `docs/log-tecnico-decisoes.md` §11. Decisão de correção pendente — não ajustado
  silenciosamente, para não consumir mais tempo de correção sem teste automatizado por trás antes
  do prazo de 04/09.
- **Assistente: "ticket médio" pode dividir pelo total de clientes cadastrados, não pelos que
  compraram (não corrigido)** — na pergunta 3 literal do enunciado, a rodada final gerou
  `SUM(valor_venda) / COUNT(*) FROM clientes` (2.691, todos os cadastrados) em vez de
  `SUM(valor_venda) / COUNT(DISTINCT cliente_id)` sobre as vendas (1.535, só quem comprou) —
  produzindo ticket médio ≈R$1,80M em vez do correto ≈R$3,15M. **Nota sobre o 1.535 vs. o 1.440 da
  seção "Camada analítica"**: não é inconsistência, são dois universos diferentes por dois
  critérios independentes — confirmado contra o banco nesta sessão. 1.535 é
  `COUNT(DISTINCT cliente_id)` bruto sobre **todas** as linhas de `v_vendas_norm` (`ativa` **e**
  `distrato`), sem nenhuma fusão de duplicata; 1.440 filtra só `status_canonico = 'ativa'` **e**
  aplica a fusão de dedup de alta confiança do dashboard (89 grupos). Isso veio depois de uma correção
  nesta mesma sessão que eliminou uma forma anterior do mesmo tipo de erro (dividir por
  `COUNT(coluna)` sem `DISTINCT` sobre a tabela de vendas, matematicamente igual a `AVG()`) — a
  correção funcionou para esse padrão específico, mas o modelo encontrou uma variação nova:
  `COUNT(*)`/`COUNT(DISTINCT ...)` sobre a população errada (todos os clientes cadastrados, não os
  compradores). SQL exata e validação contra o banco em `docs/log-tecnico-decisoes.md` §11. Não
  corrigido — esta foi a última rodada de ajuste de prompt planejada para a sessão 4.
- **Assistente: aviso de dedup depende do julgamento do LLM, não de checagem no código** — o
  prompt de sistema da Call 2 instrui a avisar quando a pergunta é sobre clientes
  únicos/duplicados, mas nada no código força esse aviso (não há detecção de palavra-chave do lado
  da aplicação) — se o LLM não seguir a instrução, o aviso pode não aparecer numa resposta
  específica. Decisão consciente: mover essa checagem para o código exigiria replicar heurística de
  classificação de pergunta fora do LLM, o que não estava no escopo desta sessão. Confirmado
  presente na resposta testada na 1ª rodada (§11); não reverificado explicitamente nas rodadas 2-4,
  que focaram noutros aspectos da pergunta (correção de bugs de agregação, não do aviso em si) —
  não é uma garantia estrutural.
- **Assistente: retry após rate limit (429) não usa backoff** — o guardrail de 1 retry tenta de
  novo imediatamente após qualquer falha, incluindo 429; sem espera entre tentativas, o retry após
  rate limit tende a falhar de novo pelo mesmo motivo. A mensagem ao usuário nesse caso já é
  diferenciada ("muitas perguntas em sequência..."), mas o comportamento de retry em si não foi
  alterado — fora do escopo da correção desta sessão.
