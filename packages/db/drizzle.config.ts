import { defineConfig } from "drizzle-kit";

// drizzle-kit migrate needs session-level advisory locks, which Supabase's
// transaction pooler (port 6543) does not support. Use DATABASE_URL_DIRECT
// for migrations — the Supabase SESSION pooler (host ...pooler.supabase.com,
// port 5432), which holds the connection for the whole session and supports
// those locks. (It is NOT the db.<ref>.supabase.co host; that one is
// IPv4-gated.) Fall back to DATABASE_URL for local-Postgres setups where
// there's no pooler split.
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

// `check`, `generate`, and `drop` operate purely on local snapshot files and
// never open a connection. Only fail-fast when the command actually needs a DB.
const command = process.argv[2];
const snapshotOnly = new Set(["check", "generate", "drop"]);
const needsConnection = !command || !snapshotOnly.has(command);

if (needsConnection && !url) {
  throw new Error(
    "drizzle-kit: neither DATABASE_URL_DIRECT nor DATABASE_URL is set. " +
      "Set DATABASE_URL_DIRECT (preferred — Supabase session pooler on port " +
      "5432, for session advisory locks) or DATABASE_URL. See .env.example at the repo root.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  ...(url ? { dbCredentials: { url } } : {}),
});
