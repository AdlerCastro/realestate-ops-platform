// better-sqlite3 is synchronous and uses a native binding — it cannot run in
// the Edge runtime. Any route handler or module that (transitively) imports
// this file must declare `export const runtime = "nodejs";`.
import Database from "better-sqlite3";

const databasePath = process.env.DATABASE_PATH;

if (!databasePath) {
  throw new Error(
    "DATABASE_PATH não definido. Configure a variável de ambiente (ver .env.example).",
  );
}

// Stored on globalThis so the connection survives Next.js dev Fast Refresh,
// which re-evaluates modules but not the Node.js process — without this a
// new Database instance (and a new file handle) would leak on every edit.
const globalForDb = globalThis as unknown as {
  __dbInstance?: Database.Database;
};

function createConnection(): Database.Database {
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export const db = globalForDb.__dbInstance ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dbInstance = db;
}
