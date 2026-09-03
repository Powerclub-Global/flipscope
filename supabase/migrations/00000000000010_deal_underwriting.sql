-- FlipScope migration 010 — Deal underwriting inputs
-- The buy-box assumptions that sit around the ledger: financing, holding,
-- contingency, selling cost and the target margin. ARV already lives on
-- projects (manual until the Phase 4 comps feed replaces it).

alter table projects
  add column financing_cents     bigint  not null default 0 check (financing_cents >= 0),
  add column holding_cents       bigint  not null default 0 check (holding_cents >= 0),
  add column contingency_cents   bigint  not null default 0 check (contingency_cents >= 0),
  add column selling_pct_bps     integer not null default 700  check (selling_pct_bps between 0 and 10000),
  add column target_margin_bps   integer not null default 1800 check (target_margin_bps between 0 and 10000);

-- Underwriting engine: all-in cost and margin for a deal, from the same
-- ledger the rest of the app reads plus the assumptions above.
-- Rehab uses the approved budget; actual spend is tracked separately in
-- project_financials() and is what Financials reports against.
create or replace function project_underwriting(p_project_id uuid)
returns table (
  purchase_cents     bigint,
  rehab_cents        bigint,
  financing_cents    bigint,
  holding_cents      bigint,
  contingency_cents  bigint,
  selling_cents      bigint,
  all_in_cents       bigint,
  arv_cents          bigint,
  profit_cents       bigint,
  margin_bps         bigint,   -- profit as a share of ARV
  roi_bps            bigint,   -- profit as a share of all-in cost
  target_margin_bps  integer,
  meets_target       boolean
)
language sql
stable
security invoker
as $$
  with p as (
    select coalesce(purchase_price_cents, 0) as purchase_cents,
           coalesce(arv_cents, 0)            as arv_cents,
           financing_cents, holding_cents, contingency_cents,
           selling_pct_bps, target_margin_bps
    from projects where id = p_project_id
  ),
  rehab as (
    select coalesce(sum(amount_cents) filter (where entry_type = 'budget'), 0) as rehab_cents
    from ledger_entries where project_id = p_project_id
  ),
  calc as (
    select p.*, rehab.rehab_cents,
           round(p.arv_cents::numeric * p.selling_pct_bps / 10000)::bigint as selling_cents
    from p, rehab
  ),
  totals as (
    select c.*,
           (c.purchase_cents + c.rehab_cents + c.financing_cents + c.holding_cents
            + c.contingency_cents + c.selling_cents) as all_in_cents
    from calc c
  )
  select
    t.purchase_cents, t.rehab_cents, t.financing_cents, t.holding_cents,
    t.contingency_cents, t.selling_cents, t.all_in_cents, t.arv_cents,
    (t.arv_cents - t.all_in_cents) as profit_cents,
    case when t.arv_cents = 0 then 0
         else round((t.arv_cents - t.all_in_cents)::numeric * 10000 / t.arv_cents)::bigint end,
    case when t.all_in_cents = 0 then 0
         else round((t.arv_cents - t.all_in_cents)::numeric * 10000 / t.all_in_cents)::bigint end,
    t.target_margin_bps,
    case when t.arv_cents = 0 then false
         else round((t.arv_cents - t.all_in_cents)::numeric * 10000 / t.arv_cents) >= t.target_margin_bps end
  from totals t;
$$;

grant execute on function project_underwriting(uuid) to authenticated;
