# realestate-ops-platform

Plataforma operacional interna da **Cambará Empreendimentos**, construída sobre o banco de dados
`cambara_teste_tecnico.db` (SQLite). O objetivo é dar às áreas de diretoria, comercial,
engenharia e financeiro uma visão operacional dos empreendimentos, vendas, unidades e indicadores
financeiros, sem alterar a estrutura ou os dados originais do banco além de exceções explícitas e
documentadas.

Esta sessão cobriu o scaffolding inicial do projeto (Next.js, banco, tema) e a autenticação. As
demais features (vendas, distratos, dashboards por área) ainda não foram implementadas.

## Instalação e execução local

Pré-requisitos: Node.js 20.9+ e o arquivo `cambara_teste_tecnico.db` disponível localmente (não
incluso no repositório).

```bash
npm install

cp .env.example .env
# Edite .env:
#   DATABASE_PATH   -> caminho para cambara_teste_tecnico.db
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
```

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

> **Pendente** — depende da análise completa do banco (`unidades`, `vendas`, `clientes`,
> `obra_andamento`, `financeiro_mensal`), que está em andamento em paralelo a esta sessão. Esta
> seção será preenchida na sessão de exploração/normalização, incluindo padronização de valores
> (`status_venda`, `status` de unidades, `modelo_negocio`), cálculo de risco de estouro de custo e
> validação de consistência de `financeiro_mensal`.

## Limitações conhecidas

> **Pendente** — mesma nota acima: limitações relativas a regras de negócio e tratamento de dado
> só serão documentadas depois da análise completa do banco. As limitações já conhecidas desta
> sessão (autenticação/infra) estão descritas na seção "Autenticação" acima.
