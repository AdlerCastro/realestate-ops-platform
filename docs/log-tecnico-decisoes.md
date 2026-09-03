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
- **Playwright** como ferramenta de sessão (`npx`, não devDependency) para validar
  responsividade/acessibilidade a cada feature — exceção: o fluxo de venda/distrato recebe teste
  E2E persistido e commitado (`tests/e2e/vendas-distratos.spec.ts`), dado ser o componente mais
  observado da avaliação. Versão do Playwright fixada no comando documentado no README, para
  reprodutibilidade.
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
5. **README final + revisão de limitações** — consolidação, não é sessão de código.

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
