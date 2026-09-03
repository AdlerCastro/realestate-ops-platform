import { db } from "@/lib/db/connection";
import type { Cliente } from "./dedup";

const listarClientesStmt = db.prepare<[], Cliente>(
  "SELECT id, nome, cidade, uf, perfil, data_cadastro, email FROM clientes ORDER BY nome",
);

// Universo completo (não LIKE em SQL puro — mesmo motivo que impediu a view
// de dedup em SQL, ver lib/features/clientes/dedup.ts): a busca de "cliente
// existente" no formulário de venda filtra este universo no lado do
// servidor/cliente reaproveitando chaveDedup, não faz round-trip por termo
// digitado.
export function listarClientes(): Cliente[] {
  return listarClientesStmt.all();
}
