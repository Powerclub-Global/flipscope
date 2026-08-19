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
