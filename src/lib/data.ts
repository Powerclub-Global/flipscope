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

export interface Vendor {
  id: string
  name: string
  trade: string | null
  phone: string | null
  email: string | null
  rating: number | null
}

export type BidStatus = 'quoted' | 'preferred' | 'awarded' | 'declined'

export interface Bid {
  id: string
  trade: string
  amount_cents: number
  duration_days: number | null
  status: BidStatus
  notes: string | null
  vendors: { name: string; rating: number | null } | null
}

export const canSeeBids = canSeeFinancials
export const canManageBids = canEditFinancials

export async function vendorsList(): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from('vendors')
    .select('id, name, trade, phone, email, rating')
    .order('name')
  if (error) throw error
  return (data as Vendor[]) ?? []
}

export async function addVendor(orgId: string, v: { name: string; trade: string; phone: string; email: string }): Promise<Vendor> {
  const { data, error } = await supabase
    .from('vendors')
    .insert({ org_id: orgId, name: v.name, trade: v.trade || null, phone: v.phone || null, email: v.email || null })
    .select('id, name, trade, phone, email, rating')
    .single()
  if (error) throw error
  return data as Vendor
}

export async function bidsList(projectId: string): Promise<Bid[]> {
  const { data, error } = await supabase
    .from('bids')
    .select('id, trade, amount_cents, duration_days, status, notes, vendors(name, rating)')
    .eq('project_id', projectId)
    .order('trade')
    .order('amount_cents')
  if (error) throw error
  return (data as unknown as Bid[]) ?? []
}

export async function addBid(
  orgId: string,
  projectId: string,
  b: { vendorId: string; trade: string; amountCents: number; durationDays: number | null; notes: string },
): Promise<void> {
  const { error } = await supabase.from('bids').insert({
    org_id: orgId,
    project_id: projectId,
    vendor_id: b.vendorId,
    trade: b.trade,
    amount_cents: b.amountCents,
    duration_days: b.durationDays,
    notes: b.notes || null,
  })
  if (error) throw error
}

export async function setBidStatus(id: string, status: Exclude<BidStatus, 'awarded'>): Promise<void> {
  const { error } = await supabase.from('bids').update({ status }).eq('id', id)
  if (error) throw error
}

export async function awardBid(id: string): Promise<void> {
  const { error } = await supabase.rpc('award_bid', { p_bid_id: id })
  if (error) throw error
}

export async function deleteBid(id: string): Promise<void> {
  const { error } = await supabase.from('bids').delete().eq('id', id)
  if (error) throw error
}

export type MaterialStatus = 'selected' | 'ordered' | 'delivered' | 'installed' | 'returned'
export type Retailer = 'home_depot' | 'lowes' | 'amazon' | 'local' | 'other'

export interface Material {
  id: string
  name: string
  retailer: Retailer | null
  sku: string | null
  product_url: string | null
  qty: number
  unit: string
  unit_price_cents: number
  status: MaterialStatus
  ordered_at: string | null
  delivered_at: string | null
  notes: string | null
  vendors: { name: string } | null
  scope_items: { task: string } | null
}

export const canManageMaterials = canEditFinancials
export const canReceiveMaterials = (r: OrgRole) => r === 'owner' || r === 'pm' || r === 'field_crew'

export async function materialsList(projectId: string): Promise<Material[]> {
  const { data, error } = await supabase
    .from('materials')
    .select('id, name, retailer, sku, product_url, qty, unit, unit_price_cents, status, ordered_at, delivered_at, notes, vendors(name), scope_items(task)')
    .eq('project_id', projectId)
    .order('created_at')
  if (error) throw error
  return (data as unknown as Material[]) ?? []
}

export async function materialsTotal(projectId: string): Promise<number> {
  const { data, error } = await supabase.rpc('materials_total', { p_project_id: projectId })
  if (error) throw error
  return (data as number) ?? 0
}

export async function addMaterial(
  orgId: string,
  projectId: string,
  m: { name: string; retailer: Retailer | ''; sku: string; productUrl: string; qty: number; unit: string; unitPriceCents: number; vendorId: string; scopeItemId: string; notes: string },
): Promise<void> {
  const { error } = await supabase.from('materials').insert({
    org_id: orgId,
    project_id: projectId,
    name: m.name,
    retailer: m.retailer || null,
    sku: m.sku || null,
    product_url: m.productUrl || null,
    qty: m.qty,
    unit: m.unit,
    unit_price_cents: m.unitPriceCents,
    vendor_id: m.vendorId || null,
    scope_item_id: m.scopeItemId || null,
    notes: m.notes || null,
  })
  if (error) throw error
}

export async function orderMaterial(id: string): Promise<void> {
  const { error } = await supabase.rpc('order_material', { p_material_id: id })
  if (error) throw error
}

export async function setMaterialStatus(id: string, status: Exclude<MaterialStatus, 'ordered'>): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'delivered') patch.delivered_at = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('materials').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from('materials').delete().eq('id', id)
  if (error) throw error
}

export type TaskStatus = 'planned' | 'scheduled' | 'in_progress' | 'blocked' | 'done'

export interface ScheduleTask {
  id: string
  name: string
  trade: string | null
  start_date: string
  duration_days: number
  progress_pct: number
  status: TaskStatus
  notes: string | null
  scope_item_id: string | null
  vendors: { name: string } | null
}

export interface ScheduleSummary {
  starts_on: string | null
  ends_on: string | null
  task_count: number
  done_count: number
  progress_pct: number
}

export const canManageSchedule = canEditFinancials
export const canUpdateProgress = (r: OrgRole) => r !== 'investor'

export async function scheduleTasks(projectId: string): Promise<ScheduleTask[]> {
  const { data, error } = await supabase
    .from('schedule_tasks')
    .select('id, name, trade, start_date, duration_days, progress_pct, status, notes, scope_item_id, vendors(name)')
    .eq('project_id', projectId)
    .order('start_date')
    .order('created_at')
  if (error) throw error
  return (data as unknown as ScheduleTask[]) ?? []
}

export async function scheduleSummary(projectId: string): Promise<ScheduleSummary | null> {
  const { data, error } = await supabase.rpc('project_schedule', { p_project_id: projectId })
  if (error) throw error
  const row = (data as ScheduleSummary[])?.[0]
  return row ?? null
}

export async function addScheduleTask(
  orgId: string,
  projectId: string,
  t: { name: string; trade: string; startDate: string; durationDays: number; scopeItemId: string; vendorId: string; notes: string },
): Promise<void> {
  const { error } = await supabase.from('schedule_tasks').insert({
    org_id: orgId,
    project_id: projectId,
    name: t.name,
    trade: t.trade || null,
    start_date: t.startDate,
    duration_days: t.durationDays,
    scope_item_id: t.scopeItemId || null,
    vendor_id: t.vendorId || null,
    notes: t.notes || null,
  })
  if (error) throw error
}

export async function updateScheduleTask(
  id: string,
  patch: Partial<{ progress_pct: number; status: TaskStatus; start_date: string; duration_days: number }>,
): Promise<void> {
  const { error } = await supabase.from('schedule_tasks').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteScheduleTask(id: string): Promise<void> {
  const { error } = await supabase.from('schedule_tasks').delete().eq('id', id)
  if (error) throw error
}
