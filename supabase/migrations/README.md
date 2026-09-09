# Migrations

`db/schema.sql` + `db/schema-extended.sql` are the portable single-apply SQL
for any Postgres (handy for a quick local/Supabase SQL Editor bootstrap).

`supabase/migrations/*.sql` is the **canonical ordered history** — versioned,
deterministic, and safe to apply incrementally with `supabase db push` or
`psql`. A brand-new database should be creatable by applying these files in
lexicographic order.

## Running

```bash
# Supabase CLI (recommended when a project is linked)
npx supabase db push

# Or plain psql (works against any hosted Postgres)
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# Legacy single-apply (still supported, e.g. fresh SQL Editor paste)
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/schema-extended.sql
```

## Adding a new migration

1. Copy the next `supabase/migrations/AAAAMMDDHHMMSS_description.sql` name.
2. Make every statement idempotent (`if not exists`, `add column if not exists`,
   wrapped `alter publication … add table` in `DO $$ exception when duplicate_object`).
3. Mirror any schema change back into `db/schema.sql` or `db/schema-extended.sql`
   so the portable files stay equivalent.
4. Test against a throwaway DB — CI checks that a fresh DB boots from migrations.

## Ownership

Migrations are append-only. Never rewrite a past file; add a new one instead.
Sales remain append-only too — the product is a ledger.
