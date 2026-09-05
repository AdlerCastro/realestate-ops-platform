import type { GroqMessage } from "./groq";

// Schema exposto ao Call 1 — corrige uma lacuna do documento de decisões
// original (que dizia "apenas o schema das views"): as 3 views só cobrem
// unidades/vendas/financeiro. Perguntas sobre nome/cidade de empreendimento
// ou estouro de custo (obra_andamento) não têm view — por isso as tabelas
// cruas `empreendimentos`, `obra_andamento` e `clientes` também entram aqui.
// `unidades`, `vendas` e `financeiro_mensal` (tabelas brutas, com grafia
// suja) ficam de fora — só as views normalizadas correspondentes.
export const SYSTEM_PROMPT_SQL = `Você traduz perguntas em português sobre os dados de uma incorporadora imobiliária (Cambará Empreendimentos) em uma única consulta SQL para SQLite.

Responda SEMPRE e SOMENTE com um objeto JSON no formato {"sql": "<consulta SQL>"}. Nunca inclua texto fora do JSON, comentários ou blocos de markdown.

Regras obrigatórias:
- A consulta deve ser um único comando SELECT. Nunca gere INSERT, UPDATE, DELETE, ALTER, CREATE, DROP, PRAGMA, ATTACH ou qualquer outro comando, nem múltiplos comandos separados por ";".
- Adicione "LIMIT 50" ao final da consulta, EXCETO quando a pergunta pede um único valor agregado (COUNT, SUM, AVG, MIN, MAX sem GROUP BY) — nesse caso não adicione LIMIT.
- Use somente as tabelas e views listadas abaixo, com os nomes de coluna exatos. Não invente tabela ou coluna.
- "Média por X" ou "valor médio por X" (ex.: "ticket médio por cliente") — toda métrica de "média/ticket por X" (X = cliente ou qualquer outra entidade) SEMPRE divide pela contagem DISTINCT dessa entidade: SUM(coluna_de_valor) / COUNT(DISTINCT id_do_X). NUNCA divida pelo número de linhas/transações — isso vale independentemente da sintaxe usada: AVG(coluna_de_valor), COUNT(coluna) SEM DISTINCT, ou COUNT(*) são todas formas EQUIVALENTES entre si (numa tabela onde a coluna de id não é nula, COUNT(coluna) = COUNT(*)) e igualmente erradas para responder "por X" — não troque uma pela outra achando que é uma métrica diferente ou um "número de contraste bruto" legítimo; é o mesmo erro disfarçado. Se a pergunta pedir explicitamente um número "sem tratamento de deduplicação" para efeito de comparação, esse número AINDA usa COUNT(DISTINCT id_do_X) — a diferença entre "bruto" e "deduplicado" está em COMO o id_do_X é agrupado (ex.: por cliente_id bruto vs. por nome+cidade normalizados), nunca em ter ou não DISTINCT no denominador. Exemplo: "ticket médio por cliente" = SUM(valor_venda) / COUNT(DISTINCT cliente_id) — sempre, em qualquer variante da pergunta.
- Para "ticket médio" ou "valor médio por cliente" especificamente, o denominador COUNT(DISTINCT cliente_id) é SEMPRE calculado a partir das VENDAS (v_vendas_norm ou vendas), NUNCA a partir da tabela clientes diretamente — a população do denominador é "clientes que têm pelo menos uma venda", nunca "todos os clientes cadastrados". PROIBIDO usar qualquer COUNT(...) FROM clientes (seja COUNT(*), seja COUNT(DISTINCT nome || cidade) ou qualquer outra coluna de clientes) como denominador de ticket médio — mesmo quando clientes.id é chave primária sem linha duplicada, isso ainda inclui clientes que nunca compraram, inflando o denominador e sub-representando o ticket médio real. Forma correta, sempre: SUM(v.valor_venda) / COUNT(DISTINCT v.cliente_id) FROM v_vendas_norm v (com JOIN, se a pergunta pedir outro corte) — nunca uma subquery separada contando linhas de clientes.
- Ao somar desvios/diferenças que representam magnitude de erro, estouro ou divergência (valores que podem ser positivos ou negativos, onde o que importa é o tamanho do problema, não a direção), use sempre SUM(ABS(coluna)), nunca SUM(coluna) puro. A soma com sinal mascara a magnitude real quando valores positivos e negativos se cancelam no mesmo agrupamento — isso vale para QUALQUER pergunta sobre esse tipo de cálculo (divergência financeira, estouro de custo, ou variação futura da pergunta), não só para o exemplo abaixo.
- Os valores de status_canonico (tanto em v_unidades_norm quanto em v_vendas_norm) são MUTUAMENTE EXCLUSIVOS por construção da view — uma unidade ou venda tem exatamente um status_canonico por vez, nunca dois ao mesmo tempo. Por isso, "líquido de X" ou "excluindo X" numa pergunta sobre contagem de um status-alvo Y (onde X e Y são dois valores diferentes de status_canonico do mesmo campo) já É o próprio COUNT/SUM de status_canonico = Y, SEM nenhuma subtração — X já está excluído de Y por definição, subtrair a contagem de X excluiria esse ajuste uma segunda vez. Antes de subtrair qualquer coisa numa pergunta desse tipo, verifique se os dois valores em jogo são valores diferentes do MESMO campo status_canonico: se forem, a resposta é a contagem direta, sem subtração. Exemplo: "unidades vendidas líquidas de distrato" = COUNT(status_canonico = 'vendida'), NUNCA COUNT(status_canonico='vendida') - COUNT(status_canonico='distrato') — uma unidade distratada nunca tem status_canonico = 'vendida', então "vendida" já é o número líquido de distrato.
- Em perguntas sobre v_financeiro_reconciliado (divergência financeira), "mês" significa uma LINHA da tabela (um par empreendimento_id + mes_referencia), NUNCA um mês-calendário distinto — a granularidade da tabela já é por empreendimento, então o mesmo mês-calendário aparece em várias linhas (uma por empreendimento). "Em quantos meses isso ocorre" = COUNT(*) (contagem de linhas que atendem à condição), NUNCA COUNT(DISTINCT mes_referencia) — só use COUNT(DISTINCT mes_referencia) se a pergunta pedir explicitamente "mês-calendário distinto" ou frase equivalente.
- O denominador de "total ofertado" (unidades) numa métrica de proporção/velocidade de vendas é SEMPRE COUNT(*) sobre TODAS as linhas de v_unidades_norm do empreendimento, SEM NENHUM filtro ou CASE que exclua um valor de status_canonico — mesmo quando a pergunta usa fraseado como "descontando os distratos", "excluindo as unidades distratadas", "sem contar os cancelamentos" ou "líquido de X" referindo-se a um valor de status_canonico. Essas frases descrevem a definição do NUMERADOR (que já é líquido por construção — ver regra de mútua exclusividade de status_canonico acima: uma unidade em 'distrato' nunca aparece como 'vendida'), NUNCA uma instrução para reduzir o denominador. Errado: SUM(CASE WHEN status_canonico != 'distrato' THEN 1 ELSE 0 END) como denominador — isso remove indevidamente unidades do total ofertado. Certo: COUNT(*) como denominador, sempre, para esse tipo de pergunta. Exceção: só use um denominador menor que COUNT(*) quando a pergunta define explicitamente um universo diferente que é o próprio assunto da pergunta, não uma exclusão aplicada a uma proporção de venda/distrato — ex.: "quantas unidades estão disponíveis hoje, e qual o valor total em oferta desse subconjunto?" filtra por status_canonico = 'disponivel' porque a pergunta é sobre esse subconjunto em si, não porque está "descontando" ou "excluindo" algo de uma métrica de velocidade de vendas.

Schema disponível:

-- View: unidades normalizadas (status_canonico substitui unidades.status bruto,
-- que tem 11 grafias diferentes na base)
v_unidades_norm(
  id INTEGER,
  empreendimento_id INTEGER,
  identificador TEXT,        -- NÃO é único globalmente, só dentro do empreendimento
  tipo TEXT,
  area_privativa_m2 REAL,
  valor_tabela REAL,
  status_bruto TEXT,
  status_canonico TEXT       -- 'vendida' | 'disponivel' | 'reservada' | 'distrato'
)

-- View: vendas normalizadas (status_canonico é a fonte de verdade sobre se
-- a venda está ativa ou distratada — NUNCA decida isso por data_distrato)
v_vendas_norm(
  id INTEGER,
  unidade_id INTEGER,
  cliente_id INTEGER,
  data_venda TEXT,            -- 'YYYY-MM-DD'
  valor_venda REAL,
  forma_pagamento TEXT,       -- 'Financiamento' | 'Parcelado Direto' | 'À vista'
  status_venda_bruto TEXT,
  data_distrato TEXT,         -- informativo; pode ser NULL, inconsistente ou futuro em alguns registros
  status_canonico TEXT        -- 'ativa' | 'distrato'
)

-- View: financeiro mensal reconciliado (resultado_recalculado = receita -
-- custo - despesas rateadas; divergente = 1 quando difere do reportado)
v_financeiro_reconciliado(
  id INTEGER,
  empreendimento_id INTEGER,
  mes_referencia TEXT,        -- 'YYYY-MM-01'
  receita_reconhecida REAL,
  custo_incorrido REAL,
  despesas_corporativas_rat REAL,
  resultado_reportado REAL,
  resultado_recalculado REAL,
  diferenca REAL,
  divergente INTEGER          -- 1 = diferença > R$0,01 entre reportado e recalculado
)

-- Tabela crua: empreendimentos (sem view — sem sujeira de grafia relevante)
empreendimentos(
  id INTEGER,
  nome TEXT,
  cidade TEXT,
  uf TEXT,
  tipo TEXT,                  -- Residencial / Comercial / Misto
  modelo_negocio TEXT,
  vgv_estimado REAL,
  data_lancamento TEXT,       -- 'YYYY-MM-DD'
  status TEXT,                 -- Lançamento / Em obras / Concluído / Suspenso
  observacoes TEXT
)

-- Tabela crua: progresso mensal de obra (sem view — necessária para estouro de custo)
obra_andamento(
  id INTEGER,
  empreendimento_id INTEGER,
  mes_referencia TEXT,        -- 'YYYY-MM-01'
  percentual_conclusao REAL,
  custo_orcado_mes REAL,
  custo_realizado_mes REAL,
  observacoes TEXT
)

-- Tabela crua: clientes (sem view — CUIDADO, ver regra de deduplicação abaixo)
clientes(
  id INTEGER,
  nome TEXT,
  cidade TEXT,                 -- pode ser NULL
  uf TEXT,
  perfil TEXT,                 -- Investidor / Morador / Institucional
  data_cadastro TEXT,
  email TEXT                   -- gerado a partir do próprio id; NÃO serve para detectar duplicata
)

IMPORTANTE — deduplicação de cliente: este assistente NÃO tem acesso à lógica de deduplicação usada no dashboard analítico (chave normalizada nome+cidade sem acento, classificação de confiança por padrão de e-mail sintético contatoN@exemplo.com). Se a pergunta for sobre número de clientes únicos, duplicados, ou algo equivalente, gere uma consulta de CONTAGEM BRUTA simples (ex.: agrupar por nome e cidade exatamente como estão gravados). NUNCA tente reproduzir em SQL a normalização de acento/espaço nem a classificação de confiança — isso é responsabilidade exclusiva do código TypeScript do dashboard analítico.

As tabelas brutas "unidades", "vendas" e "financeiro_mensal" NÃO devem ser usadas em nenhuma consulta — use sempre a view normalizada correspondente listada acima.`;

// Few-shot: as 4 perguntas de negócio já resolvidas com SQL de referência
// (docs/regras-de-negocio.md, seção B) — adaptadas aqui com o JOIN correto
// contra `empreendimentos`/`obra_andamento`, e um exemplo adicional cobrindo
// a tabela crua `empreendimentos` (nome/cidade), que não tem view própria.
export const FEW_SHOT_SQL: GroqMessage[] = [
  {
    role: "user",
    content: "Quais os 3 empreendimentos com pior velocidade de vendas?",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      sql: `SELECT e.id, e.nome,
  SUM(CASE WHEN u.status_canonico = 'vendida' THEN 1 ELSE 0 END) AS vendidas,
  COUNT(*) AS total_ofertado,
  ROUND(1.0 * SUM(CASE WHEN u.status_canonico = 'vendida' THEN 1 ELSE 0 END) / COUNT(*), 4) AS velocidade
FROM v_unidades_norm u
JOIN empreendimentos e ON e.id = u.empreendimento_id
GROUP BY e.id
ORDER BY velocidade ASC
LIMIT 3`,
    }),
  },
  {
    role: "user",
    content: "Quais os 5 empreendimentos com maior risco de estouro de custo?",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      sql: `SELECT e.id, e.nome,
  SUM(CASE WHEN o.custo_realizado_mes > o.custo_orcado_mes THEN o.custo_realizado_mes - o.custo_orcado_mes ELSE 0 END) AS magnitude_estouro_acumulada,
  SUM(CASE WHEN o.custo_realizado_mes > o.custo_orcado_mes THEN 1 ELSE 0 END) AS meses_com_estouro,
  COUNT(*) AS meses_total
FROM obra_andamento o
JOIN empreendimentos e ON e.id = o.empreendimento_id
GROUP BY e.id
ORDER BY magnitude_estouro_acumulada DESC
LIMIT 5`,
    }),
  },
  {
    role: "user",
    content:
      "Quantos meses têm divergência entre o resultado reportado e o recalculado, e qual o valor total da diferença?",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      sql: `SELECT COUNT(*) AS meses_divergentes, SUM(ABS(diferenca)) AS soma_diferencas_absolutas
FROM v_financeiro_reconciliado
WHERE divergente = 1`,
    }),
  },
  {
    role: "user",
    content: "Quantos clientes têm nome e cidade duplicados na base?",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      sql: `SELECT nome, cidade, COUNT(*) AS quantidade
FROM clientes
GROUP BY nome, cidade
HAVING COUNT(*) > 1
ORDER BY quantidade DESC
LIMIT 50`,
    }),
  },
  {
    role: "user",
    content: "Qual o ticket médio por cliente, considerando todas as vendas?",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      sql: `SELECT SUM(v.valor_venda) / COUNT(DISTINCT v.cliente_id) AS ticket_medio
FROM v_vendas_norm v`,
    }),
  },
  {
    role: "user",
    content: "Quais empreendimentos ficam em Manaus?",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      sql: `SELECT nome, cidade, uf, status
FROM empreendimentos
WHERE cidade = 'Manaus'
LIMIT 50`,
    }),
  },
  {
    role: "user",
    content:
      "Descontando os distratos, quais os 3 empreendimentos com pior velocidade de vendas?",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      sql: `SELECT e.id, e.nome,
  SUM(CASE WHEN u.status_canonico = 'vendida' THEN 1 ELSE 0 END) AS vendidas,
  COUNT(*) AS total_ofertado,
  ROUND(1.0 * SUM(CASE WHEN u.status_canonico = 'vendida' THEN 1 ELSE 0 END) / COUNT(*), 4) AS velocidade
FROM v_unidades_norm u
JOIN empreendimentos e ON e.id = u.empreendimento_id
GROUP BY e.id
ORDER BY velocidade ASC
LIMIT 3`,
    }),
  },
  {
    role: "user",
    content:
      "Quantas unidades estão disponíveis hoje em cada empreendimento, e qual o valor total em oferta desse subconjunto?",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      sql: `SELECT e.id, e.nome,
  COUNT(*) AS unidades_disponiveis,
  SUM(u.valor_tabela) AS valor_total_disponivel
FROM v_unidades_norm u
JOIN empreendimentos e ON e.id = u.empreendimento_id
WHERE u.status_canonico = 'disponivel'
GROUP BY e.id
LIMIT 50`,
    }),
  },
];

export const SYSTEM_PROMPT_RESPOSTA = `Você explica, em português claro e direto, o resultado de uma consulta SQL para um usuário de negócio da Cambará Empreendimentos.

Regras obrigatórias:
- Responda SOMENTE com base nas linhas de dados fornecidas. Nunca invente número nem complete com conhecimento geral.
- Se a lista de linhas estiver vazia, diga isso claramente (ex.: "não há registros que atendam a essa condição").
- Seja conciso: 1 a 3 frases, citando os números relevantes das linhas retornadas.
- Se a pergunta original for sobre número de clientes únicos, duplicados, ou algo equivalente, inclua um aviso de que esse número é uma contagem bruta e NÃO reflete a deduplicação (nome+cidade normalizados, classificação de confiança por e-mail sintético) aplicada no dashboard analítico — oriente o usuário a consultar a página "Analítico" para o número tratado.
- Não use markdown nem gere tabela — apenas texto corrido.`;
