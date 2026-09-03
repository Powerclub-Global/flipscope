import { supabase } from './supabase'

export type OrgRole = 'owner' | 'pm' | 'field_crew' | 'investor' | 'subcontractor'

export const canEditFinancials = (r: OrgRole) => r === 'owner' || r === 'pm'
export const canSeeFinancials = (r: OrgRole) => r === 'owner' || r === 'pm' || r === 'investor'
export const canUploadProof = (r: OrgRole) => r !== 'investor'

export interface AuditRow {
  id: number
  table_name: string
  action: string
  new_row: Record<string, unknown> | null
  created_at: string
}

export interface ProofRow {
  id: string
  storage_path: string
  content_type: string
  caption: string | null
  captured_at: string
  lat: number | null
  lng: number | null
}

export async function myRole(): Promise<{ orgId: string; role: OrgRole } | null> {
  const { data } = await supabase.from('org_members').select('org_id, role').limit(1)
  if (!data?.[0]) return null
  return { orgId: data[0].org_id, role: data[0].role as OrgRole }
}

export async function auditTrail(limit = 20): Promise<AuditRow[]> {
  const { data } = await supabase
    .from('audit_log')
    .select('id, table_name, action, new_row, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as AuditRow[]) ?? []
}

export async function proofFeed(projectId: string): Promise<ProofRow[]> {
  const { data } = await supabase
    .from('proof_media')
    .select('id, storage_path, content_type, caption, captured_at, lat, lng')
    .eq('project_id', projectId)
    .order('captured_at', { ascending: false })
  return (data as ProofRow[]) ?? []
}

export async function proofUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('proof-media').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export async function uploadProof(
  orgId: string,
  projectId: string,
  file: File,
  caption: string,
  position: GeolocationPosition | null,
): Promise<void> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${orgId}/${projectId}/${crypto.randomUUID()}.${ext}`

  const { error: upErr } = await supabase.storage.from('proof-media').upload(path, file, {
    contentType: file.type,
  })
  if (upErr) throw upErr

  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase.from('proof_media').insert({
    org_id: orgId,
    project_id: projectId,
    storage_path: path,
    content_type: file.type,
    caption: caption || null,
    uploader_id: userData.user!.id,
    lat: position?.coords.latitude ?? null,
    lng: position?.coords.longitude ?? null,
  })
  if (error) throw error
}

export async function addLedgerEntry(
  orgId: string,
  projectId: string,
  entryType: 'budget' | 'committed' | 'actual' | 'revenue',
  category: string,
  amountCents: number,
): Promise<void> {
  const { error } = await supabase.from('ledger_entries').insert({
    org_id: orgId,
    project_id: projectId,
    entry_type: entryType,
    category,
    amount_cents: amountCents,
  })
  if (error) throw error
}

export interface CashflowMonth {
  month: string
  inflow_cents: number
  outflow_cents: number
  net_cents: number
}

export interface RiskRow {
  project_id: string
  project_name: string
  address: string
  status: string
  budget_cents: number
  actual_cents: number
  budget_used_bps: number
  days_to_target: number | null
  risk_level: 'green' | 'amber' | 'red'
}

export async function portfolioCashflow(portfolioId: string): Promise<CashflowMonth[]> {
  const { data, error } = await supabase.rpc('portfolio_cashflow', { p_portfolio_id: portfolioId })
  if (error) throw error
  return (data as CashflowMonth[]) ?? []
}

export async function portfolioRisk(portfolioId: string): Promise<RiskRow[]> {
  const { data, error } = await supabase.rpc('portfolio_risk', { p_portfolio_id: portfolioId })
  if (error) throw error
  return (data as RiskRow[]) ?? []
}

export type ScopeItemStatus = 'planned' | 'ready' | 'scheduled' | 'in_progress' | 'done'

export interface ScopeItem {
  id: string
  room: string
  trade: string
  task: string
  qty: number
  unit: string
  labor_cents: number
  material_cents: number
  status: ScopeItemStatus
  proof_required: boolean
}

export const canEditScope = (r: OrgRole) => r === 'owner' || r === 'pm'

export async function scopeItems(projectId: string): Promise<ScopeItem[]> {
  const { data, error } = await supabase
    .from('scope_items')
    .select('id, room, trade, task, qty, unit, labor_cents, material_cents, status, proof_required')
    .eq('project_id', projectId)
    .order('created_at')
  if (error) throw error
  return (data as ScopeItem[]) ?? []
}

export async function scopeEstimateTotal(projectId: string): Promise<number> {
  const { data, error } = await supabase.rpc('scope_estimate_total', { p_project_id: projectId })
  if (error) throw error
  return (data as number) ?? 0
}

export async function addScopeItem(
  orgId: string,
  projectId: string,
  item: { room: string; trade: string; task: string; qty: number; unit: string; laborCents: number; materialCents: number; proofRequired: boolean },
): Promise<void> {
  const { error } = await supabase.from('scope_items').insert({
    org_id: orgId,
    project_id: projectId,
    room: item.room,
    trade: item.trade,
    task: item.task,
    qty: item.qty,
    unit: item.unit,
    labor_cents: item.laborCents,
    material_cents: item.materialCents,
    proof_required: item.proofRequired,
  })
  if (error) throw error
}

export async function setScopeItemStatus(id: string, status: ScopeItemStatus): Promise<void> {
  const { error } = await supabase.from('scope_items').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteScopeItem(id: string): Promise<void> {
  const { error } = await supabase.from('scope_items').delete().eq('id', id)
  if (error) throw error
}
