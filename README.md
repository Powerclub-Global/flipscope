# FlipScope

Property-to-profit management platform. Takes a real-estate flip from first
walkthrough to verified profit across a portfolio of properties.

Companion docs: `FlipScope_Build_Plan_2026-08-18.html` and
`FlipScope_Phase0-2_Execution_Plan_2026-08-19.html` (in the topos workspace).

## Stack

- React + TypeScript (Vite) web app
- Supabase: Postgres, Auth, Storage, RLS, Realtime
- Money model: **integer cents only**; a single server-side financial engine
  (`project_financials`, `portfolio_financials`) computes every figure
- Multi-tenant from day one: Organization → Portfolio → Property → Project,
  row-level security keyed on org membership, then role

## Local development

```sh
pnpm install
npx supabase start        # local Postgres/Auth/Storage stack (Docker)
cp .env.example .env.local  # fill in anon key from `supabase start` output
pnpm dev
```

## Database

- Migrations: `supabase/migrations/`
- Tenant-isolation and financial-engine tests (pgTAP): `supabase/tests/`

```sh
npx supabase test db      # run the isolation suite locally
```

CI runs the same suite on every PR; a policy regression blocks merge.

## Rules that don't bend

1. Money is integer cents. No floats, no client-side totals.
2. Every table carries `org_id`; RLS denies by default.
3. The ledger is append-only — corrections are offsetting entries.
