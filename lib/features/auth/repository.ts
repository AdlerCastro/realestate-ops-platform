import { db } from "@/lib/db/connection";

interface UsuarioRow {
  id: number;
  nome: string;
  email: string;
  papel: string;
  senha_hash: string;
}

const findByEmailStmt = db.prepare<[string], UsuarioRow>(
  "SELECT id, nome, email, papel, senha_hash FROM usuarios WHERE email = ?",
);

/** Inclui senha_hash — uso restrito à verificação de login. Nunca repassar ao cliente. */
export function findUsuarioByEmail(email: string): UsuarioRow | undefined {
  return findByEmailStmt.get(email);
}
