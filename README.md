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
"Assistente de linguagem natural").

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
  `middleware.ts`/`proxy.ts`**: decisão técnica fundamentada (Edge Runtime vs. Node.js,
  `node:crypto`, garantia de segurança equivalente a um proxy) — ver
  [`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seção 6 ("Autenticação").

## Camada de escrita

Route Handlers (não Server Actions — rota inspecionável via `curl`/Postman) para os dois únicos
fluxos de escrita da aplicação: `POST /api/vendas` e `POST /api/distratos`
(`lib/features/vendas/repository.ts`).

- **Garantia de concorrência**: o `UPDATE ... WHERE LOWER(TRIM(status)) IN (...)` (não um
  `SELECT` prévio) é quem impede venda dupla/distrato duplicado; erro de negócio responde HTTP
  409, nunca 500. Padrão completo, com o código exato, em
  [`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seção 5.
- **`valor_venda` é campo livre**: negociado no momento da venda, validado via Zod só como número
  positivo — nunca puxado automaticamente de `unidades.valor_tabela`.
- **Aviso não-bloqueante de duplicidade no cadastro de cliente novo** (regra C6, revertida em
  04/09/2026): ao submeter "Cliente novo" com nome+cidade que já existem, um aviso inline oferece
  "usar este cliente" ou "cadastrar mesmo assim" — nunca bloqueia. Checagem só no client, backend
  sem alteração. Regra completa (o quê, por quê, antes/depois) em
  [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md), C6; implementação e teste manual em
  [`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seção 14.
- **`cidade` obrigatória no cadastro de cliente novo** (regra C5): `clientes.cidade` é `NULL`-ável
  no schema, mas o formulário exige preenchimento — a dedup (regra B4) depende de nome+cidade, e
  cidade vazia quebraria a classificação de confiança. Decisão travada, ver
  [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md), C5.
- **`perfil` obrigatório no cadastro de cliente novo** (regra C7): mesmo trade-off da `cidade`
  acima — enum fechado (`Morador`/`Investidor`/`Institucional`), confirmado contra o banco antes de
  fixar. Ver [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md), C7, e
  [`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seção 16.
- **Não corrige o histórico legado**: as 122 unidades presas em `distrato` no dado legado (ver
  "Limitações conhecidas") não são reclassificadas por este código — a regra só passa a valer
  corretamente para ações novas feitas pela aplicação a partir de agora.
- **Teste E2E persistido**: o fluxo de venda/distrato tem um teste Playwright **commitado** em
  `tests/e2e/vendas-distratos.spec.ts`, por ser o componente mais observado da avaliação. Cobre:
  vender uma unidade disponível com sucesso; tentar vender a mesma unidade de novo e receber erro
  de negócio (409, não sucesso); distratar a venda e confirmar que a unidade volta a `disponivel`.
  Playwright é devDependency real do projeto (`@playwright/test@1.62.1`, versão pinada) — histórico
  da decisão em [`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seção 12. O resto da
  aplicação continua validado via Playwright ad-hoc e descartável — só esse teste é commitado.
  ```bash
  pnpm install                             # já instala o Playwright junto (devDependency)
  npx playwright@1.62.1 install chromium   # uma vez, baixa o browser (não vem no pnpm install)
  pnpm dev                                 # em outro terminal — o teste espera localhost:3000
  pnpm test:e2e                            # roda o teste (equivalente a npx playwright@1.62.1 test tests/e2e/)
  ```
  O teste usa a unidade `id = 4` do banco de trabalho; como o próprio teste distrata a venda que
  cria, ele é seguro para rodar em sequência sem precisar resetar o banco a cada execução.
- **Toasts de confirmação** (`components/ui/sonner.tsx`, componente shadcn/ui `sonner`, montado em
  `app/layout.tsx`): venda registrada e distrato registrado disparam toast de sucesso; erros de
  negócio (409 — unidade indisponível, venda não ativa) disparam toast de erro reaproveitando a
  mensagem já retornada pelo backend, não uma mensagem genérica nova.

### `/vendas` — gráficos, tabs, busca/filtros e tabela de unidades

`/vendas` (`app/(dashboard)/vendas/`) é o dashboard completo da tela de vendas, lido via Server
Component (`listarVendasParaListagem`/`v_vendas_norm`, `contarUnidadesPorStatus`,
`listarUnidadesParaListagem`/`v_unidades_norm`, todas sem filtro de status — o filtro é
client-side). O que existe hoje na tela:

- **Dois donuts** no topo: vendas ativas vs. distratadas, e unidades por status (4 fatias) — sobre
  o universo completo, sem reagir a busca/filtro.
- **Duas tabelas de vendas** ("Vendas ativas", com ação Distratar, e "Vendas distratadas")
  organizadas em `Tabs` (shadcn/ui), altura fixa com scroll interno, mobile-first.
- **Busca e filtros 100% client-side**, combináveis em AND, sem round-trip ao servidor: cliente OU
  unidade, forma de pagamento (enum C4), intervalo de data de venda (ambas as tabelas) e de
  distrato (só distratadas). Mesmo padrão de busca em `/vendas/novo` (unidade por identificador ou
  empreendimento).
- **Tabela de unidades** (somente leitura, abaixo das tabs): as 3.300 unidades, filtro por
  `status_canonico` + busca por identificador, client-side.
- Coluna "Unidade" sempre `{empreendimento} — {identificador}` (nunca isolado —
  `unidades.identificador` não é único globalmente, ver `docs/log-tecnico-decisoes.md` seção 5).
- **Campo "Perfil" obrigatório** no cadastro de "Cliente novo" — enum fechado
  (`Morador`/`Investidor`/`Institucional`, regra C7 de `docs/regras-de-negocio.md`), confirmado
  contra o banco antes de fixar. Fluxo "Cliente existente" não é afetado.

Detalhamento técnico completo desta tela — dependências novas, o bug de renderização do
`recharts@3.8.0` e sua correção, a decisão do `data-testid` por tabela, a paleta de cores dos
gráficos — em [`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seções 15 e 16.

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

Página em `/assistente` (`app/(dashboard)/assistente/`) — pergunta em português sobre os dados
(texto-para-SQL, não RAG), somente leitura, duas chamadas à API da Groq por pergunta:

1. **Call 1** (`openai/gpt-oss-120b`) — pergunta → SQL, saída forçada em JSON. Schema exposto: as 3
   views normalizadas + `empreendimentos`/`obra_andamento`/`clientes` (tabelas cruas, para cobrir o
   que as views não alcançam — nome/cidade de empreendimento, estouro de custo). Justificativa
   completa e a nota de que `clientes` entra sem a lógica de dedup em
   [`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seção 11.
2. **Execução** — conexão SQLite separada, somente leitura (`lib/db/connection-readonly.ts`).
   Guardrails (SQL precisa ser um único `SELECT`, 1 retry se falhar, fallback "não consegui
   responder com confiança nos dados disponíveis") detalhados na mesma seção 11.
3. **Call 2** (`openai/gpt-oss-20b`) — linhas retornadas + pergunta original → resposta em
   português.

A UI sempre mostra os três juntos: resposta em português, a SQL executada (ou a que falhou), e a
tabela de linhas retornadas.

**Troca de modelo em relação ao planejado originalmente**: os modelos definidos antes desta sessão
foram desativados pela Groq (16/08/2026) e substituídos pelos acima — data exata e nomes antigos em
[`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seção 11.

**Teste manual das 4 perguntas de negócio — concluído em 4 rodadas**: testado com chave Groq real
contra as 4 perguntas literais do enunciado mais variações de fraseado. Cada rodada corrigiu, via
instrução genérica no prompt de sistema (`SYSTEM_PROMPT_SQL`), o erro de agregação exposto pela
rodada anterior (`AVG()` em vez de média por cliente, subtração indevida em "líquido de X",
contagem de mês-calendário em vez de linha) — mas 2 divergências seguem abertas, sem correção (ver
"Limitações conhecidas" abaixo). Detalhamento completo — SQL gerada, números exatos, rodada a
rodada — em [`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seção 11.

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

- **`v_unidades_norm`** — normaliza `unidades.status` (11 grafias) em `status_canonico`
  (`vendida`/`disponivel`/`reservada`/`distrato`), unindo `Cancelado` em `distrato`.
- **`v_vendas_norm`** — normaliza `vendas.status_venda` (6 grafias) em `status_canonico`
  (`ativa`/`distrato`).
- **`v_financeiro_reconciliado`** — expõe `resultado_recalculado`, `diferenca` e a flag
  `divergente` frente ao `resultado_reportado` original.
- **Dedup de cliente** — função TypeScript (`lib/features/clientes/dedup.ts`, não view SQL),
  agrupamento por nome+cidade normalizados, alta/baixa confiança conforme sinal de e-mail
  sintético.
- **"Total ofertado"** = todas as unidades cadastradas, sem exclusão por status.
- **"Magnitude de estouro de custo"** = soma só dos meses com estouro positivo (critério bruto),
  não a soma líquida.
- **Fonte de verdade status × data** — `vendas.status_venda` (texto) vence sobre `data_distrato`
  quando os dois discordam.

## Limitações conhecidas

- **Página inicial (`/`) sem conteúdo próprio — redireciona para `/analitico`** (sessão 10,
  04/09/2026): `app/(dashboard)/page.tsx` faz só `redirect("/analitico")`, e o link "Cambará" da
  navbar aponta direto para `/analitico` para evitar o hop extra. O redirecionamento
  `router.push("/")` após login (`lib/features/auth/hooks/use-login.ts`) não foi ajustado — ainda
  funciona (passa pelo redirect), só não evita o hop, por estar fora do escopo de autenticação
  desta sessão.
- **Filtros de intervalo de data em `/vendas` (`<input type="date">` nativo) podem exibir
  `mm/dd/yyyy` no calendário, dependendo do idioma do navegador/SO** — o formato de exibição do
  picker nativo é controlado pelo locale do navegador/SO, não pelo `lang` da página nem por
  CSS/JS. `<html lang="pt-BR">` já está definido em `app/layout.tsx` desde o scaffolding, mas
  testado nesta sessão (04/09/2026) contra um Chrome com UI em inglês: o picker continuou
  mostrando `mm/dd/yyyy` mesmo com `lang="pt-BR"` — confirma que não há garantia universal, só uma
  influência parcial dependente do ambiente. Nenhum texto formatado manualmente precisou de
  correção (os campos de filtro não exibem o valor como texto em nenhum outro lugar da tela); a
  coluna "Data" das tabelas de vendas já usa `toLocaleDateString('pt-BR')` (dd/mm/yyyy)
  corretamente, sem relação com esse widget.

**Nota de calibração de confiança**: a cobertura de teste do assistente (~17 fraseados em 4
rodadas) não é exaustiva — fraseado fora do testado carrega risco real de erro silencioso de
definição, não só indisponibilidade. Detalhe completo em
[`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seção 11.

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
- **Assistente: "ticket médio" pode recorrer, num valor de CONTRASTE dentro da mesma resposta, ao
  padrão do bug 1 (`COUNT` sem `DISTINCT` sobre a tabela de vendas, equivalente a `AVG`) —
  corrigido para o valor principal, não corrigido para esse contexto secundário** — sessão 12
  (`docs/log-tecnico-decisoes.md`, seção 19) corrigiu dois bugs de agregação do assistente
  ("descontando"/"excluindo" distratos filtrando o denominador de velocidade de vendas, e ticket
  médio dividindo pela população errada — todos os clientes cadastrados em vez de só quem
  comprou), ambos validados sem regressão. Durante a validação, apareceu uma variação nova do
  mesmo padrão do bug 1: ao responder "como isso distorceria o ticket médio se não fosse tratado",
  o modelo às vezes calcula o valor de contraste "sem dedup" como
  `SUM(valor_venda) / COUNT(cliente_id)` sem `DISTINCT` (população = número de vendas, não de
  clientes) em vez de manter `COUNT(DISTINCT cliente_id)` variando só como o id é agrupado — o
  valor PRINCIPAL do ticket médio continua correto (~R$3,15M), só esse contraste secundário pode
  sair errado. Não corrigido nesta sessão (decisão explícita: não tentar uma 3ª instrução de prompt
  para "consertar de vez" sem teste automatizado por trás). Detalhe completo em
  [`docs/log-tecnico-decisoes.md`](docs/log-tecnico-decisoes.md), seções 11 e 19.
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
