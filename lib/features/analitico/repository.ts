// Camada analítica (sessão 3) — funções puras, sem cache, lidas diretamente
// por Server Components a cada render (mesmo padrão de
// `listarVendasAtivas`/`listarUnidadesDisponiveis`: sem hook, sem TanStack
// Query aqui). Nenhuma view SQL nova é criada por este módulo — reaproveita
// `v_unidades_norm`, `v_vendas_norm` e `v_financeiro_reconciliado`, já
// existentes no banco (ver refs/analise-banco-consolidada.md, seção 4).
// Somente SELECT — nenhum UPDATE/DELETE/ALTER (regra AGENTS.md seção 0).

import { db } from "@/lib/db/connection";
import {
  classificarGruposDedup,
  type Cliente,
  type ConfiancaDedup,
} from "@/lib/features/clientes/dedup";

// ---------------------------------------------------------------------------
// 1. Velocidade de vendas líquida de distrato, por empreendimento
// ---------------------------------------------------------------------------

export interface VelocidadeVendasItem {
  empreendimentoId: number;
  nome: string;
  cidade: string;
  uf: string;
  tipo: string;
  vendidas: number;
  totalOfertado: number;
  /** Fração 0-1 (não percentual) — vendidas / totalOfertado. */
  velocidade: number;
  dataLancamento: string;
}

interface VelocidadeVendasRow {
  id: number;
  nome: string;
  cidade: string;
  uf: string;
  tipo: string;
  data_lancamento: string;
  vendidas: number;
  total_ofertado: number;
  velocidade: number;
}

// Numerador = status_canonico = 'vendida' (v_unidades_norm). Denominador =
// todas as unidades do empreendimento, independentemente de status (decisão
// 7a das instruções do projeto — nenhum status na base sinaliza remoção de
// oferta/portfólio). cidade/uf/tipo entram só para permitir filtro de
// apresentação no front (client component, sessão do dashboard analítico
// filtrado) — nunca incidem sobre o numerador/denominador em si.
const listarVelocidadeVendasStmt = db.prepare<[], VelocidadeVendasRow>(`
  SELECT
    e.id AS id,
    e.nome AS nome,
    e.cidade AS cidade,
    e.uf AS uf,
    e.tipo AS tipo,
    e.data_lancamento AS data_lancamento,
    SUM(CASE WHEN u.status_canonico = 'vendida' THEN 1 ELSE 0 END) AS vendidas,
    COUNT(*) AS total_ofertado,
    1.0 * SUM(CASE WHEN u.status_canonico = 'vendida' THEN 1 ELSE 0 END) / COUNT(*) AS velocidade
  FROM v_unidades_norm u
  JOIN empreendimentos e ON e.id = u.empreendimento_id
  GROUP BY e.id
  ORDER BY velocidade ASC
`);

/**
 * Lista COMPLETA (22 empreendimentos), ordenada por velocidade ascendente
 * (pior primeiro) — o recorte de destaque (ex.: "3 piores"/"3 melhores") e
 * qualquer filtro por cidade/uf/tipo são decisão de apresentação do front
 * (client component), não desta função — a fórmula em si nunca muda.
 *
 * Validado contra refs/analise-banco-consolidada.md seção 5a (pior→melhor):
 * Essência Living 13/190 (6,84%), Atelier Tower 35/186 (18,82%),
 * Cume Tower 36/146 (24,66%).
 */
export function listarVelocidadeVendas(): VelocidadeVendasItem[] {
  return listarVelocidadeVendasStmt.all().map((row) => ({
    empreendimentoId: row.id,
    nome: row.nome,
    cidade: row.cidade,
    uf: row.uf,
    tipo: row.tipo,
    vendidas: row.vendidas,
    totalOfertado: row.total_ofertado,
    velocidade: row.velocidade,
    dataLancamento: row.data_lancamento,
  }));
}

// ---------------------------------------------------------------------------
// 2. Risco de estouro de custo
// ---------------------------------------------------------------------------

export interface RiscoEstouroCustoItem {
  empreendimentoId: number;
  nome: string;
  /** Soma só dos meses com custo_realizado_mes > custo_orcado_mes (critério bruto — decisão 7b). Critério de ordenação. */
  magnitudeEstouroAcumulada: number;
  /** Soma líquida (sem filtro) — métrica de referência secundária, NÃO usar para ordenar. */
  desvioLiquidoReferencia: number;
  mesesComEstouro: number;
  mesesTotal: number;
}

export interface EstouroCustoMensalItem {
  empreendimentoId: number;
  nome: string;
  cidade: string;
  uf: string;
  tipo: string;
  /** 'YYYY-MM-01' — granularidade mensal de obra_andamento. */
  mesReferencia: string;
  custoOrcado: number;
  custoRealizado: number;
}

interface EstouroCustoMensalRow {
  id: number;
  nome: string;
  cidade: string;
  uf: string;
  tipo: string;
  mes_referencia: string;
  custo_orcado: number;
  custo_realizado: number;
}

// Direto contra obra_andamento (sem view — tabela não tem inconsistência de
// grafia, ver analise-banco-consolidada.md seção 2/4). Granularidade
// mensal (uma linha por empreendimento×mês) para permitir filtro de período
// e de cidade/uf/tipo no client component — a agregação (soma bruta/líquida,
// critério da decisão 7b) acontece no front sobre o subconjunto filtrado,
// nunca nesta query.
const listarEstouroCustoMensalStmt = db.prepare<[], EstouroCustoMensalRow>(`
  SELECT
    e.id AS id,
    e.nome AS nome,
    e.cidade AS cidade,
    e.uf AS uf,
    e.tipo AS tipo,
    o.mes_referencia AS mes_referencia,
    o.custo_orcado_mes AS custo_orcado,
    o.custo_realizado_mes AS custo_realizado
  FROM obra_andamento o
  JOIN empreendimentos e ON e.id = o.empreendimento_id
  ORDER BY e.id, o.mes_referencia
`);

/**
 * Lista COMPLETA, granularidade empreendimento×mês, sem nenhuma agregação —
 * a agregação (magnitude bruta top-5, decisão 7b) e qualquer filtro de
 * cidade/uf/tipo/período são decisão do front (client component).
 *
 * Sem filtro (todo o período, todas as dimensões), a agregação desta lista
 * deve bater com refs/analise-banco-consolidada.md seção 5b, top 5:
 * Panorama do Parque (R$ 5.870.238,38 / R$ 4.175.081,11, 21/36),
 * Alto Amazônia (R$ 3.857.806,45 / R$ 2.261.394,32, 22/39),
 * Estúdio Amazônia (R$ 3.613.496,47 / R$ 2.379.439,52, 8/14),
 * Cume Tower (R$ 3.106.416,68 / R$ 53.966,04, 3/10),
 * Cais Tower (R$ 3.060.991,11 / R$ 1.376.944,69, 22/43).
 */
export function listarEstouroCustoMensal(): EstouroCustoMensalItem[] {
  return listarEstouroCustoMensalStmt.all().map((row) => ({
    empreendimentoId: row.id,
    nome: row.nome,
    cidade: row.cidade,
    uf: row.uf,
    tipo: row.tipo,
    mesReferencia: row.mes_referencia,
    custoOrcado: row.custo_orcado,
    custoRealizado: row.custo_realizado,
  }));
}

// ---------------------------------------------------------------------------
// 3. Duplicidade de cliente
// ---------------------------------------------------------------------------

export interface ClienteDedupResumo {
  id: number;
  nome: string;
  cidade: string | null;
  email: string | null;
}

export interface GrupoClienteDedupResumo {
  chave: string;
  confianca: ConfiancaDedup;
  clientes: ClienteDedupResumo[];
}

export interface DuplicidadeClienteResumo {
  totalGrupos: number;
  totalRegistrosEnvolvidos: number;
  gruposAltaConfianca: GrupoClienteDedupResumo[];
  gruposBaixaConfianca: GrupoClienteDedupResumo[];

  /** COUNT(DISTINCT cliente_id) sobre vendas ativas, sem nenhum tratamento de dedup. */
  clientesCompradoresBruto: number;
  /** SUM(valor_venda) / clientesCompradoresBruto. */
  ticketMedioBruto: number;

  /**
   * COUNT(DISTINCT id-após-mapear) contando só a mesclagem de grupos de ALTA
   * confiança (id representante = menor id do grupo). Grupos de BAIXA
   * confiança (8 pares/16 registros) NÃO são mesclados neste número — regra
   * desta sessão, diferente do número histórico da análise (que mesclava
   * alta+baixa juntas).
   */
  clientesCompradoresCorrigido: number;
  /** SUM(valor_venda) / clientesCompradoresCorrigido (só-alta). */
  ticketMedioCorrigido: number;

  /**
   * Número documentado em refs/analise-banco-consolidada.md seção 5c,
   * calculado com dedup completo (alta + baixa mescladas). Mantido aqui só
   * como referência de comparação — NÃO é a mesma regra desta sessão, então
   * `clientesCompradoresCorrigido`/`ticketMedioCorrigido` (só-alta) não
   * precisam bater com estes valores, e não bateram na validação real (ver
   * observacaoComparacao).
   */
  comparacaoHistoricaAltaEBaixa: {
    clientesCompradores: number;
    ticketMedio: number;
  };
  observacaoComparacao: string;
}

const listarClientesStmt = db.prepare<[], Cliente>(`
  SELECT id, nome, cidade, uf, perfil, data_cadastro, email FROM clientes
`);

interface VendaAtivaClienteRow {
  cliente_id: number;
  valor_venda: number;
}

const listarVendasAtivasParaDedupStmt = db.prepare<[], VendaAtivaClienteRow>(`
  SELECT cliente_id, valor_venda FROM v_vendas_norm WHERE status_canonico = 'ativa'
`);

function paraResumoCliente(c: Cliente): ClienteDedupResumo {
  return { id: c.id, nome: c.nome, cidade: c.cidade, email: c.email };
}

/**
 * Métricas baseadas em vendas com status_canonico = 'ativa', comparando
 * contagem/ticket médio "bruto" (sem tratamento) contra "corrigido" (só
 * grupos de alta confiança mesclados, id representante = menor id do grupo).
 * Grupos de baixa confiança (8 pares/16 registros) ficam só listados para
 * exibição como "requer verificação manual", nunca entram em nenhum cálculo
 * numérico.
 *
 * Validado contra refs/analise-banco-consolidada.md seção 5c:
 * totalGrupos = 97, totalRegistrosEnvolvidos = 196.
 */
export function obterDuplicidadeCliente(): DuplicidadeClienteResumo {
  const clientes = listarClientesStmt.all();
  const grupos = classificarGruposDedup(clientes);

  const gruposAlta = grupos.filter((g) => g.confianca === "alta");
  const gruposBaixa = grupos.filter((g) => g.confianca === "baixa");

  const totalGrupos = grupos.length;
  const totalRegistrosEnvolvidos = grupos.reduce(
    (soma, g) => soma + g.clientes.length,
    0,
  );

  // Mapa clienteId -> idRepresentante (menor id do grupo), cobrindo só
  // membros de grupos de ALTA confiança.
  const mapaAlta = new Map<number, number>();
  for (const grupo of gruposAlta) {
    const idRepresentante = Math.min(...grupo.clientes.map((c) => c.id));
    for (const c of grupo.clientes) {
      mapaAlta.set(c.id, idRepresentante);
    }
  }

  const vendasAtivas = listarVendasAtivasParaDedupStmt.all();

  const clientesBrutoSet = new Set<number>();
  const clientesCorrigidoSet = new Set<number>();
  let somaValorVenda = 0;

  for (const venda of vendasAtivas) {
    somaValorVenda += venda.valor_venda;
    clientesBrutoSet.add(venda.cliente_id);
    clientesCorrigidoSet.add(
      mapaAlta.get(venda.cliente_id) ?? venda.cliente_id,
    );
  }

  const clientesCompradoresBruto = clientesBrutoSet.size;
  const clientesCompradoresCorrigido = clientesCorrigidoSet.size;

  return {
    totalGrupos,
    totalRegistrosEnvolvidos,
    gruposAltaConfianca: gruposAlta.map((g) => ({
      chave: g.chave,
      confianca: g.confianca,
      clientes: g.clientes.map(paraResumoCliente),
    })),
    gruposBaixaConfianca: gruposBaixa.map((g) => ({
      chave: g.chave,
      confianca: g.confianca,
      clientes: g.clientes.map(paraResumoCliente),
    })),
    clientesCompradoresBruto,
    ticketMedioBruto: somaValorVenda / clientesCompradoresBruto,
    clientesCompradoresCorrigido,
    ticketMedioCorrigido: somaValorVenda / clientesCompradoresCorrigido,
    comparacaoHistoricaAltaEBaixa: {
      clientesCompradores: 1436,
      ticketMedio: 3176094.1,
    },
    observacaoComparacao:
      "O número documentado (1.436 clientes / R$ 3.176.094,10 de ticket médio) foi " +
      "calculado com dedup completo (alta + baixa confiança mescladas). Nesta sessão, " +
      "a regra é mesclar só grupos de ALTA confiança — grupos de baixa confiança (8 " +
      "pares/16 registros) não entram em nenhum cálculo numérico, só aparecem como " +
      "'requer verificação manual'. Por isso clientesCompradoresCorrigido/" +
      "ticketMedioCorrigido (só-alta) não batem exatamente com o número histórico — " +
      "essa diferença é esperada por causa da regra desta sessão, não é um erro de query.",
  };
}

// ---------------------------------------------------------------------------
// 4. Divergência financeira
// ---------------------------------------------------------------------------

export interface DivergenciaEmpreendimentoItem {
  empreendimentoId: number;
  nome: string;
  mesesDivergentes: number;
  mesesTotal: number;
  somaAbsDiferenca: number;
}

export interface DivergenciaFinanceiraResumo {
  totalMeses: number;
  totalDivergentes: number;
  totalEmpreendimentosDivergentes: number;
  somaAbsDiferencas: number;
  /** Todos os 22 empreendimentos, inclusive os sem nenhum mês divergente (zero). Ordenado desc por somaAbsDiferenca. */
  porEmpreendimento: DivergenciaEmpreendimentoItem[];
}

interface TotaisFinanceiroRow {
  total_meses: number;
  total_divergentes: number;
  total_empreendimentos_divergentes: number;
  soma_abs_diferencas: number;
}

const obterTotaisFinanceiroStmt = db.prepare<[], TotaisFinanceiroRow>(`
  SELECT
    COUNT(*) AS total_meses,
    SUM(divergente) AS total_divergentes,
    (SELECT COUNT(DISTINCT empreendimento_id) FROM v_financeiro_reconciliado WHERE divergente = 1)
      AS total_empreendimentos_divergentes,
    (SELECT SUM(ABS(diferenca)) FROM v_financeiro_reconciliado WHERE divergente = 1)
      AS soma_abs_diferencas
  FROM v_financeiro_reconciliado
`);

interface DivergenciaPorEmpreendimentoRow {
  id: number;
  nome: string;
  meses_divergentes: number;
  meses_total: number;
  soma_abs_diferenca: number;
}

// Inclui todos os empreendimentos (LEFT JOIN), com zero para quem não tem
// nenhum mês divergente — não filtra para só os 18 divergentes.
const listarDivergenciaPorEmpreendimentoStmt = db.prepare<
  [],
  DivergenciaPorEmpreendimentoRow
>(`
  SELECT
    e.id AS id,
    e.nome AS nome,
    COALESCE(SUM(f.divergente), 0) AS meses_divergentes,
    COUNT(f.id) AS meses_total,
    COALESCE(SUM(CASE WHEN f.divergente = 1 THEN ABS(f.diferenca) ELSE 0 END), 0) AS soma_abs_diferenca
  FROM empreendimentos e
  LEFT JOIN v_financeiro_reconciliado f ON f.empreendimento_id = e.id
  GROUP BY e.id
  ORDER BY soma_abs_diferenca DESC
`);

export interface DivergenciaMensalItem {
  empreendimentoId: number;
  /** 'YYYY-MM-01'. */
  mesReferencia: string;
  resultadoReportado: number;
  resultadoRecalculado: number;
  diferenca: number;
  divergente: boolean;
}

interface DivergenciaMensalRow {
  empreendimento_id: number;
  mes_referencia: string;
  resultado_reportado: number;
  resultado_recalculado: number;
  diferenca: number;
  divergente: number;
}

// Granularidade empreendimento×mês, sem agregação — usada pelo gráfico de
// área (pergunta 4), que exibe a série temporal de UM empreendimento por vez
// (seletor local ao gráfico, não filtro global do dashboard).
const listarDivergenciaMensalStmt = db.prepare<[], DivergenciaMensalRow>(`
  SELECT
    empreendimento_id AS empreendimento_id,
    mes_referencia AS mes_referencia,
    resultado_reportado AS resultado_reportado,
    resultado_recalculado AS resultado_recalculado,
    diferenca AS diferenca,
    divergente AS divergente
  FROM v_financeiro_reconciliado
  ORDER BY empreendimento_id, mes_referencia
`);

export function listarDivergenciaMensal(): DivergenciaMensalItem[] {
  return listarDivergenciaMensalStmt.all().map((row) => ({
    empreendimentoId: row.empreendimento_id,
    mesReferencia: row.mes_referencia,
    resultadoReportado: row.resultado_reportado,
    resultadoRecalculado: row.resultado_recalculado,
    diferenca: row.diferenca,
    divergente: row.divergente === 1,
  }));
}

/**
 * Validado contra refs/analise-banco-consolidada.md seção 5d: 562 meses
 * totais, 63 divergentes, 18 de 22 empreendimentos, R$ 6.926.672,09 em
 * diferenças absolutas.
 */
export function obterDivergenciaFinanceira(): DivergenciaFinanceiraResumo {
  const totais = obterTotaisFinanceiroStmt.get()!;
  const porEmpreendimento = listarDivergenciaPorEmpreendimentoStmt.all();

  return {
    totalMeses: totais.total_meses,
    totalDivergentes: totais.total_divergentes,
    totalEmpreendimentosDivergentes: totais.total_empreendimentos_divergentes,
    somaAbsDiferencas: totais.soma_abs_diferencas,
    porEmpreendimento: porEmpreendimento.map((row) => ({
      empreendimentoId: row.id,
      nome: row.nome,
      mesesDivergentes: row.meses_divergentes,
      mesesTotal: row.meses_total,
      somaAbsDiferenca: row.soma_abs_diferenca,
    })),
  };
}
