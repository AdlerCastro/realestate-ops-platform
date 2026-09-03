<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# realestate-ops-platform — AGENTS.md

Regras de desenvolvimento assistido por Claude Code para este projeto. Este arquivo é lido no
início de toda sessão. As decisões de produto/arquitetura vivem em
`realestate-ops-platform-instrucoes.md` (ou equivalente na raiz do projeto) — este arquivo aqui
é sobre **como trabalhar**, não sobre **o que foi decidido**. Em caso de dúvida sobre uma decisão
de negócio, consulte aquele arquivo antes de assumir.

## 0. Regra que precede todas as outras

**Nenhuma alteração de dado ou schema em `cambara_teste_tecnico.db` entra em código sem
aprovação explícita do humano na conversa**, mesmo que pareça óbvia, pequena ou de baixo risco.
Isso inclui `ALTER TABLE`, criação de tabela nova, índice, constraint, e qualquer `UPDATE`/`DELETE`
contra dado pré-existente fora do fluxo normal de escrita da aplicação (venda/distrato). Se uma
tarefa parecer exigir isso, pare e pergunte antes de escrever a query — não decida por conta
própria que "é óbvio que pode".

---

## 1. Padronização de código

- **Prettier** — formatação automática, sem exceção de estilo pessoal. Rodar antes de qualquer
  commit. Configuração fica em `.prettierrc`, criada na sessão de scaffolding.
- **ESLint** — usar a configuração padrão do Next.js (`next lint`) como base; qualquer regra
  extra deve ser justificada em comentário no próprio arquivo de config, não adicionada em
  silêncio.
- Ambos entram como **devDependency real** do projeto (assim como o Playwright — ver seção 2) e
  devem rodar como parte do fluxo de CI (ver seção 5).
- Nenhum código é considerado "pronto" numa sessão sem passar por `prettier --check` e
  `next lint` sem erros.

---

## 2. Validação de features com Playwright

**Atualização (sessão 5, 03/09/2026)**: Playwright passou a ser **devDependency real** do
projeto (`@playwright/test@1.62.1`, versão pinada — a mesma usada para validar o teste E2E
persistido), a pedido explícito do humano na conversa, revertendo a decisão original desta seção
("ferramenta de sessão, não dependência"). **Motivo**: conveniência de rodar o teste E2E sob
demanda via script (`pnpm test:e2e`) sem depender do `npx` resolver a versão do pacote a cada
chamada — não uma mudança de escopo (E2E continua fora do CI, ver abaixo). O motivo original desta
seção (evitar inflar `node_modules`/CI com uma dependência usada só ad-hoc) deixou de valer por
essa decisão consciente, não por engano — este parágrafo substitui a versão anterior da regra; não
tratar como contradição a corrigir.

Continua **fora do pipeline de CI padrão** (ver seção 5 e `.claude/agents/devops.md`) — instalar
como devDependency resolve só a fricção de rodar localmente (sem precisar do `npx` buscar a
versão a cada chamada), não muda a decisão de não rodar E2E automaticamente em CI.

Checklist de validação por feature (rodar antes de considerar a sessão concluída):

- **Responsividade mobile-first**: testar primeiro no viewport mobile (base do design, ver
  seção 3), depois validar que breakpoints maiores (`md:`, `lg:`) não quebram o layout.
- **Acessibilidade básica**: labels associados a inputs, contraste mínimo do tema customizado,
  navegação por teclado nos formulários (login, venda, distrato).
- **Padrões de design**: componentes usando o tema customizado do shadcn/ui (não o default),
  espaçamento e tipografia consistentes com o restante da aplicação.

Essa validação ad-hoc continua não persistida (roda via `npx playwright test <caminho-temporário>`
ou `pnpm exec playwright test <caminho-temporário>`, spec descartado ao fim da sessão) — a
instalação como devDependency não muda isso, só evita repetir o download do binário do Playwright
a cada chamada.

**Exceção documentada**: o fluxo de venda/distrato (camada de escrita, componente mais observado
da avaliação) recebe um teste Playwright **persistido e commitado**
(`tests/e2e/vendas-distratos.spec.ts`) — não descartável ao fim da sessão. Roda via
`pnpm test:e2e` (script em `package.json`, equivalente a
`npx playwright@1.62.1 test tests/e2e/`) ou diretamente via `npx playwright@1.62.1 test
tests/e2e/`. Ver README, seção "Camada de escrita", para o passo a passo completo (instalar o
browser Chromium é um passo único separado).

---

## 3. Mobile First (decisão de produto, não só de CSS)

Mobile first é uma decisão real de uso, não só convenção técnica. Consequências práticas:

- Classes Tailwind sem prefixo = estilo base mobile; breakpoints (`md:`, `lg:`, `xl:`) sempre
  aumentam a partir daí, nunca o inverso.
- Todo componente novo (dashboards, formulários, tabelas) é desenhado e testado primeiro no
  viewport mobile, depois adaptado para telas maiores — não o caminho inverso.
- Tabelas de dado denso (ex.: lista de unidades, vendas) precisam de uma estratégia mobile
  explícita (scroll horizontal controlado, cards empilhados, ou colunas priorizadas) — "encolher
  a tabela até caber" não é uma solução aceitável.
- Validado via Playwright conforme checklist da seção 2.

---

## 4. Revisão de regras de negócio antes de implementar

Antes de qualquer sessão que envolva lógica de negócio (normalização de status, cálculo de
métrica, regra de venda/distrato), o agente deve:

1. Checar o documento de decisões/instruções do projeto para a regra relevante.
2. Se a regra não estiver fechada (ex.: itens da seção "pendente de verificação contra o banco
   real"), **não assumir uma interpretação razoável e seguir em frente** — sinalizar a
   ambiguidade e perguntar, ou implementar a versão mais conservadora e marcar explicitamente
   como premissa assumida, documentada no README.
3. Contradições entre o que está sendo pedido na sessão e o que já foi travado devem ser
   apontadas antes de escrever código, não depois.

---

## 5. Agentes especialistas

Divisão de responsabilidade por frente, implementada como subagentes do Claude Code
(`.claude/agents/*.md`), cada um limitado ao seu domínio:

- **frontend** — componentes React/shadcn, hooks customizados (padrão "MVVM" do projeto),
  Tailwind mobile-first, TanStack Query no client. Não escreve query SQL diretamente.
- **backend** — Route Handlers, camada `lib/db`, transações `better-sqlite3`, validação Zod
  compartilhada, autenticação/sessão. Inclui infraestrutura local (variáveis de ambiente, script
  de seed) — não inclui pipeline de CI (ver devops).
- **analista de dados** — views de normalização, definição de métricas de negócio (velocidade de
  vendas, estouro de custo, deduplicação de cliente), validação de premissas contra o banco real.
  Único agente autorizado a propor SQL de exploração/normalização — mas mesmo esse não altera
  dado ou schema sem aprovação (regra da seção 0 vale para todos, sem exceção por papel).
- **devops** — CI apenas (lint, format check, build check em pipeline automatizado a cada push).
  Não inclui deploy/CD — isso segue fora de escopo conforme decisão de produto, a menos que essa
  decisão seja revertida explicitamente.

Cada agente deve ler este `AGENTS.md` e o documento de decisões antes de agir, e permanecer
dentro do seu domínio — mudanças que cruzam fronteira (ex.: frontend precisando de uma rota nova)
são sinalizadas para o agente correspondente, não implementadas fora do domínio.

---

## 6. Documentação e auditoria

"Auditoria" neste projeto significa **documentação de decisões**, não um mecanismo de log dentro
da aplicação (isso foi decidido explicitamente — não criar tabela de audit log, não adicionar
colunas `created_by`/`created_at` a tabelas existentes, pois isso seria alteração de schema
sujeita à regra da seção 0).

A cada sessão do Claude Code que implemente uma feature (não sessões de discussão), atualizar:

1. O documento de decisões do projeto — nova entrada descrevendo o que foi implementado, quais
   premissas foram assumidas (especialmente para itens que estavam "pendentes de verificação
   contra o banco real"), e quaisquer desvios do plano original com justificativa.
2. O README — seção de decisões de modelagem/tratamento de dado, se a sessão tocou nisso; seção
   de limitações conhecidas, se alguma limitação nova foi introduzida.

Este passo é parte da definição de "sessão concluída" — uma feature implementada sem a
documentação correspondente atualizada é considerada incompleta.
