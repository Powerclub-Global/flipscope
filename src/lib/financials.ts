import { supabase } from './supabase'

/**
 * All money in FlipScope is integer cents, computed server-side by the
 * financial engine (project_financials / portfolio_financials in Postgres).
 * The client never sums ledger rows itself — these calls are the only way
 * screens obtain financial figures, so every view shows the same numbers.
 */
export interface Financials {
  budget_cents: number
  committed_cents: number
  actual_cents: number
  revenue_cents: number
  profit_cents: number
  roi_bps: number
}

export async function projectFinancials(projectId: string): Promise<Financials> {
  const { data, error } = await supabase
    .rpc('project_financials', { p_project_id: projectId })
    .single()
  if (error) throw error
  return data as Financials
}

export async function portfolioFinancials(portfolioId: string): Promise<Financials> {
  const { data, error } = await supabase
    .rpc('portfolio_financials', { p_portfolio_id: portfolioId })
    .single()
  if (error) throw error
  return data as Financials
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function formatRoi(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`
}
