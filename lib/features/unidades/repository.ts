import { db } from "@/lib/db/connection";

export interface UnidadeDisponivel {
  id: number;
  identificador: string;
  tipo: string;
  area_privativa_m2: number;
  valor_tabela: number;
  empreendimento_id: number;
  empreendimento_nome: string;
}

const listarUnidadesDisponiveisStmt = db.prepare<[], UnidadeDisponivel>(`
  SELECT
    u.id,
    u.identificador,
    u.tipo,
    u.area_privativa_m2,
    u.valor_tabela,
    u.empreendimento_id,
    e.nome AS empreendimento_nome
  FROM v_unidades_norm u
  JOIN empreendimentos e ON e.id = u.empreendimento_id
  WHERE u.status_canonico = 'disponivel'
  ORDER BY e.nome, u.identificador
`);

/** Leitura mínima para o select do formulário de venda — não é a camada analítica completa (sessão 3). */
export function listarUnidadesDisponiveis(): UnidadeDisponivel[] {
  return listarUnidadesDisponiveisStmt.all();
}

export interface UnidadesPorStatus {
  status_canonico: "vendida" | "disponivel" | "reservada" | "distrato";
  total: number;
}

const contarUnidadesPorStatusStmt = db.prepare<[], UnidadesPorStatus>(`
  SELECT status_canonico, COUNT(*) AS total
  FROM v_unidades_norm
  GROUP BY status_canonico
`);

/** Distribuição de todas as 3.300 unidades por status canônico — fonte do gráfico donut de /vendas. */
export function contarUnidadesPorStatus(): UnidadesPorStatus[] {
  return contarUnidadesPorStatusStmt.all();
}

export interface UnidadeListagemItem {
  id: number;
  identificador: string;
  tipo: string;
  area_privativa_m2: number;
  valor_tabela: number;
  empreendimento_id: number;
  empreendimento_nome: string;
  status_canonico: "vendida" | "disponivel" | "reservada" | "distrato";
}

const listarUnidadesParaListagemStmt = db.prepare<[], UnidadeListagemItem>(`
  SELECT
    u.id,
    u.identificador,
    u.tipo,
    u.area_privativa_m2,
    u.valor_tabela,
    u.empreendimento_id,
    e.nome AS empreendimento_nome,
    u.status_canonico
  FROM v_unidades_norm u
  JOIN empreendimentos e ON e.id = u.empreendimento_id
  ORDER BY e.nome, u.identificador
`);

/**
 * Universo completo das 3.300 unidades (todos os status), fonte da tabela de
 * unidades em /vendas — filtro de status e busca por identificador operam
 * client-side sobre este conjunto já carregado, mesmo padrão das 2.206
 * vendas (ver lib/features/vendas/hooks/use-vendas-listagem.ts).
 */
export function listarUnidadesParaListagem(): UnidadeListagemItem[] {
  return listarUnidadesParaListagemStmt.all();
}
