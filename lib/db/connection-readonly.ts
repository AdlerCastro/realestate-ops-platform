// Conexão SEPARADA da escrita (lib/db/connection.ts), aberta em modo
// readonly do SQLite — usada exclusivamente pelo assistente de linguagem
// natural (lib/features/assistente). Guardrail estrutural: mesmo que a SQL
// gerada pelo LLM escape da checagem "começa com SELECT", o próprio driver
// rejeita qualquer tentativa de escrita nesta conexão.
//
// better-sqlite3 é síncrono e usa binding nativo — não roda no Edge runtime.
// Qualquer route handler ou módulo que importe este arquivo (direta ou
// indiretamente) precisa declarar `export const runtime = "nodejs";`.
import Database from "better-sqlite3";

const databasePath = process.env.DATABASE_PATH;

if (!databasePath) {
  throw new Error(
    "DATABASE_PATH não definido. Configure a variável de ambiente (ver .env.example).",
  );
}

// Stored on globalThis pelo mesmo motivo da conexão de escrita: sobreviver
// ao Fast Refresh do Next.js em dev sem vazar file handle a cada edição.
const globalForDb = globalThis as unknown as {
  __dbReadonlyInstance?: Database.Database;
};

function createReadonlyConnection(): Database.Database {
  return new Database(databasePath, { readonly: true });
}

export const dbReadonly =
  globalForDb.__dbReadonlyInstance ?? createReadonlyConnection();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dbReadonlyInstance = dbReadonly;
}
