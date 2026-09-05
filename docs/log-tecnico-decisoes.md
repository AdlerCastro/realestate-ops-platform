# realestate-ops-platform — Log Técnico de Decisões

Este documento é o registro técnico de decisões de arquitetura e regra de implementação do
projeto — schema real do banco, views de normalização, padrão de escrita, stack, e o histórico de
correções feitas ao longo do desenvolvimento. É complementar a dois outros documentos, cada um com
escopo diferente:

- **`docs/regras-de-negocio.md`** — a fonte primária para regra de negócio (o quê foi decidido e
  por quê, com evidência). Consulte lá primeiro para qualquer dúvida de regra de negócio.
- **`README.md`** — visão geral do projeto, instalação, e resumo das decisões para quem só quer
  rodar a aplicação.

Este documento aqui é o nível mais granular: decisões técnicas de implementação, correções de
schema, e o histórico de bugs/achados que moldaram o código atual — útil para quem for dar
manutenção ou estender o projeto depois da entrega.

Este arquivo é versionado no Git (`docs/log-tecnico-decisoes.md`) — qualquer sessão de trabalho
futura, humana ou assistida por IA, deve conseguir ler o estado atual do projeto inteiramente a
partir dos arquivos do repositório (este documento incluído), sem depender de contexto de conversa
externo ao repositório.

---

## 1. O que é o projeto

Teste técnico da Cambará Empreendimentos S.A. (incorporadora fictícia) para a vaga de Analista de
Soluções de Negócio (Full Stack). Entrega de uma aplicação completa — não um painel — com quatro
componentes obrigatórios: autenticação, camada analítica (leitura), camada de escrita (venda e
distrato) e assistente de linguagem natural sobre os dados.

- **Repositório:** `realestate-ops-platform`.
- **Prazo:** entrega 04/09, apresentação 08/09.
- **Componente mais observado na avaliação:** camada de escrita (venda/distrato). Não é opcional.

---

## 2. Arquivo de banco — posicionamento e regra de alteração

- **Arquivo de trabalho**: `data/cambara_teste_tecnico.db` — commitado no Git (facilita rodar
  para o avaliador sem passo manual extra). É o arquivo que a aplicação lê e escreve, incluindo
  as 3 views de normalização criadas nele (ver seção 4).
- **Cópia pristina**: `data/cambara_teste_tecnico.pristine.db` — sem views, sem escrita alguma da
  aplicação, mantida **fora do Git** (`.gitignore`). Rede de segurança para resetar o estado do
  arquivo de trabalho antes da apresentação, caso algum teste da camada de escrita suje o dado de
  forma indesejada. **Procedimento de reset** (achado durante a sessão de escrita — resetar com o
  servidor rodando corrompe silenciosamente o resultado): parar `pnpm dev`, remover
  `data/cambara_teste_tecnico.db-wal` e `-shm`, copiar a pristina por cima do arquivo de trabalho,
  rodar `pnpm setup:views`, e forçar um checkpoint de WAL antes de subir o servidor de novo.
  Procedimento completo documentado no README, seção "Operação/Runbook".
- **Regra permanente**: qualquer alteração de **dado ou schema** no arquivo de trabalho fora do
  fluxo normal da aplicação (venda/distrato pela própria interface) exige pergunta explícita
  antes de ser implementada — mesmo que pareça óbvia, pequena ou de baixo risco. Isso inclui
  `ALTER TABLE`, `CREATE VIEW` novo não previsto neste documento, ou qualquer `UPDATE`/`DELETE`
  fora do fluxo de escrita da aplicação.
- **Já aprovado e aplicado**: as 3 `CREATE VIEW` da seção 4; sobrescrever `senha_hash`
  (placeholder `'trocar_no_setup'`) por hash bcrypt real via seed script.

### Organização de documentação no repositório

- **`docs/`** (commitado): `regras-de-negocio.md`, este arquivo (`log-tecnico-decisoes.md`) —
  documentação durável, entregável do teste.
- **`refs/`** (gitignored, mantido localmente): material de análise bruta/rascunho
  (`analise-banco-consolidada.md`) — referência de trabalho, não entregável, mas acessível
  normalmente por qualquer sessão de desenvolvimento rodando localmente (`.gitignore` só impede o
  Git de rastrear a pasta, não impede leitura local).
- **`.claude/settings.json`** (commitado): `{"permissions": {"additionalDirectories": []}}` —
  garante que sessões de desenvolvimento assistido não acessem diretórios fora da raiz do
  repositório. Fixa um incidente anterior em que um documento de trabalho foi editado fora do
  projeto por engano.

---

## 3. Stack e arquitetura (travado)

- **Next.js (App Router) + TypeScript**, monólito — front e back no mesmo processo, sem CORS.
- **Node.js 22+** (`.nvmrc` na raiz do projeto) — requisito real, não arbitrário:
  `better-sqlite3@13.0.3` compila com `NAPI_VERSION 10`, disponível só a partir do Node 22. Rodar
  em Node 20 causa `SIGSEGV` no primeiro `new Database(...)` (crash silencioso de incompatibilidade
  de ABI nativa, não um erro de import) — diagnosticado via reprodução isolada e stack trace `gdb`
  durante a investigação de uma falha de CI. Este é o piso mínimo em qualquer ambiente, incluindo
  a máquina de quem for rodar o projeto.
- **pnpm** (não npm/yarn). `pnpm-lock.yaml` é o lockfile oficial. **Cuidado conhecido**: pnpm
  bloqueia scripts de build nativos (postinstall) por padrão — funciona sem ajuste extra para
  `better-sqlite3` porque o pacote inclui binário pré-compilado no tarball, mas qualquer
  dependência nativa futura sem prebuild vai quebrar silenciosamente até rodar
  `pnpm approve-builds` manualmente.
- **better-sqlite3**, driver síncrono, conexão singleton via `globalThis`, `export const runtime
= 'nodejs'` obrigatório em toda rota que toca o banco.
- **bcryptjs** (não `bcrypt` nativo).
- **Prettier + ESLint** como devDependencies reais, `eslint-config-prettier` ativo por último na
  cadeia de config para evitar conflito de regra estilística.
- **Playwright** (`@playwright/test@1.62.1`, versão pinada) — **devDependency real do projeto desde
  a sessão 5** (03/09/2026, ver seção 12 abaixo; decisão original era "ferramenta de sessão, não
  devDependency", revertida a pedido explícito do humano). Usado para validar
  responsividade/acessibilidade a cada feature (ad-hoc, não persistido) — exceção: o fluxo de
  venda/distrato recebe teste E2E persistido e commitado (`tests/e2e/vendas-distratos.spec.ts`,
  script `pnpm test:e2e`), dado ser o componente mais observado da avaliação.
- Estrutura por feature (`vendas/`, `unidades/`, `clientes/`, `financeiro/`, `auth/`, `analitico/`),
  tanto em `app/` quanto em `lib/`.
- UI: shadcn/ui + Tailwind, tema customizado (grafite + dourado). **Mobile first** genuíno —
  classes sem prefixo = base mobile, breakpoints (`md:`, `lg:`) sempre aumentando a partir daí.
  Exceção pontual: `<select>` nativo no formulário de venda em vez de componente shadcn, por
  oferecer melhor picker em mobile — desvio consciente da convenção geral de componente, aprovado
  retroativamente.
- Padrão declarado como "MVVM" via hooks customizados — nome aproximado, React não tem data
  binding bidirecional nativo; decisão documentada conscientemente.
- Estado de servidor: TanStack Query. Validação: Zod, compartilhado entre client e Route Handler.
- Leitura (dashboards): Server Components lendo o banco direto, sem round-trip HTTP.
- Escrita: Route Handlers explícitos (não Server Actions) — rota inspecionável via
  `curl`/Postman. Erros de regra de negócio retornam HTTP 409 (conflito), não 500 genérico.
- Proteção de rota: `app/(dashboard)/layout.tsx` chama `getSession()` e usa `redirect()`, não
  `middleware.ts`/`proxy.ts`. Detalhe em seção 6.
- Deploy: não é prioridade. `next build && next start` local atende ao critério do enunciado.
  CI cobre lint, format check e build — sem CD.

---

## 4. Schema real e views de normalização (confirmado contra o banco)

### Schema real (divergência corrigida frente ao enunciado)

`financeiro_mensal` tem chave `empreendimento_id` (não `id_empreendimento`, nome que aparecera
incorreto em rascunho anterior). Demais tabelas batem em contagem e propósito com o dicionário do
enunciado. Integridade referencial: zero órfãos em toda a base.

### Views definitivas (criadas em `data/cambara_teste_tecnico.db` via `scripts/setup-views.ts`,

idempotente)

- **`v_unidades_norm`** — reduz 11 grafias brutas de `unidades.status` a 4 status canônicos
  (`vendida`, `disponivel`, `reservada`, `distrato`), incluindo merge de `Cancelado` em
  `distrato` (mesmo evento de negócio, grafia diferente — evidência: toda unidade `Cancelado`
  está ligada a uma venda com status distrato/distratada, nenhuma com venda ativa).
- **`v_vendas_norm`** — reduz 6 grafias brutas de `vendas.status_venda` a 2 status canônicos
  (`ativa`, `distrato`). `data_distrato` fica na view como coluna informativa, mas **não decide**
  o status canônico (ver seção 7c).
- **`v_financeiro_reconciliado`** — expõe `resultado_recalculado` (receita − custo − despesas
  rateadas), a diferença frente ao `resultado_reportado`, e uma flag `divergente`.

### `vendas.forma_pagamento` — enum fechado (verificado manualmente, não pela análise formal)

Ao contrário dos demais campos de texto da base, `forma_pagamento` **não** apresenta variação de
grafia — verificação manual confirmou exatamente 3 valores distintos, sempre neste padrão exato:
`Financiamento`, `Parcelado Direto`, `À vista`. Tratado como enum fechado no formulário (select)
e validado via Zod. Ressalva: se uma 4ª variante aparecer ao rodar contra o banco no futuro, não
mapear silenciosamente como "só mais uma grafia" — confirmar antes de ampliar o enum.

### Dedup de cliente — TypeScript, não SQL

Tentativa em SQL puro (encadeamento de `REPLACE()` para tratar acentuação) estourou o parser do
SQLite. Implementado como função em `lib/features/clientes/dedup.ts`
(`chaveDedup`, `classificarGruposDedup`), calculada em tempo de leitura, não materializada.

```ts
function chaveDedup(nome: string, cidade: string): string {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  return `${norm(nome)}|${norm(cidade)}`;
}
```

Classificação: grupo com `chaveDedup` repetida e ao menos um membro com e-mail no padrão
`contatoN@exemplo.com` = alta confiança (fundido no cálculo de métricas); demais grupos repetidos
= baixa confiança (exibidos como "requer verificação manual", nunca fundidos automaticamente).
Contra o banco real: 97 grupos duplicados, 89 de alta confiança, 8 pares (16 registros) de baixa
confiança. Ver seção 7e para a divergência de número entre a política atual e o dado histórico da
análise original.

---

## 5. Camada de escrita — padrão de atomicidade

**Não existe coluna `status_normalizado`** — só `unidades.status` e `vendas.status_venda` (texto
bruto). O guard de concorrência compara o valor bruto normalizado inline
(`LOWER(TRIM(status))`), a mesma lógica das views. "Gravar o status canônico" significa escrever
sempre um valor canônico em minúsculo (`'vendida'`, `'disponivel'`, `'reservada'`, `'distrato'`,
`'ativa'`) na mesma coluna bruta.

**Registrar venda** (`app/api/vendas/route.ts`):

`valor_venda` é campo livre, negociado no momento da venda (não puxado de `unidades.valor_tabela`)
— validado via Zod como número positivo. `formaPagamento` validado via Zod contra o enum fechado
(seção 4) — rejeitado com 400 antes de tocar o banco se fora do enum.

```ts
const registrarVenda = db.transaction(
  (
    unidadeId: number,
    clienteId: number,
    valor: number,
    formaPagamento: string,
  ) => {
    const info = db
      .prepare(
        `
    UPDATE unidades
    SET status = 'vendida'
    WHERE id = ?
      AND LOWER(TRIM(status)) IN ('disponivel', 'disponível')
  `,
      )
      .run(unidadeId);

    if (info.changes === 0) {
      throw new Error("Unidade não disponível"); // aborta a transação, nada é gravado
    }

    db.prepare(
      `
    INSERT INTO vendas (unidade_id, cliente_id, valor_venda, forma_pagamento, status_venda, data_venda)
    VALUES (?, ?, ?, ?, 'ativa', ?)
  `,
    ).run(
      unidadeId,
      clienteId,
      valor,
      formaPagamento,
      new Date().toISOString(),
    );
  },
);
```

**Registrar distrato** (`app/api/distratos/route.ts`, padrão inverso):

```ts
const registrarDistrato = db.transaction((vendaId: number) => {
  const infoVenda = db
    .prepare(
      `
    UPDATE vendas
    SET status_venda = 'distrato', data_distrato = ?
    WHERE id = ? AND LOWER(TRIM(status_venda)) IN ('ativa')
  `,
    )
    .run(new Date().toISOString(), vendaId);

  if (infoVenda.changes === 0) {
    throw new Error("Venda não está ativa"); // aborta, nada é gravado
  }

  const venda = db
    .prepare(`SELECT unidade_id FROM vendas WHERE id = ?`)
    .get(vendaId);

  db.prepare(`UPDATE unidades SET status = 'disponivel' WHERE id = ?`).run(
    venda.unidade_id,
  );
});
```

- `db.transaction()` garante atomicidade entre as duas escritas — não é o que impede a venda
  dupla; quem impede é o `WHERE` de cada `UPDATE`.
- **Não confundir com o histórico legado (seção 7d)**: 122 unidades já existentes ficaram presas
  em `distrato` sem nunca terem voltado a `disponivel` antes da aplicação existir. Esse histórico
  **não é corrigido** por este código — ele só passa a valer corretamente daqui para frente.
- Cliente novo no fluxo de venda: `INSERT cliente` (condicional a não existir) → `UPDATE unidade
WHERE ...` → `INSERT venda`, mesma transação, rollback conjunto se qualquer etapa falhar. Sem
  checagem de duplicidade de cliente no cadastro — dedup é responsabilidade exclusiva da leitura.
- **`cidade` obrigatória no formulário de cliente novo**: embora `clientes.cidade` seja nullable
  no schema, o formulário exige preenchimento — a dedup depende de nome+cidade, e um cliente sem
  cidade quebraria silenciosamente a classificação de confiança. Trade-off travado, não é premissa
  em aberto.
- **Seletor de unidade disponível**: exibe `{empreendimento_nome} — {identificador} ({tipo})`, não
  o identificador puro — `unidades.identificador` não é único globalmente, só dentro do
  empreendimento (ex.: "Torre A - 0104" repete entre empreendimentos diferentes). Mostrar só o
  identificador criaria risco real de venda para a unidade errada.

---

## 6. Autenticação

- Schema confirmado de `usuarios`: `id, nome, email, papel, senha_hash`. Papéis: `diretoria`,
  `comercial`, `engenharia`, `financeiro`.
- Cookie httpOnly assinado (HMAC-SHA256 via `node:crypto`, comparação com `timingSafeEqual`,
  incluindo checagem de tamanho igual antes de comparar — evita tanto timing attack quanto
  exceção por buffers de tamanho diferente). `Secure` condicional a `NODE_ENV=production`,
  `SameSite=Lax`, TTL de 8h, sem revogação server-side antes disso (limitação aceita).
- Mensagem de erro genérica no login, papel sempre lido do lado servidor.
- **RBAC não decidido, não implementado** — qualquer usuário autenticado acessa qualquer rota,
  incluindo vender/distratar. Não assumir "diretoria = acesso total" por analogia.
- `senha_hash` nunca vaza em resposta de API.
- **Proteção de rota via `layout.tsx`, não `middleware.ts`/`proxy.ts`**: `app/(dashboard)/layout.tsx`
  chama `getSession()` e lança `redirect()` se a sessão for inválida — interrompe a renderização
  do route segment antes de qualquer função de página filha ser invocada (comportamento
  documentado do Next.js), garantia equivalente à de um middleware/proxy. Motivo técnico real
  (confirmado contra a documentação/código-fonte do Next.js instalado, não suposição): nesta base
  (Next.js 16.3.4), `middleware.ts` foi renomeado para `proxy.ts` e já roda em Node.js por padrão
  (não Edge) — a preocupação clássica de "Edge Runtime não suporta `node:crypto`" não se sustenta
  nesta versão. Mesmo assim, manter a verificação no layout evita um arquivo `proxy.ts` extra,
  alinhado com a recomendação do próprio Next.js de evitar Proxy "a menos que não haja outra
  opção", e mantém runtime único e consistente com as Route Handlers.

---

## 7. Decisões de negócio — resumo (detalhe completo em `docs/regras-de-negocio.md`)

**a) "Total ofertado"**: todas as unidades cadastradas no empreendimento (3.300 no total),
independentemente do status.

**b) "Magnitude acumulada" de estouro de custo**: soma apenas dos meses com estouro positivo
(critério bruto), não soma líquida. Caso Cume Tower: entra no top-4 pelo critério bruto (R$ 3,1M),
mas o desvio líquido é quase irrelevante (R$ 54 mil) — critério líquido esconderia risco real.

**c) Fonte de verdade — status textual vs. data**: existe divergência real (46 de 2.206 vendas,
2,1%). Em 100% dos casos testados, o status da unidade vinculada concorda com o texto de
`status_venda`, nunca com o que a data sugeriria. `status_venda` é a fonte de verdade;
`data_distrato` é informação auxiliar. Reforço adicional: um subconjunto dessas mesmas vendas tem
`data_distrato` posterior à data atual do sistema, com gaps de ~400-445 dias entre venda e
distrato — sem padrão de erro de digitação isolado, mais evidência de que o campo de data não é
confiável de forma sistemática (não um caso pontual).

**d) Unidades presas em status inconsistente**: 122 unidades (`status_canonico = 'distrato'`)
nunca voltaram a `disponivel` no histórico. Mantidas como bucket separado na view, não
reclassificadas automaticamente. Corrigir na fonte segue como proposta pendente de aprovação
humana explícita — nunca aplicada.

**e) Deduplicação de cliente — duas políticas, números diferentes por desenho, não por erro**:

- **1.436 clientes únicos / R$ 3.176.094,10 de ticket médio** — número histórico, calculado na
  análise original mesclando os 97 grupos inteiros (alta e baixa confiança juntos).
- **1.440 clientes únicos / R$ 3.167.271,61 de ticket médio** — número atual, calculado pela
  política implementada na camada analítica: mesclar só os 89 grupos de alta confiança (sinal de
  e-mail sintético), deixando os 8 pares de baixa confiança sem fusão automática.
- Os dois números divergem porque usam critérios de mesclagem deliberadamente diferentes — o
  número atual (1.440) é o que reflete a política de negócio hoje implementada e deve ser citado
  como correto; o histórico (1.436) é mantido só como referência de como o critério evoluiu.

---

## 8. Achados fora do escopo original do enunciado

- Merge `Cancelado` → `distrato` (afeta diretamente o cálculo de velocidade de vendas).
- 5 vendas com `data_distrato` anterior a `data_venda` (logicamente impossível) — IDs: 312, 722,
  1276, 1816, 2090.
- Subconjunto de vendas com `status_venda = 'Ativa'` e `data_distrato` preenchida posterior à data
  atual do sistema (parte da divergência 7c) — sem outlier isolado óbvio, gaps de ~400-445 dias.
  Não corrigido na fonte; número não é congelado, recalculado contra a data atual sempre que
  exposto na interface.
- `clientes.email` é heurística de dedup inutilizável de forma geral — gerado a partir do próprio
  `id`, garante unicidade artificial mesmo entre prováveis duplicatas reais. Só o subconjunto
  sintético (`contatoN@exemplo.com`) serve como sinal de dedup (ver seção 4).
- Divergência financeira em 63 de 562 meses (11,2%), 18 de 22 empreendimentos, R$ 6.926.672,09 em
  diferenças absolutas — sem padrão sistemático encontrado, tratado como hipótese de erro de
  lançamento pontual, não regra de negócio não capturada.
- `unidades.identificador` não é único globalmente, só dentro do empreendimento — corrigido na UI
  do formulário de venda (ver seção 5), documentado aqui para não ser redescoberto.

---

## 9. Sequenciamento de sessões

0. ✅ Scaffolding + Autenticação + Agentes especialistas + README inicial.
1. ✅ Views de normalização + dedup TS + documentação README.
2. ✅ Camada de escrita (venda/distrato) — padrão `UPDATE...WHERE`, teste E2E persistido, CI
   corrigido para Node 22+, proteção de rota auditada e documentada.
3. ✅ Camada analítica — as 4 perguntas de negócio, validadas contra o banco real:
   - Velocidade de vendas: Essência Living 6,84%, Atelier Tower 18,82%, Cume Tower 24,66% (3
     piores).
   - Estouro de custo, top-5: Panorama do Parque, Alto Amazônia, Estúdio Amazônia, Cume Tower,
     Cais Tower.
   - Divergência financeira: 63/562 meses, 18/22 empreendimentos, R$ 6.926.672,09.
   - Duplicidade de cliente: 97 grupos / 196 registros; 1.440 clientes únicos pela política atual
     (ver seção 7e).
4. ✅ **Assistente de linguagem natural** — duas chamadas Groq, guardrails, UI com SQL + resultado.
   Ver seção 11 para o detalhamento completo desta sessão, incluindo a troca de modelo e o teste
   manual pendente.
5. ✅ Playwright promovido a devDependency real — ver seção 12.
6. ✅ **Dashboard analítico — filtros e gráficos** — cidade/UF/tipo/período sobre as 4 perguntas de
   negócio, gráficos bar/area do catálogo shadcn/ui. Ver seção 13 para o detalhamento completo.
7. ✅ **Correções na camada de escrita** (busca de cliente, aviso de dedup no cadastro, verificação
   do fluxo de distrato) — ver seção 14.
8. ✅ **Vendas: gráficos, tabelas separadas, busca e filtros** — ver seção 15.
9. ✅ **Vendas: campo perfil obrigatório, tabs e tabela de unidades** — ver seção 16.
10. ✅ **Home redirecionada para `/analitico`, diagnóstico de formato de data dos filtros e
    auditoria final de documentação** — ver seção 17. Nota: diverge do plano original desta linha
    ("consolidação, não é sessão de código") porque a sessão 10 recebeu, a pedido explícito do
    humano no início da sessão, 2 pequenos itens de código (redirect da home e diagnóstico/ajuste
    de locale dos filtros de data) além da auditoria de documentação — não é uma contradição da
    seção 9 original, é um ajuste de escopo dado nesta sessão.

---

## 10. Regras de processo (valem para qualquer sessão de desenvolvimento, humana ou assistida)

- Qualquer alteração de dado ou schema do `.db` de trabalho fora do fluxo normal da aplicação
  exige pergunta/aprovação explícita antes de ser implementada — mesmo que pareça óbvia.
- Não assumir decisões de escopo não travadas (ex.: RBAC) por analogia — sinalizar como pendente.
- Contradições ou lacunas entre o que está sendo pedido e o que já está registrado neste documento
  devem ser apontadas antes de implementar, não depois.
- Números que dependem da data atual do sistema (ex.: seção 8) não devem ser congelados como texto
  fixo em nenhum lugar — recalcular quando exposto.
- Este documento deve se manter autocontido: qualquer decisão nova relevante para sessões futuras
  entra aqui como texto explícito, não como referência a uma conversa ou contexto externo ao
  repositório.

---

## 11. Sessão 4 — Assistente de linguagem natural (03/09/2026)

Componente 4 do enunciado: assistente de linguagem natural sobre os dados, somente leitura.
Arquitetura de duas chamadas Groq por pergunta, conforme já decidido antes desta sessão. Código em
`lib/features/assistente/**`, rota `app/api/assistente/route.ts`, UI em `app/(dashboard)/assistente/`.

### Correção de escopo do schema exposto ao Call 1

O documento de decisões original dizia que o prompt de sistema do Call 1 recebia "apenas o schema
das views". Isso estava incompleto: as 3 views (`v_unidades_norm`, `v_vendas_norm`,
`v_financeiro_reconciliado`) só cobrem unidades/vendas/financeiro — perguntas sobre nome/cidade de
empreendimento ou sobre estouro de custo (`obra_andamento`) não têm view e não seriam respondíveis
vendo só as 3 views. O schema exposto em `lib/features/assistente/prompts.ts`
(`SYSTEM_PROMPT_SQL`) inclui, além das 3 views: `empreendimentos`, `obra_andamento` e `clientes`
(tabelas cruas). As tabelas brutas correspondentes às views (`unidades`, `vendas`,
`financeiro_mensal`) ficam de fora — só as views normalizadas entram no schema.

Para `clientes`: o prompt instrui explicitamente que este assistente não tem acesso à lógica de
deduplicação (`chaveDedup`/`classificarGruposDedup`, TypeScript, seção 4). Perguntas sobre
clientes únicos/duplicados devem gerar SQL de contagem bruta (ex.: `GROUP BY nome, cidade` exatos,
sem normalização de acento/espaço), e a Call 2 é instruída a avisar que esse número não reflete a
dedup do dashboard analítico.

### Modelos Groq — troca frente ao planejado

Os nomes registrados originalmente (`llama-3.3-70b-versatile` para Call 1,
`llama-3.1-8b-instant` para Call 2) foram desativados pela Groq em **16/08/2026**
(`shutdown date`, confirmado contra `console.groq.com/docs/deprecations` nesta sessão — a data da
sessão, 03/09/2026, já é posterior ao shutdown, ou seja, os modelos antigos já não respondem mais
requisições, não é uma depreciação futura). Substituídos pelos sucessores recomendados pela própria
Groq:

- **Call 1** (texto → SQL): `openai/gpt-oss-120b` (era o modelo maior/mais capaz disponível entre
  os sucessores recomendados — a tarefa mais exigente das duas).
- **Call 2** (resultado → resposta em português): `openai/gpt-oss-20b` (mais rápido/barato,
  adequado para parafrasear um conjunto de linhas já pronto).

Ambos com contexto de 131.072 tokens, compatíveis com `response_format: {type: "json_object"}`
(usado só na Call 1). Implementação via `fetch` direto ao endpoint compatível com OpenAI da Groq
(`lib/features/assistente/groq.ts`) — sem SDK novo como dependência, consistente com a preferência
do projeto por evitar dependência quando uma chamada HTTP simples resolve.

### Guardrails implementados

- Conexão SQLite separada e somente-leitura: `lib/db/connection-readonly.ts`
  (`new Database(path, { readonly: true })`), nunca a mesma conexão de `lib/db/connection.ts`
  (escrita).
- Antes de executar: `validarSelectUnico` (`lib/features/assistente/repository.ts`) rejeita
  qualquer SQL que não comece com `SELECT` (case-insensitive) ou que contenha mais de um comando
  (`;` além do opcional no final) — defesa em profundidade; a proteção real é o modo readonly do
  driver.
- 1 retry apenas se a geração/execução da SQL falhar (JSON inválido, SQL fora do guardrail, ou erro
  de execução do SQLite) — o erro é reenviado ao LLM pedindo correção. Se falhar de novo, a
  resposta ao usuário é `"Não consegui responder com confiança nos dados disponíveis."`
  (`status: "falha"` no JSON da rota), nunca uma resposta incerta forçada.
- Few-shot do prompt de sistema instrui `LIMIT 50` por padrão, exceto quando a pergunta pede um
  agregado único.

### Resultado do teste manual — 1ª rodada (dados reais, 03/09/2026)

`GROQ_API_KEY` em `.env` estava vazio no início desta sessão (a máscara do `sed` usada numa
inspeção anterior tinha ocultado esse fato — a linha `GROQ_API_KEY=` estava lá, mas sem valor). O
usuário colou a chave real, primeiro por engano em `.env.example` (arquivo rastreado pelo Git —
teria vazado a chave se commitado; corrigido movendo o valor para `.env`, que é gitignored, e
restaurando `.env.example` ao placeholder vazio), depois confirmado em `.env`. Servidor reiniciado
para carregar o valor novo.

5 perguntas testadas contra `/assistente` real (4 perguntas de negócio, fraseado livre não-literal
do enunciado, + 1 pergunta fora do script):

| #                  | Pergunta                                                                                                                   | Resultado                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                  | "Quais os 3 empreendimentos com pior velocidade de vendas?"                                                                | ✅ bate exatamente: Essência Living 6,84%, Atelier Tower 18,82%, Cume Tower 24,66%                                                                                                           |
| 2                  | "Quais os empreendimentos com maior risco de estouro de custo, do maior para o menor?"                                     | ✅ bate exatamente: Panorama do Parque R$5.870.238,38, Alto Amazônia R$3.857.806,45, Estúdio Amazônia R$3.613.496,47, Cume Tower R$3.106.416,68, Cais Tower R$3.060.991,11                   |
| 3                  | "Quantos clientes têm nome e cidade duplicados, e como isso afeta a contagem de clientes compradores e o ticket médio?"    | ⚠️ status "sucesso", mas com **bug 1** (ver abaixo)                                                                                                                                          |
| 4                  | "Quantos meses têm divergência entre o resultado financeiro reportado e o recalculado, e qual o valor total da diferença?" | ⚠️ status "sucesso", mas com **bug 2** (ver abaixo)                                                                                                                                          |
| 5 (fora do script) | "Quantas unidades tem o empreendimento Cume Tower e quantas já foram vendidas?"                                            | ✅ 146 unidades, 36 vendidas — consistente com #1, confirma que o schema completo (`empreendimentos` + view, sem nenhuma das 3 views sozinha bastar) responde perguntas fora das 4 originais |

**Bug 1 — "ticket médio" calculado por venda, não por cliente.** A pergunta 3 gerou, entre outras
colunas, `ticket_medio_raw` como `AVG(valor_venda)` (média por linha de venda) = R$2.188.517,81, em
vez de `SUM(valor_venda) / COUNT(DISTINCT cliente_id)` (média por cliente, a definição fixada em
`docs/regras-de-negocio.md` B4) = R$3.094.213,79 (número de referência de `refs/analise-banco-
consolidada.md` §5c, sem dedup). O resto da pergunta funcionou (contagem de grupos duplicados via
`GROUP BY nome, cidade` exato — 9 grupos, correto como contagem bruta; aviso obrigatório sobre não
refletir a dedup do dashboard apareceu na resposta).

**Bug 2 — soma de diferença sem `ABS()`, sinal cancelando.** A pergunta 4 gerou
`SUM(diferenca)` (soma com sinal) = **–R$1.507.042,67**, não `SUM(ABS(diferenca))` (soma das
magnitudes) = **R$6.926.672,09** (número de referência, seção 9 acima). A contagem de meses
divergentes (63) não foi testada nessa pergunta específica (a pergunta só pediu "quantos meses" e
"o valor total da diferença" — o modelo respondeu 63 meses corretamente, o problema foi só no
valor). O few-shot já continha `SUM(ABS(diferenca))` para a pergunta de referência exata, mas o
modelo não generalizou o padrão para esta variação de fraseado.

**Achado operacional — rate limit do tier gratuito da Groq.** Ao rodar as 5 perguntas em sequência
rápida via `curl` sem espaçamento, as perguntas 3, 4 e 5 vieram inicialmente como
`"status": "falha"` com `sql` vazio. Diagnosticado chamando `chamarGroq` isoladamente para as
mesmas perguntas (script ad-hoc fora do repositório): geraram SQL válida imediatamente. Repetido
via API com ~15s de intervalo entre chamadas — sucesso em todas. Confirmado: rate limit (HTTP 429)
do tier gratuito, não bug de prompt/schema. Motivou o bug 3 abaixo.

### Correções aplicadas (bugs 1, 2 e 3)

Instruções genéricas adicionadas a `SYSTEM_PROMPT_SQL`
(`lib/features/assistente/prompts.ts`) — no texto do prompt de sistema, não só no SQL do exemplo,
conforme pedido:

- **Bug 1**: `"Média por X" ou "valor médio por X" ... SEMPRE significa agrupar por X antes de
tirar a média — nunca AVG() direto sobre a tabela de transações. Calcule como SUM(coluna_de_valor)
/ COUNT(DISTINCT id_do_X) ...`, com o exemplo explícito de ticket médio por cliente.
- **Bug 2**: `"Ao somar desvios/diferenças que representam magnitude de erro, estouro ou
divergência ... use sempre SUM(ABS(coluna)), nunca SUM(coluna) puro"` — generalizada para
  qualquer pergunta desse tipo (divergência financeira, estouro de custo, ou variação futura), não
  amarrada à pergunta de referência do few-shot.
- **Bug 3** (baixa prioridade, corrigido mesmo assim): `GroqRateLimitError`, nova classe de erro em
  `lib/features/assistente/groq.ts`, lançada quando a Groq responde HTTP 429 (em vez do `Error`
  genérico). `responderPergunta` (`repository.ts`) rastreia se o último erro foi rate limit e, se
  for, devolve `"Muitas perguntas em sequência — aguarde alguns segundos e tente novamente."` em
  vez da mensagem genérica de falha — sem alterar a contagem de tentativas (continua 1 retry, o
  retry após 429 tende a falhar de novo por não haver backoff, mas isso está fora do escopo pedido
  para esta correção).

### Validação da correção — 2ª rodada (8 perguntas, dados reais, 03/09/2026)

Conforme pedido: as 4 perguntas de negócio **literais** do enunciado (`Teste Analista de
Negócio.pdf`, seção 4, fora do repositório — texto exato abaixo) + 2 variações de fraseado cada
para as perguntas 3 e 4 (diferentes do few-shot e da pergunta literal), com ~18s de intervalo entre
chamadas para evitar o rate limit.

**Bugs 1, 2 e 3 — confirmados corrigidos e generalizados:**

- Pergunta 3 literal ("Há indícios de cadastros de clientes duplicados na base? Como isso
  distorceria uma métrica de número de clientes únicos ou de ticket médio por cliente, se não fosse
  tratado?") e variação A ("Se eu não tratasse a duplicidade de cadastro de cliente, qual ficaria o
  ticket médio por cliente...?") **ambas** geraram `SUM(valor_venda) / COUNT(DISTINCT cliente_id)`
  — nunca mais `AVG()` direto. Variação B (pergunta sobre impacto no número de clientes únicos)
  também usou a forma correta em ambos os lados da comparação (bruto vs. dedup simplificado).
- Pergunta 4 literal, variação A ("Qual empreendimento teve mais divergência ... somando tudo em
  módulo?") e variação B ("... qual a soma da magnitude dessas diferenças?") — variação B gerou
  `SUM(ABS(diferenca))` e retornou **R$6.926.672,09**, batendo exatamente com a seção 9. Variação A
  (quebra por empreendimento) também usou `SUM(ABS(f.diferenca))` corretamente, apontando Essência
  Living como maior divergência (R$2.260.920,59) — número não validado anteriormente na sessão 3
  (que não quebra divergência por empreendimento individualmente), então não há como confirmar
  contra uma referência prévia, mas o padrão `ABS()` generalizou corretamente.
- Bug 3 validado com um teste extra (8 requisições concorrentes, fora do escopo dos 8 testes
  pedidos): 5 das 8 vieram `"status": "falha"` com a mensagem nova
  `"Muitas perguntas em sequência — aguarde alguns segundos e tente novamente."`, nunca mais a
  mensagem genérica nesse cenário.

**Duas divergências NOVAS encontradas nesta rodada — não fazem parte dos bugs 1/2/3, NÃO
corrigidas, parando para decisão conforme instruído:**

**Bug 4 (novo) — "líquidas de distrato" interpretado como subtração, não como o status canônico já
líquido.** A pergunta 1 literal usa o texto exato do enunciado: _"unidades vendidas líquidas de
distrato sobre total ofertado"_. O SQL gerado foi:

```sql
SELECT e.id, e.nome,
  (SUM(CASE WHEN u.status_canonico = 'vendida' THEN 1 ELSE 0 END) -
   SUM(CASE WHEN u.status_canonico = 'distrato' THEN 1 ELSE 0 END)) * 1.0 / NULLIF(COUNT(*),0) AS velocidade_vendas
FROM v_unidades_norm u JOIN empreendimentos e ON e.id = u.empreendimento_id
GROUP BY e.id ORDER BY velocidade_vendas ASC LIMIT 3
```

Isso **subtrai** a contagem de `distrato` da contagem de `vendida`, produzindo Essência Living
4,21%, Atelier Tower 16,13%, Cume Tower 17,81% — divergente dos valores corretos (6,84% / 18,82% /
24,66%, seção 9). Causa raiz: a regra B2 de `docs/regras-de-negocio.md` já deixa fechado que
`status_canonico = 'vendida'` **já é líquido** de distrato (uma unidade cancelada nunca aparece
como `'vendida'`, aparece como `'distrato'` — normalização A1) — não deveria haver subtração
nenhuma, só `vendida / total`. O fraseado literal do enunciado ("líquidas de distrato") levou o
modelo a interpretar isso como uma operação aritmética explícita (`vendida - distrato`), dupla-
contando o ajuste que a normalização já fez. Confirmado contra o banco: `vendida - distrato` dá os
números errados vistos; `vendida` sozinho bate com a seção 9. O mesmo fraseado não-literal usado na
1ª rodada e no few-shot ("pior velocidade de vendas", sem a palavra "líquidas") não expõe este bug
— só a pergunta literal do enunciado expõe.

**Bug 5 (novo) — "quantos meses" contado como meses-calendário distintos, não como registros
mês×empreendimento divergentes.** A pergunta 4 literal ("Em quantos meses/empreendimentos isso
ocorre?") e a variação B geraram `COUNT(DISTINCT mes_referencia)` = **29**, não `COUNT(*)` = **63**
(o número da seção 9). Causa raiz: `v_financeiro_reconciliado` tem uma linha por
(empreendimento, mês) — "63 meses" na seção 9 significa 63 linhas divergentes (contando o mesmo
mês-calendário uma vez por empreendimento que divergiu nele), não 29 valores distintos de
`mes_referencia` entre os 22 empreendimentos. Confirmado contra o banco:
`COUNT(*) WHERE divergente=1` = 63, `COUNT(DISTINCT mes_referencia) WHERE divergente=1` = 29. A
contagem de empreendimentos (`COUNT(DISTINCT empreendimento_id)` = 18) bateu certo nas duas
perguntas — só a contagem de "meses" está errada. O fraseado "Em quantos meses/empreendimentos
isso ocorre?" é genuinamente ambíguo (pode ler como "quantos meses-calendário" ou "quantas
ocorrências mês×empreendimento"), mas a definição já fixada na seção 9 é a segunda leitura.

**Decisão: não fiz nenhum ajuste de prompt para os bugs 4 e 5.** Ambos foram descobertos pelo
próprio propósito do teste (fraseado literal do enunciado, que o avaliador pode usar na
apresentação de 08/09) — registrando aqui e parando para decisão humana antes de tocar no prompt de
novo, conforme instruído.

### Correção dos bugs 4 e 5

Duas novas instruções genéricas adicionadas a `SYSTEM_PROMPT_SQL`
(`lib/features/assistente/prompts.ts`), no texto do prompt, não só no SQL de exemplo:

- **Bug 4**: instrui que os valores de `status_canonico` (tanto em `v_unidades_norm` quanto em
  `v_vendas_norm`) são **mutuamente exclusivos por construção da view** — uma linha tem exatamente
  um valor por vez. "Líquido de X" ou "excluindo X" sobre um status-alvo Y (X e Y diferentes
  valores do mesmo campo `status_canonico`) já é a contagem direta de Y, sem subtração — X já está
  excluído de Y por definição. Inclui o exemplo exato do bug: "unidades vendidas líquidas de
  distrato" = `COUNT(status_canonico = 'vendida')`, nunca
  `COUNT(vendida) - COUNT(distrato)`.
- **Bug 5**: fixa a convenção oficial (a seção 9 usa contagem de linha, não mês-calendário
  distinto) — em perguntas sobre `v_financeiro_reconciliado`, "mês" significa uma linha da tabela
  (par `empreendimento_id` + `mes_referencia`), nunca um mês-calendário distinto, porque a
  granularidade já é por empreendimento. `COUNT(*)`, nunca `COUNT(DISTINCT mes_referencia)`, a
  menos que a pergunta peça explicitamente "mês-calendário distinto".

Antes de rodar qualquer teste: confirmado que a chave Groq real (colada pelo usuário nesta sessão)
nunca foi commitada em `.env.example` nem em nenhum arquivo do histórico do Git — busca
`git log --all -p | grep gsk_` em todo o histórico não retornou nenhuma ocorrência. A chave só
existia transitoriamente na working tree (não commitada) antes de ser movida para `.env`
(gitignored). Não foi necessário rotacionar a chave na Groq.

### Validação da correção — 3ª rodada (8 perguntas, dados reais, 03/09/2026)

As mesmas 4 perguntas literais do enunciado + 2 variações **novas** de Q1 e 2 variações **novas**
de Q4 (fraseado diferente do few-shot e de todas as rodadas anteriores desta seção), ~18s de
intervalo entre chamadas.

**Bugs 4 e 5 — confirmados corrigidos:**

- Q1 literal ("unidades vendidas líquidas de distrato sobre total ofertado") gerou
  `SUM(vendida)/COUNT(*)` — **sem subtração** — e bateu exatamente: Essência Living 6,84%, Atelier
  Tower 18,82%, Cume Tower 24,66%.
- Q4 literal, variação C ("Para quantos meses o financeiro não bate...") e variação D ("Quantas
  vezes, considerando cada empreendimento e mês separadamente...") — as três geraram
  `COUNT(*) FROM v_financeiro_reconciliado WHERE divergente = 1` = **63**, batendo exatamente com a
  seção 9. Nenhuma usou `COUNT(DISTINCT mes_referencia)` desta vez.

**Bug 6 (NOVO) — "descontando"/"excluindo" distratos filtra o DENOMINADOR da velocidade de vendas,
violando a regra B1.** Duas variações de Q1 desenhadas para testar generalização do fix do bug 4
com um verbo diferente ("líquido" → "descontando"/"excluindo") expuseram um mecanismo de erro
diferente do bug 4 original:

- _"Descontando os distratos, quais os 3 empreendimentos com pior velocidade de vendas?"_
- _"Excluindo as unidades distratadas, qual a velocidade de vendas de cada empreendimento? Quais os
  3 piores?"_

Ambas geraram a mesma SQL (variando só o alias):

```sql
SELECT e.id, e.nome,
  SUM(CASE WHEN u.status_canonico = 'vendida' THEN 1 ELSE 0 END) AS vendidas,
  SUM(CASE WHEN u.status_canonico != 'distrato' THEN 1 ELSE 0 END) AS total_considerado,
  ROUND(1.0 * SUM(CASE WHEN u.status_canonico = 'vendida' THEN 1 ELSE 0 END)
        / SUM(CASE WHEN u.status_canonico != 'distrato' THEN 1 ELSE 0 END), 4) AS velocidade
FROM v_unidades_norm u JOIN empreendimentos e ON e.id = u.empreendimento_id
GROUP BY e.id ORDER BY velocidade ASC LIMIT 3
```

O numerador está certo (`vendida` sem subtração — bug 4 não voltou). O problema é o **denominador**:
`SUM(CASE WHEN status_canonico != 'distrato' ...)` remove as unidades em `distrato` do total
considerado, produzindo Essência Living 7,03%, Atelier Tower 19,34%, Cume Tower 26,47% — diferente
dos valores corretos (6,84% / 18,82% / 24,66%). Confirmado contra o banco:
`total_todas_unidades` (190/186/146) vs. `total_sem_distrato` (185/181/136) — a regra B1 de
`docs/regras-de-negocio.md` fixa que "total ofertado" é **todas** as unidades cadastradas,
independentemente do status ("nenhum status na base sinaliza remoção de oferta/portfólio") — não
deveria haver filtro nenhum no denominador. A instrução do bug 4 cobria só subtração no numerador
entre dois valores do mesmo campo `status_canonico`; não cobre um `WHERE`/filtro que altera o
universo do denominador de uma métrica de proporção. Reproduzido de forma idêntica em 2 fraseados
independentes ("descontando", "excluindo") — não é um acaso isolado.

**Decisão: não corrigido.** Conforme instruído, parando aqui e documentando como limitação
conhecida no README (seção "Limitações conhecidas"), com o fraseado exato que expõe o problema, em
vez de consumir mais tempo de correção sem teste automatizado por trás antes do prazo de 04/09.

### Correção final — bug 1 recorrendo sob forma equivalente (COUNT sem DISTINCT, não AVG())

Revisão humana da rodada anterior (pergunta 3, ver "Bugs 1, 2 e 3 — confirmados corrigidos e
generalizados" acima) identificou que `ticket_medio_bruto` usava
`SUM(v.valor_venda) / COUNT(v.cliente_id)` (sem `DISTINCT`) sobre `v_vendas_norm` — como
`cliente_id` nunca é nulo numa venda, `COUNT(v.cliente_id) = COUNT(*)`, ou seja,
matematicamente idêntico a `AVG(valor_venda)` (média por venda, não por cliente). A instrução do
bug 1 só proibia o literal `AVG()`, não a forma equivalente via `COUNT(coluna)` sem `DISTINCT` —
o mesmo defeito, disfarçado de sintaxe diferente.

**Correção**: a regra de `SYSTEM_PROMPT_SQL` para "média/ticket por X" foi reescrita para proibir o
padrão **semântico**, não a sintaxe: toda métrica desse tipo divide por `COUNT(DISTINCT id_do_X)`;
`AVG()`, `COUNT(coluna)` sem `DISTINCT` e `COUNT(*)` são tratados explicitamente como formas
equivalentes e igualmente erradas. Também instruído que um número "sem tratamento de dedup" para
efeito de contraste ainda usa `COUNT(DISTINCT ...)` — a diferença entre bruto e deduplicado está em
como o id é agrupado (`cliente_id` bruto vs. nome+cidade normalizados), nunca em ter ou não
`DISTINCT` no denominador.

**Validação — pergunta 3 literal do enunciado, rodada final:**

```sql
SELECT
  (SELECT COUNT(*) FROM clientes) AS total_clientes_bruto,
  (SELECT COUNT(*) FROM (
     SELECT nome, cidade FROM clientes GROUP BY nome, cidade HAVING COUNT(*) > 1
   )) AS grupos_duplicados,
  (SELECT SUM(valor_venda) FROM v_vendas_norm) AS total_vendas,
  (SELECT SUM(valor_venda) FROM v_vendas_norm) / (SELECT COUNT(*) FROM clientes) AS ticket_medio_bruto,
  (SELECT SUM(valor_venda) FROM v_vendas_norm) / (SELECT COUNT(DISTINCT nome || '|' || cidade) FROM clientes) AS ticket_medio_dedup
LIMIT 50
```

Resultado: `ticket_medio_bruto` = R$1.797.643,21, `ticket_medio_dedup` = R$1.803.675,57.

**Resultado misto — o padrão mecânico específico do bug 1 (COUNT(coluna transacional) sem
DISTINCT) não voltou a aparecer**, mas surgiu uma forma **nova** do mesmo tipo de erro, não coberta
pela instrução: os dois denominadores agora usam `COUNT(*) FROM clientes` /
`COUNT(DISTINCT nome||cidade) FROM clientes` — ou seja, contam **todos os clientes cadastrados**
(2.691 / 2.682), não os clientes que efetivamente compraram (`COUNT(DISTINCT cliente_id)` sobre
`v_vendas_norm`, que é 1.535). Confirmado contra o banco:
`SUM(valor_venda) / COUNT(DISTINCT cliente_id) FROM v_vendas_norm` = **R$3.151.438,36** (o número
correto, consistente com todas as rodadas anteriores que usaram essa fórmula) — bem diferente dos
R$1.797.643,21/R$1.803.675,57 gerados nesta consulta. `COUNT(*) FROM clientes` é sintaticamente
"`COUNT()` sem `DISTINCT`" (embora equivalha a `COUNT(DISTINCT id)` porque `clientes.id` é chave
primária sem duplicata de linha) — o defeito real não é a ausência de `DISTINCT` em si desta vez,
é dividir pela população errada (todos os cadastrados, não os compradores).

**Conforme instruído: não é aberto como "bug 7", não corrigido nesta sessão.** Documentado como
limitação conhecida no README ("Limitações conhecidas"), com a SQL exata acima. Esta é a última
correção da camada de prompt desta sessão — parando de caçar variação de fraseado aqui; o tempo
restante vai para a sessão 5 (README final).

### Validação de UI (Playwright ad-hoc, não persistido)

Checklist da seção 2 do `AGENTS.md` rodado via `npx playwright test` contra um spec temporário
(fora do repositório, não commitado — só o fluxo de venda/distrato tem teste E2E persistido,
conforme a exceção documentada na seção 2 do `AGENTS.md`):

- **Mobile-first** (390×844): campo de pergunta, botão e cards de resposta/SQL/tabela empilham
  corretamente, sem overflow horizontal na página (só dentro de containers com `overflow-x-auto`
  — o `<pre>` da SQL e a tabela de resultado).
- **Breakpoint desktop** (1280px): mesmo layout, sem quebra, largura do `body` não excede a
  viewport.
- **Acessibilidade básica**: `<Label htmlFor="pergunta">` associado ao `<Input id="pergunta">`
  (confirmado via `getByLabel` do Playwright, que só resolve com associação real de label);
  navegação por teclado testada (foco no campo, preenchimento, submit).
- Nenhum teste de acessibilidade de contraste automatizado rodou — validação visual manual do tema
  customizado (mesmos componentes `shadcn`/`@base-ui` das demais páginas, sem estilo novo
  introduzido).

### Limitação nova descoberta

O aviso de que o número de clientes duplicados/únicos não reflete a dedup do dashboard analítico
depende inteiramente da instrução no prompt de sistema da Call 2 — não há checagem no código do
lado da aplicação (ex.: detecção de palavra-chave na pergunta) que force esse aviso. Se o LLM não
seguir a instrução numa resposta específica, o aviso pode não aparecer. Decisão consciente: mover
essa lógica para o código replicaria uma heurística de classificação de pergunta fora do LLM, fora
do escopo desta sessão. Registrado também no README, seção "Limitações conhecidas".

---

## 12. Sessão 5 — Playwright promovido a devDependency real (03/09/2026)

**Decisão revertida a pedido explícito do humano na conversa**: a seção 2 do `AGENTS.md` original
(e a seção 3 deste documento) tratavam Playwright como "ferramenta de sessão, não dependência" —
invocado via `npx playwright` sob demanda, nunca listado em `package.json`. Essa decisão foi
revertida nesta sessão: `@playwright/test@1.62.1` (mesma versão já usada para validar o teste E2E
persistido em todas as rodadas anteriores) agora entra como devDependency real via
`pnpm add -D @playwright/test@1.62.1`.

**O que muda**: rodar o teste E2E persistido (`tests/e2e/vendas-distratos.spec.ts`) ou validação
ad-hoc de feature não depende mais de baixar o pacote a cada chamada via `npx` — já está resolvido
pelo `pnpm install`. Novo script `pnpm test:e2e` em `package.json`
(`npx playwright@1.62.1 test tests/e2e/`) como atalho.

**O que não muda**: Playwright continua fora do pipeline de CI padrão (`.github/workflows/ci.yml`)
— essa é uma decisão separada, não revertida nesta sessão (ver "Limitações conhecidas" no
README). A validação ad-hoc de outras features continua não persistida — só o teste de
venda/distrato é commitado, mesma exceção de sempre.

**Documentação atualizada em consequência**: `AGENTS.md` (seções 1 e 2), README (seção "Camada de
escrita", lista de scripts, e a nota de limitação sobre CI), `docs/log-tecnico-decisoes.md` (seção
3, este documento) e `.claude/agents/frontend.md` (checklist de validação). `.claude/agents/
devops.md` não precisou de alteração — a regra "Playwright fora do pipeline de CI" ali é
independente de ele ser ou não devDependency do projeto.

---

## 13. Sessão 6 — Dashboard analítico: filtros e gráficos (04/09/2026)

Escopo fechado no início da sessão: só `/analitico` — filtros (cidade/UF/tipo/período) e gráficos
para as 4 perguntas de negócio já fechadas na sessão 3. Nenhum filtro altera a fórmula de nenhuma
métrica (regras B1-B4 de `docs/regras-de-negocio.md`) — filtro muda só o subconjunto de linhas
exibido, nunca numerador/denominador. Assistente de linguagem natural e camada de escrita fora de
escopo, não tocados.

### Decisão parada para aprovação humana — `modelo_negocio` excluído dos filtros

Antes de escrever qualquer filtro, checagem contra o banco real (`SELECT DISTINCT` nas 4 colunas
candidatas a filtro de `empreendimentos`) encontrou `cidade`/`uf`/`tipo` limpos (12 cidades, 10 UFs,
exatamente 3 valores de `tipo`), mas `modelo_negocio` com 9 grafias brutas para ~3 categorias reais
(`SPE Incorporadora`/`spe incorporadora`/`SPE incorporadora`; `Obra por Administração`/`obra por
administracao`/`OBRA POR ADM`; `incorporacao`/`Incorporação`/`Incorporacao`) — mesmo padrão sujo de
A1/A2, mas sem view nem regra fechada em `docs/regras-de-negocio.md` para essa coluna. Parado e
perguntado ao humano antes de decidir por conta própria (regra do `AGENTS.md` seção 4 e instrução
explícita da sessão: "se algum [filtro] não for [trivial], pare e pergunte antes de prosseguir").

**Decisão do humano**: excluir `modelo_negocio` dos filtros nesta sessão, em vez de normalizar em
TypeScript ou expor as 9 grafias brutas. Os 4 filtros implementados (perguntas 1 e 2) são só
cidade/UF/tipo. Se um filtro por modelo de negócio for necessário no futuro, precisa de uma decisão
explícita de normalização (provavelmente análoga a A1/A2, mas em TS por cima de `empreendimentos`,
já que não há view para essa coluna) — não implementado, não assumido.

### Arquitetura de filtro: Server Component busca tudo, Client Component filtra local

Mantém a arquitetura já travada (seção 3: Server Components lendo o banco direto, sem round-trip
HTTP) sem contradizer o requisito de estado de filtro local (`useState`, sem URL): o repository
(`lib/features/analitico/repository.ts`) passou a expor listas **sem agregação prévia por filtro**
— granularidade completa (uma linha por empreendimento para velocidade; uma linha por
empreendimento×mês para estouro de custo e para divergência financeira) — e cada seção virou um
Client Component (`"use client"`) que recebe essa lista completa via props do Server Component
(`page.tsx`) e faz filtro + agregação inteiramente no browser com `useMemo`, sem nova consulta ao
banco a cada mudança de filtro. Tipos são importados com `import type` nos client components para
não puxar `lib/db/connection` (e `better-sqlite3`) para o bundle do cliente.

- `listarVelocidadeVendas()` — mesma função da sessão 3, só ganhou `cidade`/`uf`/`tipo` no SELECT
  (join com `empreendimentos` já existia). Fórmula (numerador `status_canonico='vendida'`,
  denominador todas as unidades) inalterada.
- `listarRiscoEstouroCusto()` (agregada, sessão 3) foi **substituída** por
  `listarEstouroCustoMensal()` (uma linha por empreendimento×mês, com `cidade`/`uf`/`tipo`) — a
  agregação bruta/líquida (critério da regra B3) passou para uma função pura no client component
  (`agregar()` em `risco-estouro-custo-section.tsx`), que soma só o subconjunto de meses que passou
  pelo filtro de cidade/UF/tipo/período. Sem filtro (estado inicial), a agregação bate exatamente
  com os números validados na sessão 3 (Panorama do Parque R$5.870.238,38 top-1, Cume Tower
  R$3.106.416,68/R$53.966,04 bruto/líquido) — confirmado via script ad-hoc contra o banco real antes
  de considerar a sessão concluída.
- Nova função `listarDivergenciaMensal()` (uma linha por empreendimento×mês de
  `v_financeiro_reconciliado`) alimenta o gráfico de área da pergunta 4. `obterDivergenciaFinanceira()`
  (agregada, sessão 3) foi mantida como está — usada para os stat cards de totais e para ordenar as
  opções do seletor de empreendimento (por soma de diferença absoluta desc).
- Nenhuma `CREATE VIEW` nova, nenhum `ALTER TABLE` — todas as queries novas são `SELECT` puro sobre
  tabelas/views já existentes (regra da seção 0 do `AGENTS.md`).

### Filtro de período (estouro de custo) — preset simples, não intervalo livre

A pergunta 2 pedia filtro de período sobre `obra_andamento.mes_referencia`, com a instrução
explícita de "usar o padrão mais simples de implementar dado o tempo disponível". Implementado como
um `<select>` com 4 presets (Todo o período / Últimos 6 / 12 / 24 meses), calculado contra a data
corrente do sistema (`new Date()`) e comparado por string lexicográfica contra `mes_referencia`
(formato `'YYYY-MM-01'`, já ordenável como string) — sem biblioteca de data nova. Descartada a opção
de intervalo livre (dois seletores De/Até) por custar mais tempo de implementação sem ganho
perceptível para o prazo desta sessão.

### Gráficos — shadcn/ui chart + recharts (nova dependência)

`components/ui/chart.tsx` instalado via `pnpm dlx shadcn@latest add chart` (wrapper padrão do
catálogo shadcn — `ChartContainer`/`ChartTooltip`/`ChartConfig`, tema já usa as variáveis
`--chart-1`..`--chart-5` existentes em `app/globals.css`). Isso trouxe `recharts@3.8.0` como
**dependency real** do projeto (não dev — os gráficos rodam no client, em produção). O instalador
tentou sobrescrever `components/ui/card.tsx` (já customizado neste projeto); respondido "não" à
sobrescrita — só `chart.tsx` foi criado, `card.tsx` ficou intacto (confirmado via diff antes de
prosseguir).

Só bar chart (`BarChart`/`Bar`) e area chart (`AreaChart`/`Area`) foram usados, conforme decisão
explícita da sessão — radar e radial não têm dado compatível com nenhuma das 4 perguntas e não
foram introduzidos em nenhuma tela:

- **Pergunta 1** (velocidade): duas seções de bar horizontal (`layout="vertical"` no recharts) —
  "3 piores" (cor `--destructive`) e "3 melhores" (cor `--accent`), cada uma recalculada sobre o
  subconjunto filtrado, com `.slice(0, 3)` (nunca quebra se o filtro reduzir a menos de 3
  empreendimentos). Ressalva sobre a métrica não ser normalizada por tempo desde o lançamento fica
  visível acima de ambas as seções, não só da pior.
- **Pergunta 2** (estouro de custo): bar duplo horizontal, duas barras por empreendimento
  (magnitude bruta / desvio líquido de referência), top-5 (confirmado contra a seção 9 antes de
  fixar o corte — já era top-5 desde a sessão 3, não top-3). Cume Tower é forçado a aparecer no
  conjunto exibido sempre que estiver presente no subconjunto filtrado (mesmo fora do top-5
  nominal), porque é a evidência textual da regra B3; se o filtro excluir o empreendimento de fato
  do subconjunto, o texto de apoio troca para uma frase genérica sem citar o projeto — nunca cita
  um caso ausente dos dados filtrados atuais.
- **Pergunta 4** (divergência financeira): area chart, eixo X = `mes_referencia`, duas séries
  sobrepostas (`resultado_reportado`/`resultado_recalculado`, sem `stackId`, sobrepostas de
  propósito para tornar visível onde as áreas não coincidem). Seletor de empreendimento é estado
  local só deste gráfico (`useState`, não afeta as perguntas 1/2/3) — sem seleção nenhuma no estado
  inicial, gráfico começa vazio (nem default, nem o de maior divergência), conforme pedido.

### Pergunta 3 (duplicidade de cliente) — sem mudança de lógica, só de apresentação

Nenhum filtro (regra explícita: retrato global independente dos filtros das outras 3 perguntas).
Reaproveita `classificarGruposDedup`/`chaveDedup` de `lib/features/clientes/dedup.ts` sem nenhuma
lógica nova — só a apresentação em `duplicidade-cliente-section.tsx` mudou: stat cards explícitos
para os 4 números pedidos (97 grupos; 89 alta / 8 baixa confiança; clientes compradores únicos;
ticket médio), confirmados contra o banco real via script ad-hoc antes de considerar a sessão
concluída (**1.440** clientes / **R$ 3.167.271,61** de ticket médio — bate exatamente com a regra
B4 de `docs/regras-de-negocio.md`, o número histórico de 1.436/R$3.176.094,10 nunca é renderizado
na tela). Prosa de explicação de método expandida para cobrir explicitamente por que e-mail sozinho
não serve como sinal geral de dedup nesta base (gerado a partir do próprio ID do cliente, garante
unicidade artificial mesmo entre prováveis duplicatas reais) — esse ponto já estava documentado em
`docs/regras-de-negocio.md` B4, mas não estava na prosa visível da UI antes desta sessão.

### Validação mobile-first e acessibilidade — Playwright ad-hoc

Chrome DevTools via extensão MCP não honrou o resize de viewport neste ambiente (testado 2x, sem
efeito — screenshot sempre voltava à resolução desktop real da janela) — descartada essa rota após
a tentativa falhar de forma consistente, conforme orientação de não insistir em ferramenta de
browser que não responde como esperado. Validação refeita via Playwright ad-hoc (`npx
playwright@1.62.1 test`, spec temporário dentro de `tests/e2e/` só durante a execução, removido ao
final — não commitado, conforme exceção da seção 2 do `AGENTS.md`):

- **Mobile (390×844)**: `document.body.scrollWidth` = `window.innerWidth` exatos (390px) — sem
  overflow horizontal. Filtros empilham em coluna única, cards e gráficos legíveis (confirmado por
  screenshot).
- **Desktop (1280px)**: mesma checagem de largura, sem quebra.
- **Acessibilidade básica**: todos os `<select>` de filtro (cidade/UF/tipo/período/empreendimento)
  resolvidos via `getByLabel` do Playwright (só resolve com associação real `<Label htmlFor>` ↔
  `<select id>`), navegação por teclado testada (foco + `ArrowDown` mudando o valor selecionado).

Fluxo completo também conferido manualmente via Chrome MCP (fora do viewport mobile, já que o
resize não funcionou): login com `candidato@cambara-teste.com.br`, os 4 gráficos renderizando com
os números esperados, seleção de empreendimento no gráfico de divergência mostrando a série
temporal com a divergência visualmente aparente entre as duas áreas.

### Escopo não tocado, conforme instruído

Assistente de linguagem natural (`/assistente`) e camada de escrita (`/vendas`, distratos) não
foram tocados nesta sessão. Havia uma alteração pré-existente não commitada em
`app/(dashboard)/vendas/page.tsx` no início da sessão (fora do escopo desta sessão) — não mexida,
deixada como estava encontrada.

## 14. Sessão 7 — Correções na camada de escrita (04/09/2026)

Escopo: 3 itens em `/vendas` e `/vendas/novo` — busca de cliente existente, aviso de duplicidade no
cadastro de cliente novo (reversão da regra C6), e verificação do fluxo de distrato. Nenhuma
mudança de schema/dado fora do fluxo normal da aplicação (regra da seção 0 do `AGENTS.md`).

### Item 1 — busca de cliente: bug não reproduzido

A tarefa pedia diagnóstico do campo "Buscar cliente por nome" em `/vendas/novo` (aba "Cliente
existente"), reportado como "não filtra a lista". Diagnóstico feito lendo o código
(`lib/features/vendas/hooks/use-venda-form.ts`, `clientesFiltrados` via `useMemo` +
`normalizarTexto`) e, principalmente, testando ao vivo no navegador (`pnpm dev` + Chrome
automation) contra o banco de trabalho real:

- Busca parcial ("Adler Castro" → só os 2 "Adler Castro — Belém"): funcionou.
- Case/acento-insensível ("natalia" → todas as "Natália ..."): funcionou.
- Substring no meio do nome ("astro" → "Adler Castro"): funcionou.
- Termo sem correspondência (`"zzzznaoexiste"`) → lista vazia (nunca volta a lista cheia):
  funcionou.

**Conclusão: nenhum bug reproduzido.** `git diff main` para os arquivos envolvidos (`dedup.ts`,
`use-venda-form.ts`, `venda-form.tsx`) estava vazio no início da sessão — o código já filtra
corretamente desde o commit original da feature (sessão 2). Nenhuma alteração foi feita neste item.
Hipótese mais provável: o relato do bug antecede este estado do código, ou descreve um sintoma não
reproduzido nas condições testadas. Se o problema persistir na prática, precisa de um passo a passo
exato de reprodução (navegador, digitação lenta vs. colar texto, etc.) para investigar de novo —
não há indício de causa raiz no código atual.

### Item 2 — reversão da regra C6: aviso de duplicidade não-bloqueante

Detalhe completo da regra em `docs/regras-de-negocio.md`, C6 (marcada como revertida com a data de
hoje, texto original preservado riscado). Resumo técnico da implementação:

- `lib/features/vendas/hooks/use-venda-form.ts`: `handleSubmit` agora, quando `modoCliente ===
"novo"` e nome+cidade estão preenchidos, calcula `chaveDedup(nome, cidade)`
  (`lib/features/clientes/dedup.ts`, sem lógica nova) e filtra o array `clientes` (já carregado
  pelo Server Component, mesmo universo usado pela busca do item 1) por essa chave. Se houver
  correspondência, guarda em `duplicatasEncontradas` e **não** chama `submeter()` — o cadastro só
  segue se o usuário confirmar.
- Dois novos caminhos para o usuário resolver o aviso: `usarClienteExistente(cliente)` (troca
  `modoCliente` para `"existente"` e pré-seleciona o cliente encontrado) e `cadastrarMesmoAssim()`
  (chama `submeter()` diretamente, ignorando a checagem — não bloqueia).
- `duplicatasEncontradas` é limpo automaticamente ao editar nome/cidade/trocar de modo, para não
  deixar um aviso obsoleto na tela enquanto o usuário digita.
- Checagem só roda no submit (não live/debounced), conforme pedido — sem round-trip HTTP, sem
  chamada ao backend; puramente client-side contra os dados já carregados.
- Nenhuma alteração no schema, na rota `POST /api/vendas` ou na transação de escrita
  (`registrarVendaTx`, `lib/features/vendas/repository.ts`) — o aviso é só uma camada de UX antes
  do submit, o backend continua sem checagem de duplicidade (mesma decisão de sempre, ver C6).

**Teste manual com duplicata real da base**: usado o par "Adler Castro — Belém" (dois registros
pré-existentes na base, ids 2693/2694 — descoberto ao consultar `clientes` diretamente contra o
banco de trabalho). Preenchendo "Cliente novo" com nome="Adler Castro", cidade="Belém": o aviso
apareceu listando os 2 clientes existentes, com os botões "Usar este cliente" (por cliente) e
"Cadastrar mesmo assim" (geral) — confirmado não-bloqueante, os dois caminhos disponíveis e nenhuma
chamada à API disparada antes da confirmação.

### Item 3 — fluxo de distrato: verificado correto, nenhum bug encontrado

Trace via UI real (não SQL manual): registrada uma venda de teste (unidade "Alto Amazônia — Torre B

- 0801", cliente "Adler Castro", R$500.000,00, À vista) em `/vendas/novo`, depois distratada pelo
  botão "Distratar" em `/vendas`. Confirmado:

- A venda distratada some da listagem de "vendas ativas" imediatamente após o distrato (a listagem
  já usa `v_vendas_norm` filtrando `status_canonico = 'ativa'`, conforme o repositório — não é uma
  tabela separada de ativas/distratadas, que é escopo de sessão futura).
- A unidade volta a aparecer no seletor de `/vendas/novo` ("Alto Amazônia — Torre B - 0801" reapareceu
  na lista de unidades disponíveis).
- Confirmado direto no banco de trabalho: `unidades.status = 'disponivel'` e
  `vendas.status_venda = 'distrato'` com `data_distrato` preenchida para a venda de teste — bate
  exatamente com o padrão documentado na seção 5.

**Nenhum bug encontrado — nenhuma correção necessária.** Nota operacional: o teste deixou 1 par
venda+distrato de dados sintéticos no banco de trabalho (`data/cambara_teste_tecnico.db`), criado
via o fluxo normal da aplicação (não é alteração manual de dado, não está sujeito à regra da seção
0). Se for indesejado antes da apresentação de 08/09, o procedimento de reset para a cópia pristina
já está documentado no README, seção "Operação/Runbook".

### Verificação de qualidade

`tsc --noEmit`, `next lint`, `prettier --check .` e `next build` rodados após as alterações do item
2 — únicas alterações de código desta sessão (itens 1 e 3 não precisaram de mudança). Sem teste
automatizado novo persistido para os itens 1/2, conforme escopo definido para esta sessão — só o
teste E2E de venda/distrato já existente (`tests/e2e/vendas-distratos.spec.ts`) continua cobrindo o
fluxo completo.

---

## 15. Sessão 8 — Vendas: gráficos, tabelas separadas, busca e filtros (04/09/2026)

Escopo: telas `/vendas` (listagem) e `/vendas/novo` (busca de unidade), conforme instrução da
sessão — dashboard analítico, assistente de LN e autenticação não tocados; lógica de dedup (regra
C6) e guard de disponibilidade não reabertos. Nenhuma mudança de schema/dado fora do fluxo normal
da aplicação (regra da seção 0 do `AGENTS.md`). Detalhamento funcional completo no README, seção
"Camada de escrita" → "Listagem de vendas — gráficos, tabelas separadas, busca e filtros" — este
registro aqui foca no que é `log-tecnico` (achados técnicos, decisões de implementação, histórico).

### Dependências novas

- `sonner` (toast) instalado via `pnpm dlx shadcn@latest add sonner` — não sobrescreveu nada
  (arquivo novo, `components/ui/sonner.tsx`).
- `chart` (shadcn/ui, wrapper de `recharts`) via `pnpm dlx shadcn@latest add chart` — o CLI tentou
  sobrescrever `components/ui/card.tsx` (customizado com o tema grafite+dourado desde a sessão de
  scaffolding); recusado (`overwrite? n`), mesmo cuidado já demonstrado com `card.tsx` em sessão
  anterior. `components/ui/chart.tsx` (novo) instalado normalmente. Isso adicionou `recharts` como
  dependency real do projeto (`package.json`) — necessário para os dois donuts pedidos, não havia
  biblioteca de gráfico no projeto antes desta sessão.

### Achado técnico — bug de renderização no `recharts@3.8.0`, resolvido com upgrade para `3.10.1`

A versão instalada automaticamente pelo CLI do shadcn (`recharts@3.8.0`, a mais recente disponível
no registry do shadcn no momento) nunca renderizava nenhum setor visível de `<Pie>` — os dois
donuts apareciam como card vazio (só título, legenda e texto de rodapé, nenhuma fatia visível).

**Investigação** (relevante para quem for depurar algo parecido no futuro, não só um "funcionou
depois de trocar a versão"):

1. Descartado como causa: tamanho do container (`ChartContainer`/`ResponsiveContainer` mediam
   corretamente 256×256px via `getBoundingClientRect()`), StrictMode do React 19/Next.js (bug
   reproduzido igualmente em `next build && next start`, sem StrictMode), múltiplos `<PieChart>` na
   mesma página colidindo por `id` (testado com um único `<Pie>`, sem `ChartContainer`, sem `Cell`,
   sem tooltip/legend, com `cx`/`cy`/`width`/`height` fixos — mesmo resultado vazio).
2. Inspecionado o estado Redux interno do `recharts` direto no navegador (`recharts@3.x` usa
   `@reduxjs/toolkit` internamente, um store por instância de `<PolarChart>` via `useRef`, não
   compartilhado entre charts — descartando colisão de estado entre os dois donuts). Acessado via
   fiber do React a partir do nó `<svg>` (`el['__reactFiber$...']`, subindo `.return` até achar
   `memoizedProps.store`), depois `store.getState().graphicalItems.polarItems`: o item chegava
   registrado **corretamente** (`id`, `type: "pie"`, `dataKey: "total"`, `data.length` certos).
3. Rastreado até `computePieSectors` (`node_modules/recharts/es6/polar/Pie.js`): calcula
   `sum = displayedData.reduce(...)` e só produz `sectors` `if (sum > 0)` — caso contrário retorna
   `undefined`, e `PieImpl` trata `sectors == null` como "não renderizar nada" (`<Layer />` vazio).
   Como o item registrado no store already tinha `dataKey`/`data` corretos, o problema estava em
   algum lugar entre a leitura do store (`selectPieSectors`, seletor memoizado via `reselect`) e o
   cálculo de `sum` — não foi isolado além disso porque o teste seguinte (upgrade de versão) já
   resolveu o sintoma.
4. `npm view recharts versions` mostrou patches mais recentes na mesma major (`3.9.x`, `3.10.x`,
   `3.11.0-canary`) além do `3.8.0` que o shadcn instalou. `pnpm add recharts@3.10.1` (última
   estável na época) resolveu o problema imediatamente — mesmo código, mesma composição
   (`ChartContainer` + `Pie` + `Cell` + tooltip + legend), donuts renderizando corretamente tanto em
   `next dev` quanto em `next build && next start`.

**Conclusão**: bug de uma versão específica do pacote `recharts` (`3.8.0`), não do código desta
aplicação nem de alguma peculiaridade do Next.js 16/Turbopack/React 19 deste projeto — corrigido
fixando a versão em `3.10.1` (`package.json`). Registrado aqui para não ser redescoberto: se um
bump futuro de `recharts` reintroduzir o sintoma (card de gráfico vazio, sem erro no console),
verificar `store.getState().graphicalItems.polarItems` no navegador antes de assumir erro de
composição do código próprio.

### Paleta de cores dos gráficos (`app/globals.css`)

Os tokens `--chart-1`..`--chart-5` existiam desde o scaffolding do tema (comentário original:
"Cores de chart/radius não foram tocadas — fora do escopo desta sessão, não há dashboards ainda"),
mas com valores grayscale placeholder do shadcn default, nunca usados por nenhum componente até
esta sessão. Substituídos por um mapeamento fixo por significado de negócio (não union, direto no
`:root`/`.dark`): `chart-1` = vendida/ativa (reaproveita o hue do `--primary`, grafite-azulado),
`chart-2` = distrato (mesmo valor do `--destructive`), `chart-3` = disponível (hue do `--accent`,
dourado), `chart-4` = reservada (cinza-azulado neutro, tom intermediário entre `--muted-foreground`
e `--foreground`). `chart-5` mantido no valor grayscale original (não usado nesta sessão — só 4
categorias de status existem).

### `data-testid` da tabela de distratadas — decisão deliberada, não descuido

A tabela de distratadas (`vendas-distratadas-list.tsx`) usa `data-testid="distrato-<id>"`, não
`"venda-<id>"` como a tabela de ativas. Motivo: o teste E2E persistido
(`tests/e2e/vendas-distratos.spec.ts`) distrata uma venda e imediatamente verifica
`getByTestId("venda-<id>").toHaveCount(0)` — se a linha da venda recém-distratada (que passa a
existir na tabela de distratadas após o distrato) reusasse o mesmo prefixo `"venda-"`, essa
asserção quebraria (a contagem não seria mais 0). Verificado rodando o teste persistido depois da
mudança — passou.

### Verificação de qualidade

`tsc --noEmit`, `pnpm lint` (eslint), `pnpm format:check` (prettier) e `pnpm build` (produção,
Turbopack) — todos limpos após a implementação e após o upgrade do `recharts`. Teste E2E persistido
(`pnpm test:e2e`) rodado múltiplas vezes ao longo da sessão (logo após a implementação inicial da
listagem, depois de corrigir a colisão de label com o campo de busca de unidade — ver abaixo — e na
verificação final) — passou em todas as execuções que chegaram a rodar contra o servidor de
verdade; uma tentativa intermediária falhou **antes** de criar qualquer dado (falhou no primeiro
passo, `selectOption` da Unidade, por causa da colisão de label corrigida logo em seguida — ver
"Dado sintético deixado no banco de trabalho" abaixo para a contagem real de registros criados).

Validação manual ad-hoc (Playwright, viewport 390×844 e 1512×793, spec descartado ao fim da sessão,
conforme `AGENTS.md` seção 2): busca por cliente, busca por empreendimento, filtro de forma de
pagamento combinado com busca (AND), filtro de intervalo de data de venda combinado com os
anteriores (AND), filtro de intervalo de data de distrato isolado, "Limpar filtros", busca de
unidade em `/vendas/novo` (912 opções sem filtro, 95 com "Cume Tower", 1 — só o placeholder — com
termo sem correspondência), e confirmação visual de que os dois donuts renderizam com as
proporções corretas em mobile e desktop.

**Bug encontrado e corrigido durante a validação manual**: o campo de busca de unidade em
`/vendas/novo` foi rotulado inicialmente "Buscar unidade" — como `getByLabel` do Playwright faz
correspondência por substring (não exata) por padrão, esse rótulo colidia com
`getByLabel("Unidade")` do teste E2E persistido (`"unidade"` é substring de `"Buscar unidade"`),
quebrando `selectOption` no teste (`strict mode violation: resolved to 2 elements`). Renomeado para
"Buscar por identificador ou empreendimento" (sem a palavra isolada "unidade" seguida do padrão que
colide) — teste voltou a passar.

### Dado sintético deixado no banco de trabalho

Banco de trabalho confirmado pristino no início desta sessão (2.206 vendas, 2.691 clientes, 3.300
unidades — bate exatamente com os números documentados nas seções anteriores; nenhum cliente
sintético óbvio tipo "Adler Castro" duplicado encontrado, então o leftover de 1 par venda+distrato
registrado na sessão 6 já tinha sido limpo por um reset anterior a esta sessão). As execuções do
teste E2E persistido nesta sessão (`pnpm test:e2e`) criaram **3 registros novos** em `vendas` (ids
`2207`, `2208` e `2209`, confirmado via query direta contra o banco de trabalho ao final da sessão)
— cada uma um par venda+distrato sintético para a unidade `id = 4` ("Torre A - 0104") com o cliente
`id = 1` ("Ursula Ferreira Ferreira"). O teste é seguro para rodar em sequência (distrata a própria
venda que cria, devolvendo a unidade a `disponivel`), mas cada execução bem-sucedida deixa um
registro histórico novo (a venda anterior já fica com `status_venda = 'distrato'`, não é
sobrescrita) — total de vendas no banco de trabalho ao final: 2.209. Se indesejado antes da
apresentação de 08/09, o
procedimento de reset para a cópia pristina está documentado no README, seção "Operação/Runbook" —
não executado nesta sessão (decisão
de reset é do humano, não automática).

---

## 16. Sessão 9 — Vendas: campo perfil obrigatório, tabs e tabela de unidades (04/09/2026)

Escopo: 3 itens em `/vendas` e `/vendas/novo` — campo "Perfil" obrigatório no cadastro de cliente
novo, refatoração das duas tabelas de vendas para um componente de tabs, e nova tabela de unidades
(filtro por status + busca por identificador). Dashboard analítico, assistente de LN e autenticação
não tocados; busca de cliente, aviso de duplicidade (C6), guard de venda/distrato e os dois donuts
não reabertos. Nenhuma `CREATE VIEW`/`ALTER TABLE`/dado fora do fluxo normal da aplicação (regra da
seção 0 do `AGENTS.md`).

### Item 1 — `perfil` obrigatório, enum validado contra o banco antes de fixar

Antes de tocar em código: `SELECT DISTINCT perfil, COUNT(*) FROM clientes GROUP BY perfil` contra
`data/cambara_teste_tecnico.db` (mesmo padrão de cautela já usado para `forma_pagamento`, regra
C4 — não assumir o enum, confirmar). Resultado: exatamente os 3 valores esperados, sem variação de
grafia (`Morador`: 1.550, `Investidor`: 911, `Institucional`: 230), mais 1 cliente pré-existente
com `perfil IS NULL` (não corrigido retroativamente — regra C7 de
`docs/regras-de-negocio.md`, mesmo trade-off já aplicado a `cidade` na regra C5).

- `lib/features/vendas/schema.ts`: novo `perfilEnum = z.enum(["Morador", "Investidor",
"Institucional"], "Perfil é obrigatório.")` — mensagem custom em português, mesmo padrão das
  demais mensagens do schema (zod v4, segundo parâmetro de `z.enum()` aceita string como mensagem
  de erro). `clienteNovoSchema.perfil` passou de `z.string().trim().optional()` para `perfilEnum`
  (obrigatório).
- `lib/features/vendas/repository.ts` (`registrarVendaTx`): `c.perfil ?? null` → `c.perfil` (o
  tipo já garante presença via Zod, `?? null` ficou redundante).
- `lib/features/vendas/hooks/use-venda-form.ts`: novo estado `clienteNovoPerfil` +
  `setClienteNovoPerfil`, incluído no payload de `clienteNovo` no submit.
- `app/(dashboard)/vendas/novo/venda-form.tsx`: novo `<Select>` "Perfil" na aba "Cliente novo",
  posicionado depois de "Cidade" e antes de "UF (opcional)" (mesma hierarquia visual de
  obrigatório-antes-de-opcional já usada no formulário).
- Validado manualmente via navegador contra o banco de trabalho real: submissão sem selecionar
  Perfil bloqueia com a mensagem "Perfil é obrigatório." (sem round-trip ao servidor — validação
  Zod client-side, mesmo padrão dos demais campos obrigatórios); submissão com "Investidor"
  selecionado registrou a venda com sucesso e o valor gravado em `clientes.perfil` foi confirmado
  via query direta contra o banco (`Investidor`, cliente id 2693) — write-path correto de ponta a
  ponta. Fluxo "Cliente existente" não foi tocado nem re-testado (fora do escopo do item 1, não
  reaberto).

### Item 2 — tabs (shadcn/ui `Tabs`, `@base-ui/react/tabs`)

`pnpm dlx shadcn@latest add tabs` — nenhum conflito de overwrite (`components/ui/tabs.tsx` é
arquivo novo, mesmo padrão de cautela já usado para `chart`/`sonner` em sessão anterior, onde o
CLI tentou sobrescrever `card.tsx` e foi recusado). O componente gerado segue o mesmo padrão de
`button.tsx` (wrapper fino sobre a primitiva `@base-ui/react`, `data-slot`, `cn()`), incluindo
`Tabs.Panel` com `keepMounted` default `false` (painel inativo desmonta do DOM) — sem impacto no
teste E2E persistido, que só interage com a aba "Vendas ativas" (ativa por padrão via
`defaultValue="ativas"`).

- `app/(dashboard)/vendas/vendas-dashboard.tsx`: as duas `<Card>` empilhadas ("Vendas ativas" /
  "Vendas distratadas") viraram uma única `<Card>` contendo `<Tabs defaultValue="ativas">` com
  `TabsList` (`className="w-full"`, cada `TabsTrigger` com `className="flex-1"` para ocupar a
  largura toda — mesmo padrão já usado no par de botões "Cliente existente"/"Cliente novo" de
  `venda-form.tsx`) e dois `TabsContent` (`VendasAtivasList`/`VendasDistratadasList`, inalterados
  internamente — busca/filtros client-side continuam funcionando exatamente como antes, só o
  container visual mudou).
- **Os dois donuts não foram tocados** (`vendas-charts.tsx` não foi editado nesta sessão) —
  continuam calculados sobre `vendas`/`unidadesPorStatus` (universo completo carregado no
  servidor), renderizados antes das tabs na árvore, sem qualquer prop nova ou reordenação que
  pudesse acoplá-los à aba selecionada.
- **Achado não relacionado a esta sessão, não corrigido**: os dois donuts renderizam a legenda e o
  texto de rodapé (ex.: "2082 de 2211 vendas ativas no total.") mas **nenhum setor visível de
  `<Pie>`** no navegador usado para validação desta sessão — inspecionado via
  `document.querySelectorAll('svg.recharts-surface path')`, retornando array vazio (nenhum `<path>`
  dentro do SVG, todos os `<g>` de camada do recharts vazios). Reproduzido de forma idêntica após
  `git stash` do diff completo desta sessão (voltando ao HEAD do commit anterior, sem nenhuma
  alteração de código desta sessão) — **confirmado pré-existente, não é regressão introduzida
  aqui**. `recharts` continua pinado em `3.10.1` (`package.json`, sessão 7), então não é o mesmo
  bug de versão já documentado e corrigido naquela sessão; causa raiz não investigada a fundo
  (fora do escopo desta sessão, que não deveria tocar em `vendas-charts.tsx`/donuts) — possível
  hipótese não confirmada: diferença de ambiente do navegador de automação usado para validação
  desta sessão (headless/Chrome DevTools Protocol) versus o navegador interativo normal usado na
  sessão 7, mas não testado contra um navegador comum para descartar. Sinalizado para
  investigação futura caso o avaliador note o mesmo sintoma na apresentação de 08/09.

### Item 3 — nova tabela de unidades (somente leitura)

- `lib/features/unidades/repository.ts`: nova interface `UnidadeListagemItem` (`id`,
  `identificador`, `tipo`, `area_privativa_m2`, `valor_tabela`, `empreendimento_id`,
  `empreendimento_nome`, `status_canonico`) e `listarUnidadesParaListagem()` — `SELECT` direto de
  `v_unidades_norm` (view já existente, nenhuma view nova) `JOIN empreendimentos`, sem filtro de
  status (universo completo, as 3.300 unidades).
- `lib/features/unidades/hooks/use-unidades-listagem.ts` (novo): viewmodel client-side — busca por
  identificador (reaproveita `normalizarTexto`, mesma função de `lib/features/clientes/dedup.ts`
  já usada nas outras buscas da aplicação) + filtro por `status_canonico`, `useMemo`, sem
  round-trip HTTP, mesmo padrão de `use-vendas-listagem.ts`.
- `app/(dashboard)/vendas/unidades-list.tsx` (novo): `Card` com filtro (busca + `<Select>` de
  status) e tabela/cards mobile-first — mesmas classes de altura fixa + scroll interno
  (`max-h-112 overflow-y-auto md:hidden` / `hidden max-h-128 overflow-y-auto md:block`, sticky
  `thead` no desktop) já usadas em `vendas-ativas-list.tsx`/`vendas-distratadas-list.tsx`, sem
  nenhuma ação (somente leitura — venda/distrato continuam exclusivos de `/vendas/novo` e dos
  botões "Distratar" das tabs). Coluna "Unidade" sempre `{empreendimento} — {identificador}`,
  nunca o identificador isolado (`unidades.identificador` não é único globalmente,
  `docs/log-tecnico-decisoes.md` seção 5).
- `app/(dashboard)/vendas/page.tsx`: nova chamada `listarUnidadesParaListagem()`, prop `unidades`
  repassada para `VendasDashboard` → `UnidadesList`.
- Validado manualmente contra o banco de trabalho real: "Unidades (3300 de 3300)" no estado
  inicial (confirma o volume completo carregado, sem paginação server-side); busca por "0101"
  reduziu para 22 linhas instantaneamente (client-side, sem chamada de rede); filtro de status
  "Vendida" reduziu para 2082 linhas — **exatamente o mesmo número de "Vendas ativas" da aba ao
  lado** (2082), consistência esperada (cada venda ativa corresponde a exatamente 1 unidade
  vendida). Rolagem testada dentro do container (`overflow-y-auto`) com as 3.300 linhas
  renderizadas sem paginação/virtualização — aceitável para este volume, mesmo padrão já usado
  para as 2.206/2.212 vendas; sem lentidão perceptível na interação de scroll/filtro durante a
  validação.

### Verificação de qualidade

`tsc --noEmit`, `pnpm lint`, `pnpm format:check` (após `prettier --write` nos 4 arquivos que o CLI
do shadcn/a formatação inicial deixou fora do padrão do projeto — `venda-form.tsx`,
`unidades-list.tsx`, `components/ui/tabs.tsx`, `use-unidades-listagem.ts`) e `pnpm build` — todos
limpos. Teste E2E persistido (`pnpm test:e2e`) rodado após a refatoração de tabs — passou,
confirmando que a mudança de container visual (duas `Card` → uma `Card` com `Tabs`) não quebrou
`getByTestId("venda-<id>")` nem o fluxo de venda/distrato ponta a ponta. Nenhuma colisão de label
nova: o campo "Perfil" (novo) e "Buscar unidade por identificador"/"Status" (tabela de unidades, só
existe em `/vendas`, página que o teste E2E não usa `getByLabel`) não colidem com nenhum
`getByLabel` do teste persistido (`Unidade`, `Valor da venda (R$)`, `Forma de pagamento`, `Buscar
cliente por nome`, `Cliente` exato).

**Achado não relacionado, pré-existente, não corrigido**: durante a validação manual, o overlay de
dev do Next.js acusou 1 warning (não erro de build/lint/tsc) — `Base UI: A component that acts as
a button expected a native <button>...`, originado em `components/ui/button.tsx:50` via o `Button`
com `render={<Link href="/vendas/novo" />}` de `app/(dashboard)/vendas/page.tsx` (linha do "Nova
venda"). Confirmado pré-existente via o mesmo `git stash` usado para investigar o achado dos
donuts — reproduz idêntico no HEAD anterior a esta sessão. Não corrigido (fora do escopo dos 3
itens pedidos, e mexer em `button.tsx` cruzaria fronteira de domínio sem necessidade).

### Dado sintético deixado no banco de trabalho

Não foi confirmado se o banco de trabalho estava pristino no início desta sessão (checagem
omitida — para a próxima sessão, confirmar as contagens de referência, 2.206 vendas/2.691
clientes/3.300 unidades, antes de iniciar validação manual). No primeiro carregamento de `/vendas`
desta sessão (antes de qualquer ação desta sessão) já havia 1 par venda+distrato sintético
pré-existente para "Adler Castro" (unidade `id = 4`, valor R$100.320.004,00, `Parcelado Direto`) —
não criado por esta sessão, presumivelmente leftover de uma sessão anterior não documentado. Duas
novas fontes de escrita nesta sessão, ambas via o fluxo normal da aplicação:

1. `pnpm test:e2e` — rodado 2 vezes nesta sessão (verificação intermediária após a refatoração de
   tabs, e verificação final desta seção) — criou 2 pares venda+distrato sintéticos (mesmo padrão
   das sessões anteriores) para a unidade `id = 4` com o cliente `id = 1` ("Ursula Ferreira
   Ferreira").
2. Validação manual do campo Perfil (item 1) criou 1 cliente novo (`id = 2693`, "Fulano Teste
   Sessao8", `cidade = "Cidade Teste"`, `perfil = "Investidor"`) e 1 venda para a mesma unidade
   `id = 4` — distratada manualmente ao final do teste (botão "Distratar" na UI), unidade
   devolvida a `disponivel`, confirmado antes do fim da sessão.

Total de vendas no banco de trabalho ao final: 2.213 (2.206 originais + 1 leftover pré-existente +
2 do E2E + 1 do teste manual do item 1), todas em `status_venda = 'distrato'`, nenhuma unidade
presa como indisponível por conta de dado desta sessão. Se indesejado antes da apresentação de
08/09, o procedimento de reset para a cópia pristina está documentado no README, seção
"Operação/Runbook" — não executado nesta sessão (decisão de reset é do humano, não automática).

---

## 17. Sessão 10 — Home redirecionada, formato de data dos filtros, auditoria final (04/09/2026)

Escopo: 3 itens, todos leitura/UI/documentação, nenhum tocando `/analitico`, assistente de LN,
autenticação ou lógica de venda/distrato (regra da sessão) — nenhuma escrita no banco.

### Item 1 — remoção da home como página própria

`app/(dashboard)/page.tsx` substituído por um Server Component que só chama
`redirect("/analitico")` (`next/navigation`), sem estado de loading. Link "Cambará" da navbar
(`app/(dashboard)/layout.tsx`) atualizado de `href="/"` para `href="/analitico"`, evitando o hop
de redirect na navegação normal. Confirmado (grep em `app/` e `lib/`) que nenhum outro link
"Home" separado de "Cambará" depende da página antiga, e que nenhuma outra rota assume que `/`
renderiza conteúdo próprio.

**Achado não corrigido, fora de escopo**: `lib/features/auth/hooks/use-login.ts` faz
`router.push("/")` após login bem-sucedido — continua funcionando (passa pelo redirect novo até
`/analitico`), mas com o mesmo tipo de hop extra que o link da navbar evitou. Não ajustado porque
o arquivo pertence ao domínio de autenticação, explicitamente fora de escopo desta sessão
("NÃO tocar em... autenticação"). Sinalizado aqui para uma sessão futura que tenha autenticação em
escopo.

Validado no navegador (`pnpm dev`, sessão de login já ativa): `http://localhost:3000/` resolve
para `http://localhost:3000/analitico` (`window.location.href` confirmado via console), e o link
"Cambará" no DOM já aponta para `/analitico` (`document.querySelector('a[href="/analitico"]')`).

### Item 2 — formato de data dos filtros (`/vendas`)

Diagnóstico: os filtros de intervalo de data de venda/distrato (`app/(dashboard)/vendas/
vendas-filtros.tsx`) usam `<Input type="date">` (wrapper fino de `@base-ui/react/input` sobre o
`<input>` nativo do navegador, `components/ui/input.tsx`) — não um datepicker de terceiros com
locale configurável via prop.

Conforme a orientação da sessão para esse caso (formato do picker nativo não é controlável de
forma confiável via CSS/JS): **não foi feita nenhuma tentativa de forçar o widget nativo**.
Verificado que `<html lang="pt-BR">` já está presente em `app/layout.tsx` desde o scaffolding do
projeto (não é uma alteração desta sessão) — mas o teste no navegador desta sessão (Chrome, UI em
inglês; `navigator.language` e `document.documentElement.lang` ambos `"pt-BR"`) mostrou que o
picker nativo em `/vendas` continua exibindo `mm/dd/yyyy` como placeholder, mesmo com o `lang`
correto na página. Conclusão confirmada contra o comportamento real: o formato de exibição do
calendário nativo do Chrome segue o idioma da interface do navegador/SO, não o atributo `lang` da
página nem `navigator.language` — o `lang="pt-BR"` já aplicado não é garantia de correção em todo
ambiente, exatamente como a ressalva original desta regra antecipava.

Nenhum texto formatado manualmente precisou de correção: os 4 campos de data dos filtros
(`vendas-filtros.tsx`) não têm nenhuma exibição de texto separada do próprio `<input>` (o valor
`YYYY-MM-DD` só alimenta comparação client-side em `use-vendas-listagem.ts`, nunca é renderizado
como texto). A coluna "Data" das tabelas de vendas (`vendas-ativas-list.tsx`,
`vendas-distratadas-list.tsx`) já usa `new Date(iso).toLocaleDateString("pt-BR")` (dd/mm/yyyy)
desde sessões anteriores — não precisou de nenhuma alteração, apenas confirmado que já segue o
padrão correto e que não há relação entre essa formatação e o placeholder do widget de filtro.

**Resultado**: nenhuma alteração de código foi necessária ou possível para este item além do que
já existia (`lang="pt-BR"` já presente) — limitação documentada no README, seção "Limitações
conhecidas".

### Item 3 — auditoria de documentação

Verificação executada, nenhuma correção de conteúdo necessária (só a atualização desta seção 17 e
do item 10 da seção 9, e as duas entradas novas no README, ambas adições de documentação desta
sessão, não correções de erro):

- `docs/log-tecnico-decisoes.md`: `grep -n "^## "` confirma seções `## 1` a `## 16`, estritamente
  sequenciais, sem número repetido. Seção 9 (sequenciamento) lista os itens 0–10 em ordem
  cronológica correta: item 6 (dashboard analítico) antes do 7 (correções de escrita), antes do 8
  (gráficos de vendas), antes do 9 (perfil/tabs) — confirmado batendo com a ordem pedida.
- `docs/regras-de-negocio.md`: regra C6 está marcada `**REVERTIDA (04/09/2026)**`, com o texto
  original preservado riscado e a regra atual (aviso não-bloqueante) documentada com data e
  motivo. Regra C7 (`perfil` obrigatório) existe, com enum validado contra o banco
  (`Morador`/`Investidor`/`Institucional`). Números da regra B4 — `grep` por `1.436`/`3.176.094`
  no arquivo retorna uma única ocorrência, dentro da "Nota" que explica a divergência entre a
  política atual e o número histórico (contexto explicitamente permitido) — nenhuma menção solta
  fora desse contexto.
- `README.md`: a remoção da home (item 1) e a limitação do formato de data do picker nativo (item 2) **não estavam documentadas** antes desta sessão (não existiam menções a "Bem-vindo"/página
  inicial nem ao formato do date picker na seção "Limitações conhecidas") — adicionadas nesta
  sessão como parte da definição de "sessão concluída" (`AGENTS.md` seção 6), não como correção de
  erro pré-existente.

**Achado adicional, fora do escopo dos 3 checks pedidos, não corrigido**: a frase de abertura do
README ("Esta sessão (5, final) é de revisão e consolidação da documentação, sem código novo.",
linha 15) está desatualizada — refere-se à sessão 5, mas o projeto já passou pelas sessões 6–9 e
agora a 10. Não corrigido por não estar entre os 3 itens de auditoria pedidos explicitamente para
esta sessão, e por ser uma mudança de conteúdo (não erro óbvio de digitação) — sinalizado aqui para
confirmação humana antes de ajustar.

### Verificação de qualidade

`tsc --noEmit`, `pnpm lint` (eslint), `pnpm format:check` (prettier) e `pnpm build` — todos
limpos. Teste E2E persistido **não** rodado nesta sessão, conforme instrução explícita (evitar
sujar o banco de trabalho antes do reset final pré-apresentação) — os 3 itens desta sessão não
tocam a camada de escrita, então a cobertura do teste E2E não é afetada por nenhuma mudança feita
aqui.
