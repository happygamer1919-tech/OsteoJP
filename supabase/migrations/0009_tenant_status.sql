-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0009_tenant_status.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended');--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" "tenant_status" DEFAULT 'active' NOT NULL;