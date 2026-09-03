# realestate-ops-platform

Plataforma operacional interna da **Cambará Empreendimentos**, construída sobre o banco de dados
`cambara_teste_tecnico.db` (SQLite). O objetivo é dar às áreas de diretoria, comercial,
engenharia e financeiro uma visão operacional dos empreendimentos, vendas, unidades e indicadores
financeiros, sem alterar a estrutura ou os dados originais do banco além de exceções explícitas e
documentadas.

Esta sessão cobriu o scaffolding inicial do projeto (Next.js, banco, tema), a autenticação e a
normalização de dado (views + dedup de cliente). As demais features (vendas, distratos,
dashboards por área) ainda não foram implementadas.

## Instalação e execução local

Pré-requisitos: Node.js 22.14+ (piso elevado de 20.9 nesta sessão: `better-sqlite3@13.0.3` inclui
um binário pré-compilado que exige NAPI versão 10, disponível a partir do Node 22.14.0 — versões
anteriores, incluindo toda a série 20.x, sofrem SIGSEGV ao abrir a conexão com o banco; ver
`.github/workflows/ci.yml` para o diagnóstico completo). O arquivo de trabalho
`data/cambara_teste_tecnico.db` (com as 3 views de normalização, ver seção abaixo) já vem
commitado no repositório — não é necessário providenciá-lo separadamente.

```bash
npm install

cp .env.example .env
# Edite .env:
#   DATABASE_PATH   -> data/cambara_teste_tecnico.db (valor padrão, já preenchido)
#   SESSION_SECRET  -> qualquer valor aleatório, ex.: `openssl rand -base64 32`
#   GROQ_API_KEY    -> pode ficar vazio nesta fase (usado só na sessão futura do assistente de LN)

npm run seed   # gera as senhas reais dos 5 usuários (ver seção Autenticação abaixo)
npm run dev    # http://localhost:3000
```

Outros scripts:

```bash
npm run lint           # ESLint (base eslint-config-next)
npm run format          # Prettier --write
npm run format:check    # Prettier --check
npm run build           # build de produção
npm run setup:views     # recria as 3 views de normalização (idempotente, ver abaixo)
```

**Reset a partir da cópia pristina**: `data/cambara_teste_tecnico.pristine.db` (não commitada, só
local) é o banco original sem as views, mantida como rede de segurança. Se precisar resetar o
arquivo de trabalho, copie a pristina por cima de `data/cambara_teste_tecnico.db` e rode
`npm run setup:views` — o script recria as 3 views de normalização (definidas em
`scripts/setup-views.ts`) checando antes se cada uma já existe, sem duplicar nem falhar se rodado
mais de uma vez.

## Autenticação

- **Exceção documentada à regra de "não alterar dado existente"**: os 5 registros de `usuarios`
  tinham o valor placeholder literal `'trocar_no_setup'` em `senha_hash` (confirmado — não é um
  hash real, `LENGTH` = 15 nos 5 registros). O script `npm run seed` sobrescreve esse placeholder
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
- **Limitação deliberada**: autenticação por e-mail/senha com hash `bcrypt` e cookie de sessão
  assinado (HMAC-SHA256 via `node:crypto`, sem dependência nova) — não há OAuth/SSO nem
  revogação de sessão server-side antes da expiração (8h). Aceitável neste escopo: aplicação
  interna, sem dados sensíveis além de id/nome/papel no cookie.
- **Sem RBAC nesta fase**: qualquer usuário autenticado acessa as rotas em `app/(dashboard)/` —
  não há distinção de permissão por `papel` ainda. Isso é deliberado e está fora de escopo desta
  sessão (ver `AGENTS.md`).

## Agentes especialistas

O projeto usa subagentes do Claude Code divididos por domínio — **frontend**, **backend**,
**analista de dados** e **devops** —, definidos em [`.claude/agents/`](.claude/agents/). Cada um
lê o [`AGENTS.md`](AGENTS.md) do projeto antes de agir e permanece dentro do seu domínio; mudanças
que cruzam fronteira entre domínios são sinalizadas para o agente correspondente, não
implementadas fora de escopo. Veja `AGENTS.md` seção 5 para o detalhamento de cada papel.

## Decisões de modelagem e tratamento de dado

Esta seção resume as decisões da sessão de normalização (análise completa do banco). O SQL das
views e a lógica de dedup são definitivos — validados contra `data/cambara_teste_tecnico.db` real.

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
  de venda/distrato (`tests/e2e/vendas.spec.ts`, ver `AGENTS.md` seção 2) ainda não existe nesta
  branch; quando existir, roda via `npx playwright test` isolado, e fica em aberto para decisão
  humana se ele entra no pipeline automatizado ou continua validação ad-hoc de sessão. O step de
  `next build` no CI define `DATABASE_PATH` apontando para o `data/cambara_teste_tecnico.db`
  commitado (necessário porque `lib/db/connection.ts` abre a conexão de forma eager, no import do
  módulo) — não define `SESSION_SECRET`/`GROQ_API_KEY`, confirmado dispensável para o build.
