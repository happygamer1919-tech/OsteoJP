import { defineConfig } from "drizzle-kit";

// drizzle-kit migrate needs session-level advisory locks, which Supabase's
// transaction pooler (port 6543) does not support. Use DATABASE_URL_DIRECT
// for migrations (direct connection, port 5432); fall back to DATABASE_URL
// for local-Postgres setups where there's no pooler split.
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "drizzle-kit: neither DATABASE_URL_DIRECT nor DATABASE_URL is set. " +
      "Set DATABASE_URL_DIRECT (preferred — direct 5432 connection for " +
      "session advisory locks) or DATABASE_URL. See .env.example at the repo root.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url },
});
