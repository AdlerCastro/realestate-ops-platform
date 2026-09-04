import { db } from "@/lib/db/connection";
import { NegocioError } from "./errors";
import type { RegistrarVendaInput } from "./schema";

export interface VendaRow {
  id: number;
  unidade_id: number;
  cliente_id: number;
  data_venda: string;
  valor_venda: number;
  forma_pagamento: string;
  status_venda: string;
  data_distrato: string | null;
}

export interface VendaAtivaListItem {
  id: number;
  unidade_id: number;
  unidade_identificador: string;
  cliente_id: number;
  cliente_nome: string;
  valor_venda: number;
  forma_pagamento: string;
  data_venda: string;
}

export interface VendaListagemItem {
  id: number;
  unidade_id: number;
  unidade_identificador: string;
  empreendimento_nome: string;
  cliente_id: number;
  cliente_nome: string;
  valor_venda: number;
  forma_pagamento: string;
  data_venda: string;
  status_canonico: "ativa" | "distrato";
  data_distrato: string | null;
}

const atualizarUnidadeParaVendidaStmt = db.prepare(`
  UPDATE unidades
  SET status = 'vendida'
  WHERE id = ?
    AND LOWER(TRIM(status)) IN ('disponivel', 'disponível')
`);

const inserirClienteStmt = db.prepare(`
  INSERT INTO clientes (nome, cidade, uf, perfil, email, data_cadastro)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const inserirVendaStmt = db.prepare(`
  INSERT INTO vendas (unidade_id, cliente_id, valor_venda, forma_pagamento, status_venda, data_venda)
  VALUES (?, ?, ?, ?, 'ativa', ?)
`);

const buscarVendaPorIdStmt = db.prepare<[number], VendaRow>(
  "SELECT * FROM vendas WHERE id = ?",
);

// Padrão de transação definitivo (instruções do projeto, seção 5 — não
// modificar): o UPDATE...WHERE é o guard de concorrência (impede vender a
// mesma unidade duas vezes), não o db.transaction em si. Cliente novo →
// UPDATE unidade → INSERT venda, tudo atômico, rollback conjunto se
// qualquer etapa falhar.
const registrarVendaTx = db.transaction(
  (input: RegistrarVendaInput): VendaRow => {
    let clienteId = input.clienteId;

    if (clienteId === undefined) {
      const c = input.clienteNovo!;
      const dataCadastro = new Date().toISOString();
      const info = inserirClienteStmt.run(
        c.nome,
        c.cidade,
        c.uf ?? null,
        c.perfil,
        c.email ?? null,
        dataCadastro,
      );
      clienteId = info.lastInsertRowid as number;
    }

    const resultado = atualizarUnidadeParaVendidaStmt.run(input.unidadeId);
    if (resultado.changes === 0) {
      throw new NegocioError("Unidade não disponível para venda.");
    }

    const dataVenda = new Date().toISOString();
    const info = inserirVendaStmt.run(
      input.unidadeId,
      clienteId,
      input.valorVenda,
      input.formaPagamento,
      dataVenda,
    );

    return buscarVendaPorIdStmt.get(info.lastInsertRowid as number)!;
  },
);

export function registrarVenda(input: RegistrarVendaInput): VendaRow {
  return registrarVendaTx(input);
}

interface UnidadeIdRow {
  unidade_id: number;
}

const atualizarVendaParaDistratoStmt = db.prepare(`
  UPDATE vendas
  SET status_venda = 'distrato', data_distrato = ?
  WHERE id = ?
    AND LOWER(TRIM(status_venda)) IN ('ativa')
`);

const buscarUnidadeIdDaVendaStmt = db.prepare<[number], UnidadeIdRow>(
  "SELECT unidade_id FROM vendas WHERE id = ?",
);

const devolverUnidadeParaDisponivelStmt = db.prepare(
  "UPDATE unidades SET status = 'disponivel' WHERE id = ?",
);

// Padrão inverso (instruções do projeto, seção 5): reverte a venda e devolve
// a unidade, mesma disciplina de transação única e rollback conjunto. Não
// corrige o histórico legado de 122 unidades presas em "distrato" — vale só
// para ações novas feitas pela aplicação a partir de agora.
const registrarDistratoTx = db.transaction((vendaId: number): VendaRow => {
  const dataDistrato = new Date().toISOString();
  const resultado = atualizarVendaParaDistratoStmt.run(dataDistrato, vendaId);

  if (resultado.changes === 0) {
    throw new NegocioError("Venda não está ativa.");
  }

  const venda = buscarUnidadeIdDaVendaStmt.get(vendaId)!;
  devolverUnidadeParaDisponivelStmt.run(venda.unidade_id);

  return buscarVendaPorIdStmt.get(vendaId)!;
});

export function registrarDistrato(vendaId: number): VendaRow {
  return registrarDistratoTx(vendaId);
}

const listarVendasAtivasStmt = db.prepare<[], VendaAtivaListItem>(`
  SELECT
    v.id,
    v.unidade_id,
    u.identificador AS unidade_identificador,
    v.cliente_id,
    c.nome AS cliente_nome,
    v.valor_venda,
    v.forma_pagamento,
    v.data_venda
  FROM v_vendas_norm v
  JOIN unidades u ON u.id = v.unidade_id
  JOIN clientes c ON c.id = v.cliente_id
  WHERE v.status_canonico = 'ativa'
  ORDER BY v.data_venda DESC
`);

/** Listagem mínima para o fluxo de distrato escolher qual venda reverter — não é o dashboard de vendas (sessão 3). */
export function listarVendasAtivas(): VendaAtivaListItem[] {
  return listarVendasAtivasStmt.all();
}

const listarVendasParaListagemStmt = db.prepare<[], VendaListagemItem>(`
  SELECT
    v.id,
    v.unidade_id,
    u.identificador AS unidade_identificador,
    e.nome AS empreendimento_nome,
    v.cliente_id,
    c.nome AS cliente_nome,
    v.valor_venda,
    v.forma_pagamento,
    v.data_venda,
    v.status_canonico,
    v.data_distrato
  FROM v_vendas_norm v
  JOIN unidades u ON u.id = v.unidade_id
  JOIN empreendimentos e ON e.id = u.empreendimento_id
  JOIN clientes c ON c.id = v.cliente_id
  ORDER BY v.data_venda DESC
`);

/**
 * Universo completo de vendas (ativas + distratadas), com nome do
 * empreendimento junto ao identificador da unidade (unidades.identificador
 * não é único globalmente, só dentro do empreendimento — ver
 * docs/log-tecnico-decisoes.md, seção 5). Busca e filtros da tela /vendas
 * operam sobre este conjunto já carregado, inteiramente client-side.
 */
export function listarVendasParaListagem(): VendaListagemItem[] {
  return listarVendasParaListagemStmt.all();
}
