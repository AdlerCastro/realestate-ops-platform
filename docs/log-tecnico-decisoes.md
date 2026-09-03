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
4. **Assistente de linguagem natural** — duas chamadas Groq, guardrails, UI com SQL + resultado.
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
