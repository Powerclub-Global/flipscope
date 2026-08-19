-- FlipScope migration 003 — Portfolio layer (Phase 2)
-- Cash-flow calendar and risk signals, computed server-side from the same
-- ledger every other screen reads.

-- Monthly cash flow across every project in a portfolio.
-- Outflows: actual spend + purchases (dated by project start).
-- Inflows: revenue entries.
create or replace function portfolio_cashflow(p_portfolio_id uuid)
returns table (
  month          date,      -- first day of the month
  inflow_cents   bigint,
  outflow_cents  bigint,
  net_cents      bigint
)
language sql
stable
security invoker
as $$
  with proj as (
    select pr.id, coalesce(pr.purchase_price_cents, 0) as purchase_cents,
           coalesce(pr.started_at, pr.created_at::date) as start_date
    from projects pr
    join properties p on p.id = pr.property_id
    where p.portfolio_id = p_portfolio_id
  ),
  flows as (
    select date_trunc('month', le.entry_date)::date as month,
           case when le.entry_type = 'revenue' then le.amount_cents else 0 end as inflow,
           case when le.entry_type = 'actual'  then le.amount_cents else 0 end as outflow
    from ledger_entries le
    where le.project_id in (select id from proj)
      and le.entry_type in ('revenue', 'actual')
    union all
    select date_trunc('month', start_date)::date, 0, purchase_cents
    from proj
    where purchase_cents > 0
  )
  select month,
         sum(inflow)::bigint,
         sum(outflow)::bigint,
         (sum(inflow) - sum(outflow))::bigint
  from flows
  group by month
  order by month;
$$;

-- Per-project risk signals for the heatmap and greenlight view.
-- budget_used_bps: actual vs budget in basis points (>10000 = over budget).
-- days_to_target: negative means the target finish date has passed.
create or replace function portfolio_risk(p_portfolio_id uuid)
returns table (
  project_id       uuid,
  project_name     text,
  address          text,
  status           project_status,
  budget_cents     bigint,
  actual_cents     bigint,
  budget_used_bps  bigint,
  days_to_target   integer,
  risk_level       text       -- 'green' | 'amber' | 'red'
)
language sql
stable
security invoker
as $$
  with proj as (
    select pr.id, pr.name, prop.address, pr.status, pr.target_finish
    from projects pr
    join properties prop on prop.id = pr.property_id
    where prop.portfolio_id = p_portfolio_id
  ),
  fin as (
    select le.project_id,
      coalesce(sum(le.amount_cents) filter (where le.entry_type = 'budget'), 0) as budget_cents,
      coalesce(sum(le.amount_cents) filter (where le.entry_type = 'actual'), 0) as actual_cents
    from ledger_entries le
    where le.project_id in (select id from proj)
    group by le.project_id
  ),
  scored as (
    select p.id, p.name, p.address, p.status,
      coalesce(f.budget_cents, 0) as budget_cents,
      coalesce(f.actual_cents, 0) as actual_cents,
      case when coalesce(f.budget_cents, 0) = 0 then 0
           else round(coalesce(f.actual_cents, 0)::numeric * 10000 / f.budget_cents)::bigint
      end as budget_used_bps,
      case when p.target_finish is null then null
           else (p.target_finish - current_date)
      end as days_to_target
    from proj p
    left join fin f on f.project_id = p.id
  )
  select id, name, address, status, budget_cents, actual_cents, budget_used_bps, days_to_target,
    case
      when budget_used_bps > 10000 or (days_to_target is not null and days_to_target < 0)  then 'red'
      when budget_used_bps > 8500  or (days_to_target is not null and days_to_target < 14) then 'amber'
      else 'green'
    end
  from scored
  order by budget_used_bps desc;
$$;

grant execute on function portfolio_cashflow(uuid) to authenticated;
grant execute on function portfolio_risk(uuid) to authenticated;
