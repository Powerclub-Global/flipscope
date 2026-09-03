// Pages backed by the real Phase 0-2 backend: every financial figure comes
// from the server-side engine, proof and audit come from migration 002,
// risk and cash flow from migration 003.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCents, formatRoi } from '../lib/financials'
import type { Financials } from '../lib/financials'
import {
  auditTrail, proofFeed, proofUrl, uploadProof, addLedgerEntry,
  portfolioCashflow, portfolioRisk,
  scopeItems, scopeEstimateTotal, addScopeItem, setScopeItemStatus, deleteScopeItem,
  vendorsList, addVendor, bidsList, addBid, setBidStatus, awardBid, deleteBid,
  materialsList, materialsTotal, addMaterial, orderMaterial, setMaterialStatus, deleteMaterial,
  scheduleTasks, scheduleSummary, addScheduleTask, updateScheduleTask, deleteScheduleTask,
  changeOrdersList, addChangeOrder, decideChangeOrder, voidChangeOrder, rfisList, addRfi, answerRfi, closeRfi,
  punchItems, addPunchItem, setPunchStatus, deletePunchItem,
  closeoutItems, seedCloseoutChecklist, setCloseoutItemStatus, addCloseoutItem,
  warrantiesList, addWarranty, deleteWarranty, closeoutReadiness, closeProject,
  projectUnderwriting, dealAssumptions, updateDealAssumptions,
  canEditFinancials, canSeeFinancials, canUploadProof, canEditScope, canSeeBids, canManageBids,
  canManageMaterials, canReceiveMaterials, canManageSchedule, canUpdateProgress,
  canSeeChangeOrders, canManageChangeOrders, canRaiseRfi, canAnswerRfi,
  canRaisePunch, canManageCloseout,
} from '../lib/data'
import type {
  OrgRole, AuditRow, ProofRow, CashflowMonth, RiskRow, ScopeItem, ScopeItemStatus, Vendor, Bid,
  Material, Retailer, ScheduleTask, ScheduleSummary, TaskStatus, ChangeOrder, Rfi,
  PunchItem, PunchStatus, CloseoutItem, Warranty, CloseoutReadiness,
  Underwriting, DealAssumptions,
} from '../lib/data'

export interface Ctx {
  orgId: string
  orgName: string
  role: OrgRole
  portfolioId: string
  hasProject: boolean
  projectId: string
  projectName: string
  address: string
  arvCents: number | null
  fin: Financials | null
  portfolioFin: Financials | null
  reload: () => void
  go: (page: string) => void
  addProperty: () => void
}

function NoPropertyCard({ ctx }: { ctx: Ctx }) {
  return (
    <div className="emptyState">
      <b>No property yet</b>
      Add your first property to start tracking scope, cost and schedule.
      <div style={{ marginTop: 10 }}>
        <button className="btn p" onClick={ctx.addProperty}>+ Add property</button>
      </div>
    </div>
  )
}

const kpi = (label: string, val: string, delta?: string, color?: string) => (
  <div className="kpi" key={label}><small>{label}</small><strong style={color ? { color } : undefined}>{val}</strong>{delta && <div className="delta">{delta}</div>}</div>
)

export function HomePage({ ctx }: { ctx: Ctx }) {
  const [risk, setRisk] = useState<RiskRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  useEffect(() => {
    if (!ctx.portfolioId) return
    portfolioRisk(ctx.portfolioId).then(setRisk).catch(() => {})
    auditTrail(4).then(setAudit).catch(() => {})
  }, [ctx.portfolioId])

  const f = ctx.portfolioFin
  const red = risk.filter((r) => r.risk_level === 'red')

  return (
    <section className="page on">
      <div className="hero">
        <span className="pill green">FLIPSCOPE COMMAND CENTER</span>
        <h1>From property walk to <span>verified profit.</span></h1>
        <p>Capture the property once. FlipScope turns the walkthrough into scope, quantities and costs, helps you design the finished space, then runs the job through verified completion.</p>
        <div className="heroActions">
          <button className="btn p" onClick={() => ctx.go('capture')}>● Record Property Walkthrough</button>
          <button className="btn" onClick={() => ctx.go('design')}>✦ Open AI Designer</button>
          <button className="btn" onClick={() => ctx.go('financials')}>Review Financials</button>
        </div>
      </div>

      {!ctx.hasProject && <NoPropertyCard ctx={ctx} />}

      {f && (
        <div className="grid">
          {kpi('Portfolio budget', formatCents(f.budget_cents))}
          {kpi('Actual to date', formatCents(f.actual_cents))}
          {kpi('Projected profit', formatCents(f.profit_cents), undefined, f.profit_cents >= 0 ? 'var(--green)' : 'var(--red)')}
          {kpi('ROI', formatRoi(f.roi_bps), 'from the live ledger', f.roi_bps >= 0 ? 'var(--green)' : 'var(--red)')}
        </div>
      )}

      {ctx.hasProject && (
        <div className="grid2">
          <div className="card">
            <div className="sectiontitle"><h2>Portfolio Health</h2>
              <span className={`pill ${red.length ? 'red' : 'green'}`}>{red.length ? `${red.length} at risk` : 'On Track'}</span></div>
            <div className="timeline">
              {risk.map((r) => (
                <div className="tl" key={r.project_id}>
                  <b>{r.project_name}</b>
                  <small> {r.address} · {(r.budget_used_bps / 100).toFixed(0)}% of budget{r.days_to_target != null ? ` · ${r.days_to_target}d to target` : ''} · {r.risk_level.toUpperCase()}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="sectiontitle"><h2>Live Project Feed</h2><button className="btn ghost" onClick={() => ctx.go('feed')}>View all</button></div>
            <div className="feed">
              {audit.map((a) => (
                <div className="event" key={a.id}>
                  <div className="dot">{a.table_name === 'ledger_entries' ? '$' : '✓'}</div>
                  <div><b>{a.action} {a.table_name.replace('_', ' ')}</b><br /><small>{new Date(a.created_at).toLocaleString()}</small></div>
                </div>
              ))}
              {audit.length === 0 && <p className="subtle">No activity yet.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export function FinancialsPage({ ctx }: { ctx: Ctx }) {
  const [cash, setCash] = useState<CashflowMonth[]>([])
  useEffect(() => {
    if (!ctx.portfolioId) return
    portfolioCashflow(ctx.portfolioId).then(setCash).catch(() => {})
  }, [ctx.portfolioId])
  const f = ctx.fin
  const peak = Math.max(1, ...cash.map((r) => Math.max(r.inflow_cents, r.outflow_cents)))

  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Financials</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }

  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Financials — {ctx.projectName}</h2>
        <div className="subtle">Single server-side engine · integer cents · append-only ledger</div></div>
        <span className="pill green">LIVE</span></div>
      {f && (
        <div className="grid">
          {kpi('Budget', formatCents(f.budget_cents))}
          {kpi('Committed', formatCents(f.committed_cents))}
          {kpi('Actual', formatCents(f.actual_cents))}
          {kpi('Profit', formatCents(f.profit_cents), formatRoi(f.roi_bps) + ' ROI', f.profit_cents >= 0 ? 'var(--green)' : 'var(--red)')}
        </div>
      )}
      {canEditFinancials(ctx.role) && <LedgerForm ctx={ctx} />}
      <div className="card">
        <h3>Portfolio cash flow</h3>
        {cash.map((r) => (
          <div className="cashrow" key={r.month}>
            <span>{new Date(r.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</span>
            <div className="cashbar"><i style={{ width: `${(r.outflow_cents / peak) * 100}%`, background: '#8a4a4a' }} /></div>
            <b style={{ color: r.net_cents >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCents(r.net_cents)}</b>
          </div>
        ))}
        {cash.length === 0 && <p className="subtle">No cash movement yet.</p>}
      </div>
    </section>
  )
}

function LedgerForm({ ctx }: { ctx: Ctx }) {
  const [entryType, setEntryType] = useState<'budget' | 'committed' | 'actual' | 'revenue'>('actual')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const cents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(cents) || cents === 0) { setError('Enter a dollar amount'); return }
    try {
      await addLedgerEntry(ctx.orgId, ctx.projectId, entryType, category.trim() || 'general', cents)
      setCategory(''); setAmount('')
      ctx.reload()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
  }

  return (
    <div className="card">
      <h3>Add ledger entry</h3>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="search" style={{ maxWidth: 140 }} value={entryType} onChange={(e) => setEntryType(e.target.value as typeof entryType)}>
          <option value="budget">Budget</option><option value="committed">Committed</option>
          <option value="actual">Actual</option><option value="revenue">Revenue</option>
        </select>
        <input className="search" style={{ maxWidth: 220 }} placeholder="Category (e.g. kitchen)" value={category} onChange={(e) => setCategory(e.target.value)} />
        <input className="search" style={{ maxWidth: 140 }} placeholder="Amount $" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn p">Add entry</button>
        {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
      </form>
    </div>
  )
}

export function FieldPage({ ctx }: { ctx: Ctx }) {
  const [items, setItems] = useState<ProofRow[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!ctx.projectId) return
    const rows = await proofFeed(ctx.projectId)
    setItems(rows)
    const u: Record<string, string> = {}
    for (const r of rows) {
      const s = await proofUrl(r.storage_path)
      if (s) u[r.id] = s
    }
    setUrls(u)
  }, [ctx.projectId])
  useEffect(() => { reload() }, [reload])

  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Field & Verification</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError('')
    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 3000 })
    })
    try {
      await uploadProof(ctx.orgId, ctx.projectId, file, caption, position)
      setCaption('')
      await reload()
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed') }
    setBusy(false); e.target.value = ''
  }

  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Field & Verification — {ctx.projectName}</h2>
        <div className="subtle">Proof-chain media: uploader, timestamp and location recorded forever.</div></div>
        <span className="pill green">LIVE</span></div>
      {canUploadProof(ctx.role) && (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="search" style={{ maxWidth: 340 }} placeholder="Caption (what does this show?)" value={caption} onChange={(e) => setCaption(e.target.value)} />
            <label className="btn p" style={{ cursor: 'pointer' }}>
              {busy ? 'Uploading…' : '📷 Add proof'}
              <input type="file" accept="image/*,video/*" hidden onChange={onFile} disabled={busy} />
            </label>
            {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
          </div>
        </div>
      )}
      <div className="photoGrid">
        {items.map((p) => (
          <div className="photo" key={p.id} title={`${p.caption ?? ''} · ${new Date(p.captured_at).toLocaleString()}`}>
            {urls[p.id] && p.content_type.startsWith('image/')
              ? <img src={urls[p.id]} alt={p.caption ?? 'proof'} />
              : <span>{p.content_type}</span>}
          </div>
        ))}
        {items.length === 0 && <div className="emptyState" style={{ gridColumn: '1/-1' }}><b>No proof yet</b>Photos land here with uploader, time and GPS attached.</div>}
      </div>
    </section>
  )
}

export function FeedPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  useEffect(() => { auditTrail(50).then(setRows).catch(() => {}) }, [])
  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Project Feed</h2>
        <div className="subtle">Append-only audit trail — every change, by whom, forever.</div></div>
        <span className="pill green">LIVE</span></div>
      <div className="card feed">
        {rows.map((r) => {
          const n = r.new_row as { name?: string; category?: string; amount_cents?: number } | null
          return (
            <div className="event" key={r.id}>
              <div className="dot">{r.table_name === 'ledger_entries' ? '$' : r.table_name === 'proof_media' ? '📷' : '✓'}</div>
              <div>
                <b>{r.action} {r.table_name.replace('_', ' ')}{n?.name ? ` — ${n.name}` : n?.category ? ` — ${n.category}` : ''}</b>
                {n?.amount_cents != null && <> · {formatCents(n.amount_cents)}</>}
              </div>
              <small>{new Date(r.created_at).toLocaleString()}</small>
            </div>
          )
        })}
        {rows.length === 0 && <p className="subtle">No activity recorded yet.</p>}
      </div>
    </section>
  )
}

export function PortalPage({ ctx }: { ctx: Ctx }) {
  const f = ctx.portfolioFin
  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Client / Investor Portal</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }
  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Client / Investor Portal</h2>
        <div className="subtle">Exactly what an investor login sees: verified numbers, proof, and the audit trail — read-only.</div></div>
        <span className="pill green">LIVE</span></div>
      {f && (
        <div className="grid">
          {kpi('Capital deployed', formatCents(f.actual_cents))}
          {kpi('Budget', formatCents(f.budget_cents))}
          {kpi('Projected profit', formatCents(f.profit_cents), undefined, f.profit_cents >= 0 ? 'var(--green)' : 'var(--red)')}
          {kpi('ROI', formatRoi(f.roi_bps))}
        </div>
      )}
      <div className="card">
        <h3>Trust guarantees</h3>
        <div className="timeline">
          <div className="tl"><b>Every figure from one engine</b><small>The investor sees the same cents the owner sees — computed once, server-side.</small></div>
          <div className="tl"><b>Proof-chain media</b><small>Photos carry uploader, timestamp and GPS; they can never be edited or deleted.</small></div>
          <div className="tl"><b>Append-only audit log</b><small>Every change is recorded permanently — including by whom.</small></div>
        </div>
        <p className="subtle" style={{ fontSize: 12.5 }}>Try it: sign out and log in as investor@flipscope.local — same page, zero edit affordances, writes rejected by the database itself.</p>
      </div>
    </section>
  )
}

export function RiskPage({ ctx }: { ctx: Ctx }) {
  const [rows, setRows] = useState<RiskRow[]>([])
  useEffect(() => {
    if (!ctx.portfolioId) return
    portfolioRisk(ctx.portfolioId).then(setRows).catch(() => {})
  }, [ctx.portfolioId])
  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Risk Radar</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }
  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Risk Radar</h2>
        <div className="subtle">Budget variance and schedule slip, scored live from the ledger.</div></div>
        <span className="pill green">LIVE</span></div>
      <div className="grid3">
        {rows.map((r) => (
          <div className="card" key={r.project_id}>
            <div className="sectiontitle" style={{ margin: '0 0 8px' }}>
              <h3 style={{ margin: 0 }}>{r.project_name}</h3>
              <span className={`pill ${r.risk_level === 'green' ? 'green' : r.risk_level === 'amber' ? 'amber' : 'red'}`}>{r.risk_level.toUpperCase()}</span>
            </div>
            <p className="subtle" style={{ margin: '0 0 8px', fontSize: 12 }}>{r.address}</p>
            <div className="minirow"><span>Budget used</span><strong>{(r.budget_used_bps / 100).toFixed(1)}%</strong></div>
            <div className="progress"><i style={{ width: `${Math.min(100, r.budget_used_bps / 100)}%` }} /></div>
            <div className="minirow" style={{ marginTop: 8 }}><span>Days to target</span><strong>{r.days_to_target ?? '—'}</strong></div>
            <div className="minirow"><span>Spent</span><strong>{formatCents(r.actual_cents)} of {formatCents(r.budget_cents)}</strong></div>
          </div>
        ))}
      </div>
    </section>
  )
}

interface Member { user_id: string; role: string }

export function TeamPage({ ctx }: { ctx: Ctx }) {
  const [members, setMembers] = useState<Member[]>([])
  useEffect(() => {
    supabase.from('org_members').select('user_id, role').then(({ data }) => setMembers((data as Member[]) ?? []))
  }, [])
  const access: Record<string, string> = {
    owner: 'Full access', pm: 'Projects + financials', field_crew: 'Schedule + proof upload',
    investor: 'Read-only reports', subcontractor: 'Own tasks + proof',
  }
  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Team & Access — {ctx.orgName}</h2>
        <div className="subtle">Roles are enforced by the database, not hidden buttons.</div></div>
        <span className="pill green">LIVE</span></div>
      <div className="card tablewrap">
        <table className="table">
          <thead><tr><th>Member</th><th>Role</th><th>Access</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{m.user_id.slice(0, 8)}…</td>
              <td><span className="pill green">{m.role}</span></td><td>{access[m.role] ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AddScopeItemForm({ ctx, onAdded }: { ctx: Ctx; onAdded: () => void }) {
  const [room, setRoom] = useState('')
  const [trade, setTrade] = useState('')
  const [task, setTask] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('LS')
  const [labor, setLabor] = useState('')
  const [material, setMaterial] = useState('')
  const [proofRequired, setProofRequired] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await addScopeItem(ctx.orgId, ctx.projectId, {
        room: room.trim() || 'General',
        trade: trade.trim() || 'General',
        task: task.trim(),
        qty: Number(qty) || 1,
        unit: unit.trim() || 'LS',
        laborCents: Math.round((Number(labor) || 0) * 100),
        materialCents: Math.round((Number(material) || 0) * 100),
        proofRequired,
      })
      setRoom(''); setTrade(''); setTask(''); setQty('1'); setUnit('LS'); setLabor(''); setMaterial('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add scope item')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>Add scope item</h3>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="search" style={{ maxWidth: 130 }} placeholder="Room" value={room} onChange={(e) => setRoom(e.target.value)} />
        <input className="search" style={{ maxWidth: 130 }} placeholder="Trade" value={trade} onChange={(e) => setTrade(e.target.value)} />
        <input className="search" style={{ maxWidth: 220 }} placeholder="Task" value={task} onChange={(e) => setTask(e.target.value)} required />
        <input className="search" style={{ maxWidth: 70 }} placeholder="Qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input className="search" style={{ maxWidth: 80 }} placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <input className="search" style={{ maxWidth: 110 }} placeholder="Labor $/unit" inputMode="decimal" value={labor} onChange={(e) => setLabor(e.target.value)} />
        <input className="search" style={{ maxWidth: 110 }} placeholder="Material $/unit" inputMode="decimal" value={material} onChange={(e) => setMaterial(e.target.value)} />
        <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
          <input type="checkbox" checked={proofRequired} onChange={(e) => setProofRequired(e.target.checked)} />Proof required
        </label>
        <button className="btn p" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
        {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
      </form>
    </div>
  )
}

const SCOPE_STATUSES: ScopeItemStatus[] = ['planned', 'ready', 'scheduled', 'in_progress', 'done']

export function LiveScopePage({ ctx }: { ctx: Ctx }) {
  const [items, setItems] = useState<ScopeItem[]>([])
  const [total, setTotal] = useState(0)
  const showMoney = canEditFinancials(ctx.role) || ctx.role === 'investor'
  const canEdit = canEditScope(ctx.role)

  const reload = useCallback(async () => {
    const [rows, sum] = await Promise.all([scopeItems(ctx.projectId), scopeEstimateTotal(ctx.projectId)])
    setItems(rows)
    setTotal(sum)
  }, [ctx.projectId])
  useEffect(() => { reload() }, [reload])

  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Scope & Estimate</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }

  async function toggleDone(item: ScopeItem) {
    await setScopeItemStatus(item.id, item.status === 'done' ? 'planned' : 'done')
    reload()
  }

  async function remove(id: string) {
    await deleteScopeItem(id)
    reload()
  }

  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Scope & Estimate — {ctx.projectName}</h2>
        <div className="subtle">Real line items, priced per unit. AI walkthrough capture (Phase 3) will insert here too.</div></div>
        <span className="pill green">LIVE</span></div>
      <div className="grid" style={{ gridTemplateColumns: showMoney ? 'repeat(2,minmax(0,1fr))' : '1fr' }}>
        <div className="kpi"><small>Line items</small><strong>{items.length}</strong></div>
        {showMoney && <div className="kpi"><small>Estimate total</small><strong>{formatCents(total)}</strong></div>}
      </div>

      {canEdit && <AddScopeItemForm ctx={ctx} onAdded={reload} />}

      <div className="card">
        {items.map((s) => (
          <div className="scopeitem" key={s.id}>
            <div className={`check ${s.status === 'done' ? 'done' : ''}`} onClick={() => canEdit && toggleDone(s)} style={{ cursor: canEdit ? 'pointer' : 'default' }}>
              {s.status === 'done' ? '✓' : ''}
            </div>
            <div>
              <strong>{s.task}</strong>
              <div className="scopemeta">
                <span className="pill">{s.room}</span><span className="pill">{s.trade}</span>
                <span className="pill">{s.qty} {s.unit}</span>
                {s.proof_required && <span className="pill green">proof required</span>}
                {canEdit ? (
                  <select
                    className="search"
                    style={{ maxWidth: 130, padding: '3px 6px', fontSize: 10 }}
                    value={s.status}
                    onChange={(e) => setScopeItemStatus(s.id, e.target.value as ScopeItemStatus).then(reload)}
                  >
                    {SCOPE_STATUSES.map((st) => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
                  </select>
                ) : (
                  <span className="pill">{s.status.replace('_', ' ')}</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {showMoney && <b>{formatCents(Math.round(s.qty * (s.labor_cents + s.material_cents)))}</b>}
              {canEdit && <div><button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11, marginTop: 4 }} onClick={() => remove(s.id)}>Remove</button></div>}
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="emptyState"><b>No scope yet</b>Add the first line item above.</div>}
      </div>
    </section>
  )
}

function AddVendorForm({ ctx, onAdded }: { ctx: Ctx; onAdded: (v: Vendor) => void }) {
  const [name, setName] = useState('')
  const [trade, setTrade] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const v = await addVendor(ctx.orgId, { name: name.trim(), trade: trade.trim(), phone: phone.trim(), email: email.trim() })
      setName(''); setTrade(''); setPhone(''); setEmail('')
      onAdded(v)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add vendor')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input className="search" style={{ maxWidth: 200 }} placeholder="Vendor name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="search" style={{ maxWidth: 130 }} placeholder="Trade" value={trade} onChange={(e) => setTrade(e.target.value)} />
      <input className="search" style={{ maxWidth: 140 }} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input className="search" style={{ maxWidth: 200 }} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add vendor'}</button>
      {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
    </form>
  )
}

function AddBidForm({ ctx, vendors, onAdded }: { ctx: Ctx; vendors: Vendor[]; onAdded: () => void }) {
  const [vendorId, setVendorId] = useState('')
  const [trade, setTrade] = useState('')
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function pickVendor(id: string) {
    setVendorId(id)
    const v = vendors.find((x) => x.id === id)
    if (v?.trade && !trade) setTrade(v.trade)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const cents = Math.round(Number(amount) * 100)
    if (!vendorId) { setError('Pick a vendor'); return }
    if (!Number.isFinite(cents) || cents <= 0) { setError('Enter a bid amount'); return }
    setBusy(true)
    try {
      await addBid(ctx.orgId, ctx.projectId, {
        vendorId,
        trade: trade.trim() || 'General',
        amountCents: cents,
        durationDays: days ? Number(days) : null,
        notes: notes.trim(),
      })
      setAmount(''); setDays(''); setNotes('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add bid')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select className="search" style={{ maxWidth: 220 }} value={vendorId} onChange={(e) => pickVendor(e.target.value)}>
        <option value="">Vendor…</option>
        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.trade ? ` · ${v.trade}` : ''}</option>)}
      </select>
      <input className="search" style={{ maxWidth: 130 }} placeholder="Trade" value={trade} onChange={(e) => setTrade(e.target.value)} />
      <input className="search" style={{ maxWidth: 120 }} placeholder="Bid $" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input className="search" style={{ maxWidth: 80 }} placeholder="Days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      <input className="search" style={{ maxWidth: 220 }} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn p" disabled={busy}>{busy ? 'Adding…' : 'Add bid'}</button>
      {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
    </form>
  )
}

export function LiveBidsPage({ ctx }: { ctx: Ctx }) {
  const [bids, setBids] = useState<Bid[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [error, setError] = useState('')
  const canManage = canManageBids(ctx.role)

  const reload = useCallback(async () => {
    if (!ctx.projectId) return
    const [b, v] = await Promise.all([bidsList(ctx.projectId), vendorsList()])
    setBids(b)
    setVendors(v)
  }, [ctx.projectId])
  useEffect(() => { reload() }, [reload])

  if (!canSeeBids(ctx.role)) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Bid Room</h2></div>
        <div className="emptyState"><b>Bids are visible to owners, PMs and investors only.</b></div>
      </section>
    )
  }
  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Bid Room</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }

  async function run(fn: () => Promise<void>) {
    setError('')
    try { await fn(); await reload(); ctx.reload() }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed') }
  }

  const trades = [...new Set(bids.map((b) => b.trade))]

  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Bid Room — {ctx.projectName}</h2>
        <div className="subtle">Awarding a bid declines the competing bids for that trade and commits the amount in the ledger.</div></div>
        <span className="pill green">LIVE</span></div>

      {canManage && (
        <div className="card">
          <h3>Add bid</h3>
          <AddBidForm ctx={ctx} vendors={vendors} onAdded={reload} />
          <details style={{ marginTop: 10 }}>
            <summary className="subtle" style={{ cursor: 'pointer', fontSize: 12 }}>New vendor</summary>
            <div style={{ marginTop: 8 }}><AddVendorForm ctx={ctx} onAdded={() => reload()} /></div>
          </details>
        </div>
      )}
      {error && <p style={{ color: 'var(--red)', fontSize: 12 }}>{error}</p>}

      {trades.map((trade) => (
        <div className="card tablewrap" key={trade}>
          <h3>{trade}</h3>
          <table className="table">
            <thead><tr><th>Vendor</th><th>Bid</th><th>Days</th><th>Rating</th><th>Status</th>{canManage && <th />}</tr></thead>
            <tbody>
              {bids.filter((b) => b.trade === trade).map((b) => (
                <tr key={b.id}>
                  <td>{b.vendors?.name ?? '—'}{b.notes && <div className="subtle" style={{ fontSize: 10 }}>{b.notes}</div>}</td>
                  <td>{formatCents(b.amount_cents)}</td>
                  <td>{b.duration_days ?? '—'}</td>
                  <td>{b.vendors?.rating != null ? `${b.vendors.rating}★` : '—'}</td>
                  <td><span className={`pill ${b.status === 'awarded' ? 'green' : b.status === 'preferred' ? 'amber' : b.status === 'declined' ? 'red' : ''}`}>{b.status}</span></td>
                  {canManage && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {b.status !== 'awarded' && b.status !== 'declined' && (
                        <>
                          <button className="btn p" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => run(() => awardBid(b.id))}>Award</button>{' '}
                          {b.status !== 'preferred' && <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => run(() => setBidStatus(b.id, 'preferred'))}>Prefer</button>}{' '}
                        </>
                      )}
                      {b.status !== 'awarded' && <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => run(() => deleteBid(b.id))}>Remove</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {bids.length === 0 && <div className="emptyState"><b>No bids yet</b>{canManage ? 'Add a vendor, then log their bid above.' : 'Bids will appear here once the PM logs them.'}</div>}
    </section>
  )
}

const RETAILERS: [Retailer, string][] = [['home_depot', 'Home Depot'], ['lowes', "Lowe's"], ['amazon', 'Amazon'], ['local', 'Local supplier'], ['other', 'Other']]
const retailerLabel = (r: Retailer | null) => RETAILERS.find(([k]) => k === r)?.[1] ?? '—'

function AddMaterialForm({ ctx, vendors, scope, onAdded }: { ctx: Ctx; vendors: Vendor[]; scope: ScopeItem[]; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [retailer, setRetailer] = useState<Retailer | ''>('')
  const [sku, setSku] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('EA')
  const [price, setPrice] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [scopeItemId, setScopeItemId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await addMaterial(ctx.orgId, ctx.projectId, {
        name: name.trim(), retailer, sku: sku.trim(), productUrl: productUrl.trim(),
        qty: Number(qty) || 1, unit: unit.trim() || 'EA',
        unitPriceCents: Math.round((Number(price) || 0) * 100),
        vendorId, scopeItemId, notes: notes.trim(),
      })
      setName(''); setSku(''); setProductUrl(''); setQty('1'); setPrice(''); setNotes('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add material')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input className="search" style={{ maxWidth: 220 }} placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} required />
      <select className="search" style={{ maxWidth: 150 }} value={retailer} onChange={(e) => setRetailer(e.target.value as Retailer | '')}>
        <option value="">Retailer…</option>
        {RETAILERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input className="search" style={{ maxWidth: 120 }} placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
      <input className="search" style={{ maxWidth: 220 }} placeholder="Product URL" value={productUrl} onChange={(e) => setProductUrl(e.target.value)} />
      <input className="search" style={{ maxWidth: 70 }} placeholder="Qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
      <input className="search" style={{ maxWidth: 70 }} placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <input className="search" style={{ maxWidth: 110 }} placeholder="$ / unit" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      <select className="search" style={{ maxWidth: 180 }} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
        <option value="">Vendor (optional)</option>
        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      <select className="search" style={{ maxWidth: 220 }} value={scopeItemId} onChange={(e) => setScopeItemId(e.target.value)}>
        <option value="">Scope line (optional)</option>
        {scope.map((s) => <option key={s.id} value={s.id}>{s.room} · {s.task}</option>)}
      </select>
      <input className="search" style={{ maxWidth: 200 }} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn p" disabled={busy}>{busy ? 'Adding…' : 'Add material'}</button>
      {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
    </form>
  )
}

export function LiveMaterialsPage({ ctx }: { ctx: Ctx }) {
  const [items, setItems] = useState<Material[]>([])
  const [total, setTotal] = useState(0)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [scope, setScope] = useState<ScopeItem[]>([])
  const [error, setError] = useState('')
  const showMoney = canSeeFinancials(ctx.role)
  const canManage = canManageMaterials(ctx.role)
  const canReceive = canReceiveMaterials(ctx.role)

  const reload = useCallback(async () => {
    if (!ctx.projectId) return
    const [m, v, s] = await Promise.all([
      materialsList(ctx.projectId),
      vendorsList(),
      scopeItems(ctx.projectId),
    ])
    setItems(m); setVendors(v); setScope(s)
    if (canSeeFinancials(ctx.role)) setTotal(await materialsTotal(ctx.projectId))
  }, [ctx.projectId, ctx.role])
  useEffect(() => { reload() }, [reload])

  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Materials & POs</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }

  async function run(fn: () => Promise<void>) {
    setError('')
    try { await fn(); await reload(); ctx.reload() }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed') }
  }

  const pillClass = (s: Material['status']) =>
    s === 'installed' || s === 'delivered' ? 'green' : s === 'ordered' ? 'amber' : s === 'returned' ? 'red' : ''

  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Materials & POs — {ctx.projectName}</h2>
        <div className="subtle">Selections tied to scope lines and vendors. Placing an order commits the cost in the ledger.</div></div>
        <span className="pill green">LIVE</span></div>

      <div className="grid" style={{ gridTemplateColumns: showMoney ? 'repeat(3,minmax(0,1fr))' : 'repeat(2,minmax(0,1fr))' }}>
        <div className="kpi"><small>Items</small><strong>{items.length}</strong></div>
        <div className="kpi"><small>On order</small><strong>{items.filter((m) => m.status === 'ordered').length}</strong></div>
        {showMoney && <div className="kpi"><small>Materials total</small><strong>{formatCents(total)}</strong></div>}
      </div>

      {canManage && (
        <div className="card">
          <h3>Add material</h3>
          <AddMaterialForm ctx={ctx} vendors={vendors} scope={scope} onAdded={reload} />
        </div>
      )}
      {error && <p style={{ color: 'var(--red)', fontSize: 12 }}>{error}</p>}

      <div className="card tablewrap">
        <table className="table">
          <thead><tr><th>Item</th><th>Source</th><th>Qty</th>{showMoney && <th>Price</th>}{showMoney && <th>Total</th>}<th>Status</th>{(canManage || canReceive) && <th />}</tr></thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.product_url ? <a href={m.product_url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>{m.name}</a> : m.name}
                  {m.scope_items && <div className="subtle" style={{ fontSize: 10 }}>for: {m.scope_items.task}</div>}
                  {m.notes && <div className="subtle" style={{ fontSize: 10 }}>{m.notes}</div>}
                </td>
                <td>{m.vendors?.name ?? retailerLabel(m.retailer)}{m.sku && <div className="subtle" style={{ fontSize: 10 }}>SKU {m.sku}</div>}</td>
                <td>{m.qty} {m.unit}</td>
                {showMoney && <td>{formatCents(m.unit_price_cents)}</td>}
                {showMoney && <td>{formatCents(Math.round(m.qty * m.unit_price_cents))}</td>}
                <td>
                  <span className={`pill ${pillClass(m.status)}`}>{m.status}</span>
                  {m.delivered_at && <div className="subtle" style={{ fontSize: 10 }}>delivered {m.delivered_at}</div>}
                  {!m.delivered_at && m.ordered_at && <div className="subtle" style={{ fontSize: 10 }}>ordered {m.ordered_at}</div>}
                </td>
                {(canManage || canReceive) && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canManage && m.status === 'selected' && <button className="btn p" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => run(() => orderMaterial(m.id))}>Order</button>}{' '}
                    {canReceive && m.status === 'ordered' && <button className="btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => run(() => setMaterialStatus(m.id, 'delivered'))}>Received</button>}{' '}
                    {canReceive && m.status === 'delivered' && <button className="btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => run(() => setMaterialStatus(m.id, 'installed'))}>Installed</button>}{' '}
                    {canManage && (m.status === 'ordered' || m.status === 'delivered') && <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => run(() => setMaterialStatus(m.id, 'returned'))}>Return</button>}{' '}
                    {canManage && m.status === 'selected' && <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => run(() => deleteMaterial(m.id))}>Remove</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="emptyState"><b>No materials yet</b>{canManage ? 'Add the first selection above.' : 'Selections will appear here once the PM adds them.'}</div>}
      </div>
    </section>
  )
}

const TASK_STATUSES: TaskStatus[] = ['planned', 'scheduled', 'in_progress', 'blocked', 'done']
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d }
const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function AddTaskForm({ ctx, scope, vendors, onAdded }: { ctx: Ctx; scope: ScopeItem[]; vendors: Vendor[]; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [trade, setTrade] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [days, setDays] = useState('1')
  const [scopeItemId, setScopeItemId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function pickScope(id: string) {
    setScopeItemId(id)
    const s = scope.find((x) => x.id === id)
    if (s) { if (!name) setName(s.task); if (!trade) setTrade(s.trade) }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await addScheduleTask(ctx.orgId, ctx.projectId, {
        name: name.trim(), trade: trade.trim(), startDate,
        durationDays: Math.max(1, Number(days) || 1), scopeItemId, vendorId, notes: notes.trim(),
      })
      setName(''); setTrade(''); setDays('1'); setScopeItemId(''); setNotes('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select className="search" style={{ maxWidth: 240 }} value={scopeItemId} onChange={(e) => pickScope(e.target.value)}>
        <option value="">From scope line (optional)</option>
        {scope.map((s) => <option key={s.id} value={s.id}>{s.room} · {s.task}</option>)}
      </select>
      <input className="search" style={{ maxWidth: 220 }} placeholder="Task" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="search" style={{ maxWidth: 120 }} placeholder="Trade" value={trade} onChange={(e) => setTrade(e.target.value)} />
      <input className="search" style={{ maxWidth: 150 }} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      <input className="search" style={{ maxWidth: 80 }} placeholder="Days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      <select className="search" style={{ maxWidth: 180 }} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
        <option value="">Vendor (optional)</option>
        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      <input className="search" style={{ maxWidth: 200 }} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn p" disabled={busy}>{busy ? 'Adding…' : 'Add task'}</button>
      {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
    </form>
  )
}

export function LiveSchedulePage({ ctx }: { ctx: Ctx }) {
  const [tasks, setTasks] = useState<ScheduleTask[]>([])
  const [summary, setSummary] = useState<ScheduleSummary | null>(null)
  const [scope, setScope] = useState<ScopeItem[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [error, setError] = useState('')
  const canManage = canManageSchedule(ctx.role)
  const canProgress = canUpdateProgress(ctx.role)

  const reload = useCallback(async () => {
    if (!ctx.projectId) return
    const [t, s, sc, v] = await Promise.all([
      scheduleTasks(ctx.projectId), scheduleSummary(ctx.projectId), scopeItems(ctx.projectId), vendorsList(),
    ])
    setTasks(t); setSummary(s); setScope(sc); setVendors(v)
  }, [ctx.projectId])
  useEffect(() => { reload() }, [reload])

  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Calendar & Schedule</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }

  async function run(fn: () => Promise<void>) {
    setError('')
    try { await fn(); await reload() }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed') }
  }

  const min = tasks.length ? Math.min(...tasks.map((t) => +new Date(t.start_date + 'T00:00:00'))) : 0
  const max = tasks.length ? Math.max(...tasks.map((t) => +addDays(t.start_date, t.duration_days))) : 1
  const span = Math.max(1, max - min)
  const today = +new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')
  const todayPct = ((today - min) / span) * 100
  const barColor = (s: TaskStatus) => s === 'done' ? 'linear-gradient(90deg,#287239,#55cd42)' : s === 'blocked' ? '#8a4a4a' : s === 'in_progress' ? 'linear-gradient(90deg,#6c5a21,#f0c75e)' : '#2c4a38'

  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Calendar & Schedule — {ctx.projectName}</h2>
        <div className="subtle">Trade-level plan. Progress on a task rolls up to its scope line automatically.</div></div>
        <span className="pill green">LIVE</span></div>

      <div className="grid">
        <div className="kpi"><small>Tasks</small><strong>{summary?.task_count ?? 0}</strong></div>
        <div className="kpi"><small>Done</small><strong>{summary?.done_count ?? 0}</strong></div>
        <div className="kpi"><small>Progress</small><strong>{summary?.progress_pct ?? 0}%</strong><div className="delta">duration-weighted</div></div>
        <div className="kpi"><small>Window</small><strong style={{ fontSize: 18 }}>{summary?.starts_on ? `${fmtDay(new Date(summary.starts_on + 'T00:00:00'))} → ${fmtDay(new Date(summary.ends_on! + 'T00:00:00'))}` : '—'}</strong></div>
      </div>

      {canManage && (
        <div className="card">
          <h3>Add task</h3>
          <AddTaskForm ctx={ctx} scope={scope} vendors={vendors} onAdded={reload} />
        </div>
      )}
      {error && <p style={{ color: 'var(--red)', fontSize: 12 }}>{error}</p>}

      <div className="card">
        <h3>Gantt</h3>
        <div className="gantt" style={{ position: 'relative' }}>
          {tasks.length > 0 && todayPct >= 0 && todayPct <= 100 && (
            <div style={{ position: 'absolute', left: `calc(160px + (100% - 160px - 75px - 16px) * ${todayPct / 100})`, top: 0, bottom: 0, width: 1, background: 'var(--amber)', opacity: 0.6, pointerEvents: 'none' }} title="Today" />
          )}
          {tasks.map((t) => {
            const left = ((+new Date(t.start_date + 'T00:00:00') - min) / span) * 100
            const width = Math.max(1.5, (t.duration_days * 864e5 / span) * 100)
            return (
              <div className="grow" key={t.id}>
                <small title={t.name}>{t.name.length > 24 ? t.name.slice(0, 23) + '…' : t.name}</small>
                <div className="gbar" title={`${fmtDay(new Date(t.start_date + 'T00:00:00'))} · ${t.duration_days}d · ${t.status}`}>
                  <i style={{ left: `${left}%`, width: `${width}%`, background: barColor(t.status), opacity: t.status === 'planned' ? 0.55 : 1 }} />
                </div>
                <small className="subtle">{t.progress_pct}%</small>
              </div>
            )
          })}
          {tasks.length === 0 && <div className="emptyState"><b>No tasks yet</b>{canManage ? 'Add tasks above — pick a scope line to prefill.' : 'The PM hasn\'t scheduled work yet.'}</div>}
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="card tablewrap">
          <h3>Tasks</h3>
          <table className="table">
            <thead><tr><th>Task</th><th>Trade</th><th>Start</th><th>Days</th><th>Vendor</th><th>Progress</th><th>Status</th>{(canManage || canProgress) && <th />}</tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}{t.scope_item_id && <span className="pill" style={{ marginLeft: 6 }}>scope</span>}{t.notes && <div className="subtle" style={{ fontSize: 10 }}>{t.notes}</div>}</td>
                  <td>{t.trade ?? '—'}</td>
                  <td>{canManage
                    ? <input type="date" value={t.start_date} onChange={(e) => run(() => updateScheduleTask(t.id, { start_date: e.target.value }))} style={{ width: 130 }} />
                    : fmtDay(new Date(t.start_date + 'T00:00:00'))}</td>
                  <td>{canManage
                    ? <input type="number" min={1} value={t.duration_days} onChange={(e) => run(() => updateScheduleTask(t.id, { duration_days: Math.max(1, Number(e.target.value) || 1) }))} style={{ width: 60 }} />
                    : t.duration_days}</td>
                  <td>{t.vendors?.name ?? '—'}</td>
                  <td style={{ minWidth: 140 }}>
                    {canProgress
                      ? <input type="range" min={0} max={100} step={5} defaultValue={t.progress_pct} onMouseUp={(e) => run(() => updateScheduleTask(t.id, { progress_pct: Number((e.target as HTMLInputElement).value) }))} onTouchEnd={(e) => run(() => updateScheduleTask(t.id, { progress_pct: Number((e.target as HTMLInputElement).value) }))} style={{ width: 110 }} />
                      : <div className="progress"><i style={{ width: `${t.progress_pct}%` }} /></div>}
                    <span className="subtle" style={{ marginLeft: 6, fontSize: 10 }}>{t.progress_pct}%</span>
                  </td>
                  <td>{canProgress
                    ? <select value={t.status} onChange={(e) => run(() => updateScheduleTask(t.id, { status: e.target.value as TaskStatus }))} style={{ fontSize: 11 }}>
                        {TASK_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    : <span className={`pill ${t.status === 'done' ? 'green' : t.status === 'blocked' ? 'red' : t.status === 'in_progress' ? 'amber' : ''}`}>{t.status.replace('_', ' ')}</span>}</td>
                  {(canManage || canProgress) && (
                    <td>{canManage && <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => run(() => deleteScheduleTask(t.id))}>Remove</button>}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function AddChangeOrderForm({ ctx, scope, onAdded }: { ctx: Ctx; scope: ScopeItem[]; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('0')
  const [scopeItemId, setScopeItemId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await addChangeOrder(ctx.orgId, ctx.projectId, {
        title: title.trim(),
        description: description.trim(),
        amountCents: Math.round((Number(amount) || 0) * 100),
        scheduleImpactDays: Number(days) || 0,
        scopeItemId,
      })
      setTitle(''); setDescription(''); setAmount(''); setDays('0'); setScopeItemId('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to raise change order')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input className="search" style={{ maxWidth: 240 }} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <input className="search" style={{ maxWidth: 130 }} placeholder="Amount $" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input className="search" style={{ maxWidth: 110 }} placeholder="Days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      <select className="search" style={{ maxWidth: 220 }} value={scopeItemId} onChange={(e) => setScopeItemId(e.target.value)}>
        <option value="">Scope line (optional)</option>
        {scope.map((s) => <option key={s.id} value={s.id}>{s.room} · {s.task}</option>)}
      </select>
      <input className="search" style={{ maxWidth: 260 }} placeholder="Why is this needed?" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button className="btn p" disabled={busy}>{busy ? 'Raising…' : 'Raise CO'}</button>
      {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
    </form>
  )
}

function DecideButtons({ onDecide }: { onDecide: (approve: boolean, note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
      <input className="search" style={{ maxWidth: 200 }} placeholder="Decision note" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn p" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => onDecide(true, note)}>Approve</button>
      <button className="btn warn" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => onDecide(false, note)}>Reject</button>
    </div>
  )
}

function RfiCard({ rfi, canAnswer, onAnswer, onClose }: { rfi: Rfi; canAnswer: boolean; onAnswer: (a: string) => void; onClose: () => void }) {
  const [answer, setAnswer] = useState('')
  return (
    <div className="card">
      <div className="sectiontitle" style={{ margin: '0 0 8px' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>RFI #{rfi.number}</h3>
        <span className={`pill ${rfi.status === 'answered' ? 'green' : rfi.status === 'closed' ? '' : 'amber'}`}>{rfi.status}</span>
      </div>
      <p style={{ margin: '0 0 6px' }}>{rfi.question}</p>
      {rfi.scope_items && <div className="subtle" style={{ fontSize: 10 }}>re: {rfi.scope_items.task}</div>}
      {rfi.answer && <p className="subtle" style={{ fontSize: 12, borderLeft: '2px solid var(--green)', paddingLeft: 8, margin: '8px 0 0' }}>{rfi.answer}</p>}
      {canAnswer && rfi.status === 'open' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input className="search" placeholder="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <button className="btn p" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => answer.trim() && onAnswer(answer.trim())}>Answer</button>
        </div>
      )}
      {canAnswer && rfi.status === 'answered' && (
        <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11, marginTop: 8 }} onClick={onClose}>Close RFI</button>
      )}
    </div>
  )
}

export function LiveChangesPage({ ctx }: { ctx: Ctx }) {
  const [cos, setCos] = useState<ChangeOrder[]>([])
  const [rfis, setRfis] = useState<Rfi[]>([])
  const [scope, setScope] = useState<ScopeItem[]>([])
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')
  const seeCos = canSeeChangeOrders(ctx.role)
  const manageCos = canManageChangeOrders(ctx.role)
  const raiseRfi = canRaiseRfi(ctx.role)
  const answerRfis = canAnswerRfi(ctx.role)

  const reload = useCallback(async () => {
    if (!ctx.projectId) return
    const [r, s] = await Promise.all([rfisList(ctx.projectId), scopeItems(ctx.projectId)])
    setRfis(r); setScope(s)
    if (canSeeChangeOrders(ctx.role)) setCos(await changeOrdersList(ctx.projectId))
  }, [ctx.projectId, ctx.role])
  useEffect(() => { reload() }, [reload])

  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Change Orders & RFIs</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }

  async function run(fn: () => Promise<void>) {
    setError('')
    try { await fn(); await reload(); ctx.reload() }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed') }
  }

  const pending = cos.filter((c) => c.status === 'pending')
  const approvedTotal = cos.filter((c) => c.status === 'approved').reduce((a, c) => a + c.amount_cents, 0)
  const approvedDays = cos.filter((c) => c.status === 'approved').reduce((a, c) => a + c.schedule_impact_days, 0)

  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Change Orders & RFIs — {ctx.projectName}</h2>
        <div className="subtle">Approving a change order adjusts the project budget in the ledger. E-signature layers on this record in Phase 4.</div></div>
        <span className="pill green">LIVE</span></div>

      {seeCos && (
        <div className="grid">
          <div className="kpi"><small>Change orders</small><strong>{cos.length}</strong></div>
          <div className="kpi"><small>Pending</small><strong style={{ color: pending.length ? 'var(--amber)' : undefined }}>{pending.length}</strong></div>
          <div className="kpi"><small>Approved value</small><strong style={{ color: approvedTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCents(approvedTotal)}</strong></div>
          <div className="kpi"><small>Schedule impact</small><strong>{approvedDays > 0 ? `+${approvedDays}d` : `${approvedDays}d`}</strong></div>
        </div>
      )}

      {manageCos && (
        <div className="card">
          <h3>Raise change order</h3>
          <AddChangeOrderForm ctx={ctx} scope={scope} onAdded={reload} />
        </div>
      )}
      {error && <p style={{ color: 'var(--red)', fontSize: 12 }}>{error}</p>}

      {seeCos && (
        <>
          <div className="sectiontitle"><h2 style={{ fontSize: 16 }}>Change orders</h2></div>
          <div className="grid2">
            {cos.map((c) => (
              <div className="card" key={c.id}>
                <div className="sectiontitle" style={{ margin: '0 0 8px' }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>CO #{c.number} · {c.title}</h3>
                  <span className={`pill ${c.status === 'approved' ? 'green' : c.status === 'pending' ? 'amber' : 'red'}`}>{c.status}</span>
                </div>
                <b style={{ fontSize: 22, color: c.amount_cents >= 0 ? undefined : 'var(--green)' }}>{formatCents(c.amount_cents)}</b>
                {c.schedule_impact_days !== 0 && <span className="pill" style={{ marginLeft: 8 }}>{c.schedule_impact_days > 0 ? '+' : ''}{c.schedule_impact_days}d</span>}
                {c.description && <p className="subtle" style={{ fontSize: 12, margin: '8px 0 0' }}>{c.description}</p>}
                {c.scope_items && <div className="subtle" style={{ fontSize: 10, marginTop: 4 }}>re: {c.scope_items.task}</div>}
                {c.decision_note && <p className="subtle" style={{ fontSize: 11, marginTop: 6 }}>Decision: {c.decision_note}</p>}
                {manageCos && c.status === 'pending' && (
                  <>
                    <DecideButtons onDecide={(approve, note) => run(() => decideChangeOrder(c.id, approve, note))} />
                    <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11, marginTop: 6 }} onClick={() => run(() => voidChangeOrder(c.id))}>Void</button>
                  </>
                )}
              </div>
            ))}
          </div>
          {cos.length === 0 && <div className="emptyState"><b>No change orders</b>{manageCos ? 'Raise one above when scope changes.' : 'None raised yet.'}</div>}
        </>
      )}

      <div className="sectiontitle"><h2 style={{ fontSize: 16 }}>RFIs</h2>
        <span className="pill amber">{rfis.filter((r) => r.status === 'open').length} open</span></div>
      {raiseRfi && (
        <div className="card">
          <form
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
            onSubmit={(e) => { e.preventDefault(); if (question.trim()) run(async () => { await addRfi(ctx.orgId, ctx.projectId, question.trim(), ''); setQuestion('') }) }}
          >
            <input className="search" style={{ maxWidth: 420 }} placeholder="Ask a question about the job…" value={question} onChange={(e) => setQuestion(e.target.value)} required />
            <button className="btn p">Raise RFI</button>
          </form>
        </div>
      )}
      <div className="grid2">
        {rfis.map((r) => (
          <RfiCard
            key={r.id}
            rfi={r}
            canAnswer={answerRfis}
            onAnswer={(a) => run(() => answerRfi(r.id, a))}
            onClose={() => run(() => closeRfi(r.id))}
          />
        ))}
      </div>
      {rfis.length === 0 && <div className="emptyState"><b>No RFIs</b>Field questions raised here get a tracked answer.</div>}
    </section>
  )
}

const PUNCH_STATUSES: PunchStatus[] = ['open', 'in_progress', 'resolved', 'verified']

export function LiveCloseoutPage({ ctx }: { ctx: Ctx }) {
  const [punch, setPunch] = useState<PunchItem[]>([])
  const [checklist, setChecklist] = useState<CloseoutItem[]>([])
  const [warranties, setWarranties] = useState<Warranty[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [readiness, setReadiness] = useState<CloseoutReadiness | null>(null)
  const [error, setError] = useState('')
  const [punchTitle, setPunchTitle] = useState('')
  const [punchRoom, setPunchRoom] = useState('')
  const [wItem, setWItem] = useState('')
  const [wProvider, setWProvider] = useState('')
  const [wExpires, setWExpires] = useState('')
  const [wVendor, setWVendor] = useState('')
  const canRaise = canRaisePunch(ctx.role)
  const canManage = canManageCloseout(ctx.role)

  const reload = useCallback(async () => {
    if (!ctx.projectId) return
    const [p, c, w, v, r] = await Promise.all([
      punchItems(ctx.projectId), closeoutItems(ctx.projectId), warrantiesList(ctx.projectId),
      vendorsList(), closeoutReadiness(ctx.projectId),
    ])
    setPunch(p); setChecklist(c); setWarranties(w); setVendors(v); setReadiness(r)
  }, [ctx.projectId])
  useEffect(() => { reload() }, [reload])

  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Closeout & Warranty</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }

  async function run(fn: () => Promise<void>) {
    setError('')
    try { await fn(); await reload(); ctx.reload() }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed') }
  }

  const punchPill = (s: PunchStatus) => s === 'verified' ? 'green' : s === 'resolved' ? 'green' : s === 'in_progress' ? 'amber' : 'red'

  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Closeout & Warranty — {ctx.projectName}</h2>
        <div className="subtle">A project can only be closed when every punch item is resolved and every required checklist item is done.</div></div>
        <span className="pill green">LIVE</span></div>

      <div className="grid">
        <div className="kpi"><small>Punch open</small><strong style={{ color: readiness?.punch_open ? 'var(--red)' : 'var(--green)' }}>{readiness?.punch_open ?? 0}</strong><div className="delta">of {readiness?.punch_total ?? 0}</div></div>
        <div className="kpi"><small>Checklist open</small><strong style={{ color: readiness?.checklist_open ? 'var(--amber)' : 'var(--green)' }}>{readiness?.checklist_open ?? 0}</strong><div className="delta">required items</div></div>
        <div className="kpi"><small>Warranties</small><strong>{warranties.length}</strong></div>
        <div className="kpi"><small>Status</small><strong style={{ fontSize: 18, color: readiness?.ready ? 'var(--green)' : 'var(--muted)' }}>{readiness?.ready ? 'Ready to close' : 'In progress'}</strong></div>
      </div>

      {canManage && (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {checklist.length === 0 && <button className="btn" onClick={() => run(() => seedCloseoutChecklist(ctx.projectId))}>Start closeout checklist</button>}
            <button className="btn p" disabled={!readiness?.ready} onClick={() => run(() => closeProject(ctx.projectId))}>
              {readiness?.ready ? 'Close project (mark sold)' : 'Close project — blocked'}
            </button>
            {!readiness?.ready && <span className="subtle" style={{ fontSize: 11 }}>
              {readiness?.checklist_total === 0 ? 'Start the checklist first.' : `${readiness?.punch_open ?? 0} punch + ${readiness?.checklist_open ?? 0} required item(s) outstanding.`}
            </span>}
          </div>
        </div>
      )}
      {error && <p style={{ color: 'var(--red)', fontSize: 12 }}>{error}</p>}

      <div className="grid2">
        <div className="card">
          <div className="sectiontitle" style={{ margin: '0 0 8px' }}><h3 style={{ margin: 0 }}>Punch list</h3>
            <span className={`pill ${readiness?.punch_open ? 'red' : 'green'}`}>{readiness?.punch_open ?? 0} open</span></div>
          {canRaise && (
            <form
              style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}
              onSubmit={(e) => { e.preventDefault(); if (punchTitle.trim()) run(async () => { await addPunchItem(ctx.orgId, ctx.projectId, { room: punchRoom.trim(), title: punchTitle.trim(), detail: '' }); setPunchTitle(''); setPunchRoom('') }) }}
            >
              <input className="search" style={{ maxWidth: 110 }} placeholder="Room" value={punchRoom} onChange={(e) => setPunchRoom(e.target.value)} />
              <input className="search" style={{ maxWidth: 220 }} placeholder="What needs fixing?" value={punchTitle} onChange={(e) => setPunchTitle(e.target.value)} required />
              <button className="btn p" style={{ padding: '6px 12px' }}>Add</button>
            </form>
          )}
          {punch.map((p) => (
            <div className="scopeitem" key={p.id}>
              <div className={`check ${p.status === 'verified' ? 'done' : ''}`}>{p.status === 'verified' ? '✓' : ''}</div>
              <div>
                <strong>{p.title}</strong>
                <div className="scopemeta">
                  {p.room && <span className="pill">{p.room}</span>}
                  <span className={`pill ${punchPill(p.status)}`}>{p.status.replace('_', ' ')}</span>
                  {p.proof_required && <span className="pill">proof required</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {canRaise && (
                  <select value={p.status} onChange={(e) => run(() => setPunchStatus(p.id, e.target.value as PunchStatus))} style={{ fontSize: 11 }}>
                    {PUNCH_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                )}
                {canManage && <div><button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11, marginTop: 4 }} onClick={() => run(() => deletePunchItem(p.id))}>Remove</button></div>}
              </div>
            </div>
          ))}
          {punch.length === 0 && <p className="subtle">No punch items.</p>}
        </div>

        <div className="card">
          <div className="sectiontitle" style={{ margin: '0 0 8px' }}><h3 style={{ margin: 0 }}>Closeout checklist</h3>
            <span className={`pill ${readiness?.checklist_open ? 'amber' : 'green'}`}>{checklist.filter((c) => c.status === 'done').length}/{checklist.length}</span></div>
          {checklist.map((c) => (
            <div className="scopeitem" key={c.id}>
              <div
                className={`check ${c.status === 'done' ? 'done' : ''}`}
                style={{ cursor: canManage ? 'pointer' : 'default' }}
                onClick={() => canManage && run(() => setCloseoutItemStatus(c.id, c.status === 'done' ? 'open' : 'done'))}
              >{c.status === 'done' ? '✓' : ''}</div>
              <div>
                <strong style={{ textDecoration: c.status === 'na' ? 'line-through' : undefined }}>{c.title}</strong>
                <div className="scopemeta">
                  {c.required ? <span className="pill amber">required</span> : <span className="pill">optional</span>}
                  {c.completed_at && <span className="subtle" style={{ fontSize: 10 }}>{new Date(c.completed_at).toLocaleDateString()}</span>}
                </div>
              </div>
              {canManage && (
                <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => run(() => setCloseoutItemStatus(c.id, c.status === 'na' ? 'open' : 'na'))}>
                  {c.status === 'na' ? 'Restore' : 'N/A'}
                </button>
              )}
            </div>
          ))}
          {checklist.length === 0 && <p className="subtle">{canManage ? 'Start the checklist above.' : 'Not started yet.'}</p>}
          {canManage && checklist.length > 0 && (
            <form
              style={{ display: 'flex', gap: 6, marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault()
                const input = (e.currentTarget.elements.namedItem('extra') as HTMLInputElement)
                if (input.value.trim()) run(async () => { await addCloseoutItem(ctx.orgId, ctx.projectId, input.value.trim(), true); input.value = '' })
              }}
            >
              <input className="search" name="extra" placeholder="Add checklist item" />
              <button className="btn" style={{ padding: '6px 12px' }}>Add</button>
            </form>
          )}
        </div>
      </div>

      <div className="card tablewrap">
        <h3>Warranties</h3>
        {canManage && (
          <form
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}
            onSubmit={(e) => { e.preventDefault(); if (wItem.trim()) run(async () => { await addWarranty(ctx.orgId, ctx.projectId, { item: wItem.trim(), provider: wProvider.trim(), expiresOn: wExpires, documentUrl: '', vendorId: wVendor }); setWItem(''); setWProvider(''); setWExpires(''); setWVendor('') }) }}
          >
            <input className="search" style={{ maxWidth: 180 }} placeholder="Item (e.g. HVAC)" value={wItem} onChange={(e) => setWItem(e.target.value)} required />
            <input className="search" style={{ maxWidth: 180 }} placeholder="Provider" value={wProvider} onChange={(e) => setWProvider(e.target.value)} />
            <select className="search" style={{ maxWidth: 180 }} value={wVendor} onChange={(e) => setWVendor(e.target.value)}>
              <option value="">Vendor (optional)</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <input className="search" style={{ maxWidth: 160 }} type="date" value={wExpires} onChange={(e) => setWExpires(e.target.value)} />
            <button className="btn p">Add warranty</button>
          </form>
        )}
        <table className="table">
          <thead><tr><th>Item</th><th>Provider</th><th>Starts</th><th>Expires</th>{canManage && <th />}</tr></thead>
          <tbody>
            {warranties.map((w) => {
              const expired = w.expires_on && new Date(w.expires_on) < new Date()
              return (
                <tr key={w.id}>
                  <td>{w.item}</td>
                  <td>{w.vendors?.name ?? w.provider ?? '—'}</td>
                  <td>{w.starts_on}</td>
                  <td>{w.expires_on ? <span className={`pill ${expired ? 'red' : 'green'}`}>{w.expires_on}</span> : '—'}</td>
                  {canManage && <td><button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => run(() => deleteWarranty(w.id))}>Remove</button></td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        {warranties.length === 0 && <p className="subtle">No warranties registered.</p>}
      </div>
    </section>
  )
}

const bpsPct = (bps: number) => `${(bps / 100).toFixed(1)}%`

// Dollar input bound to an integer-cents field on the project.
function CentsField({ label, cents, disabled, onCommit }: { label: string; cents: number; disabled: boolean; onCommit: (cents: number) => void }) {
  const [draft, setDraft] = useState((cents / 100).toString())
  useEffect(() => { setDraft((cents / 100).toString()) }, [cents])
  return (
    <div className="field">
      <label>{label}</label>
      <input
        inputMode="decimal"
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = Math.round((Number(draft) || 0) * 100)
          if (next !== cents) onCommit(next)
        }}
      />
    </div>
  )
}

function BpsField({ label, bps, disabled, onCommit }: { label: string; bps: number; disabled: boolean; onCommit: (bps: number) => void }) {
  const [draft, setDraft] = useState((bps / 100).toString())
  useEffect(() => { setDraft((bps / 100).toString()) }, [bps])
  return (
    <div className="field">
      <label>{label}</label>
      <input
        inputMode="decimal"
        disabled={disabled}
        value={draft}
        onBlur={() => {
          const next = Math.round((Number(draft) || 0) * 100)
          if (next !== bps) onCommit(Math.min(10000, Math.max(0, next)))
        }}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  )
}

export function LiveDealPage({ ctx }: { ctx: Ctx }) {
  const [uw, setUw] = useState<Underwriting | null>(null)
  const [assumptions, setAssumptions] = useState<DealAssumptions | null>(null)
  const [error, setError] = useState('')
  const canEdit = canEditFinancials(ctx.role)

  const reload = useCallback(async () => {
    if (!ctx.projectId) return
    const [u, a] = await Promise.all([projectUnderwriting(ctx.projectId), dealAssumptions(ctx.projectId)])
    setUw(u); setAssumptions(a)
  }, [ctx.projectId])
  useEffect(() => { reload() }, [reload])

  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Deal Underwriting</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }
  if (!canSeeFinancials(ctx.role)) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>Deal Underwriting</h2></div>
        <div className="emptyState"><b>Underwriting is visible to owners, PMs and investors only.</b></div>
      </section>
    )
  }

  async function commit(patch: Partial<DealAssumptions>) {
    setError('')
    try { await updateDealAssumptions(ctx.projectId, patch); await reload(); ctx.reload() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save') }
  }

  const rows: [string, number][] = uw ? [
    ['Purchase', uw.purchase_cents],
    ['Rehab (approved budget)', uw.rehab_cents],
    ['Financing', uw.financing_cents],
    ['Holding', uw.holding_cents],
    ['Contingency', uw.contingency_cents],
    [`Selling (${bpsPct(assumptions?.selling_pct_bps ?? 0)})`, uw.selling_cents],
  ] : []

  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>Deal Underwriting — {ctx.projectName}</h2>
        <div className="subtle">Buy-box math from the live ledger. Rehab is the approved budget; ARV is manual until the Phase 4 comps feed.</div></div>
        <span className="pill green">LIVE</span></div>

      {uw && (
        <div className="grid">
          {kpi('All-in cost', formatCents(uw.all_in_cents))}
          {kpi('ARV', formatCents(uw.arv_cents), uw.arv_cents === 0 ? 'set ARV below' : undefined)}
          {kpi('Projected profit', formatCents(uw.profit_cents), `ROI ${bpsPct(uw.roi_bps)}`, uw.profit_cents >= 0 ? 'var(--green)' : 'var(--red)')}
          {kpi('Margin', bpsPct(uw.margin_bps), `target ${bpsPct(uw.target_margin_bps)}`, uw.meets_target ? 'var(--green)' : 'var(--amber)')}
        </div>
      )}

      {uw && (
        <div className="card">
          <div className="sectiontitle" style={{ margin: '0 0 8px' }}><h3 style={{ margin: 0 }}>Verdict</h3>
            <span className={`pill ${uw.meets_target ? 'green' : 'amber'}`}>{uw.meets_target ? 'MEETS TARGET' : 'BELOW TARGET'}</span></div>
          <p className="subtle" style={{ margin: 0, fontSize: 12.5 }}>
            {uw.arv_cents === 0
              ? 'Set an ARV to underwrite this deal.'
              : uw.meets_target
                ? `At ${formatCents(uw.arv_cents)} ARV this deal clears your ${bpsPct(uw.target_margin_bps)} margin target with ${formatCents(uw.profit_cents)} of profit.`
                : `This deal returns ${bpsPct(uw.margin_bps)} against a ${bpsPct(uw.target_margin_bps)} target — ${formatCents(Math.round(uw.arv_cents * uw.target_margin_bps / 10000) - uw.profit_cents)} short. Cut scope, renegotiate, or walk.`}
          </p>
        </div>
      )}

      {error && <p style={{ color: 'var(--red)', fontSize: 12 }}>{error}</p>}

      <div className="grid2">
        <div className="card tablewrap">
          <h3>Cost stack</h3>
          <table className="table"><tbody>
            {rows.map(([k, v]) => (
              <tr key={k}><td>{k}</td><td style={{ textAlign: 'right' }}>{formatCents(v)}</td></tr>
            ))}
            <tr><td><b>All-in</b></td><td style={{ textAlign: 'right' }}><b>{formatCents(uw?.all_in_cents ?? 0)}</b></td></tr>
          </tbody></table>
        </div>

        <div className="card">
          <h3>Assumptions</h3>
          {!canEdit && <p className="subtle" style={{ fontSize: 11 }}>Read-only for your role.</p>}
          {assumptions && (
            <div className="formgrid">
              <CentsField label="Purchase price" cents={assumptions.purchase_price_cents ?? 0} disabled={!canEdit} onCommit={(c) => commit({ purchase_price_cents: c })} />
              <CentsField label="ARV" cents={assumptions.arv_cents ?? 0} disabled={!canEdit} onCommit={(c) => commit({ arv_cents: c })} />
              <CentsField label="Financing" cents={assumptions.financing_cents} disabled={!canEdit} onCommit={(c) => commit({ financing_cents: c })} />
              <CentsField label="Holding" cents={assumptions.holding_cents} disabled={!canEdit} onCommit={(c) => commit({ holding_cents: c })} />
              <CentsField label="Contingency" cents={assumptions.contingency_cents} disabled={!canEdit} onCommit={(c) => commit({ contingency_cents: c })} />
              <BpsField label="Selling cost %" bps={assumptions.selling_pct_bps} disabled={!canEdit} onCommit={(b) => commit({ selling_pct_bps: b })} />
              <BpsField label="Target margin %" bps={assumptions.target_margin_bps} disabled={!canEdit} onCommit={(b) => commit({ target_margin_bps: b })} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// The Copilot's numbers are real — they come from the underwriting engine and
// the ledger. Only the conversation needs the Phase 3 AI service, and the
// panel says so rather than answering with invented figures.
export function LiveCopilotPage({ ctx }: { ctx: Ctx }) {
  const [uw, setUw] = useState<Underwriting | null>(null)
  const [risk, setRisk] = useState<RiskRow[]>([])
  const [msgs, setMsgs] = useState<{ who: string; text: string }[]>([
    { who: 'assistant', text: 'I read this project’s scope, ledger, schedule and punch list. The conversational answers arrive with the Phase 3 AI service — the figures beside me are already live.' },
  ])
  const [input, setInput] = useState('')

  const reload = useCallback(async () => {
    if (!ctx.projectId) return
    const [u, r] = await Promise.all([
      projectUnderwriting(ctx.projectId),
      ctx.portfolioId ? portfolioRisk(ctx.portfolioId) : Promise.resolve([]),
    ])
    setUw(u); setRisk(r)
  }, [ctx.projectId, ctx.portfolioId])
  useEffect(() => { reload() }, [reload])

  if (!ctx.hasProject) {
    return (
      <section className="page on">
        <div className="sectiontitle"><h2>FlipScope Copilot</h2></div>
        <NoPropertyCard ctx={ctx} />
      </section>
    )
  }

  function send() {
    if (!input.trim()) return
    setMsgs((m) => [...m, { who: 'user', text: input },
      { who: 'assistant', text: 'The Copilot backend lands in Phase 3. Until then the live figures are on the left, and every underlying number is on the Financials, Risk and Schedule pages.' }])
    setInput('')
  }

  const mine = risk.find((r) => r.project_id === ctx.projectId)
  const showMoney = canSeeFinancials(ctx.role)

  return (
    <section className="page on">
      <div className="sectiontitle"><div><h2>FlipScope Copilot</h2>
        <div className="subtle">Project-aware assistant for cost, cash, schedule and risk.</div></div>
        <span className="pill amber">CHAT SHIPS IN PHASE 3 · FIGURES ARE LIVE</span></div>
      <div className="copilotShell">
        <div>
          <div className="card">
            <h3>Live project insight</h3>
            {showMoney && uw ? (
              <>
                <div className="insightBox"><small className="subtle">Projected all-in cost</small><b>{formatCents(uw.all_in_cents)}</b>
                  <small className="subtle">purchase + approved budget + carry</small></div>
                <div className="insightBox"><small className="subtle">Projected profit</small>
                  <b style={{ color: uw.profit_cents >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCents(uw.profit_cents)}</b>
                  <small className="subtle">margin {bpsPct(uw.margin_bps)} · target {bpsPct(uw.target_margin_bps)}</small></div>
              </>
            ) : (
              <p className="subtle" style={{ fontSize: 12 }}>Financial figures are hidden for your role.</p>
            )}
            {mine && (
              <div className="insightBox"><small className="subtle">Risk</small>
                <b style={{ color: mine.risk_level === 'red' ? 'var(--red)' : mine.risk_level === 'amber' ? 'var(--amber)' : 'var(--green)' }}>{mine.risk_level.toUpperCase()}</b>
                <div className="confidence"><i style={{ width: `${Math.min(100, mine.budget_used_bps / 100)}%` }} /></div>
                <small className="subtle">{(mine.budget_used_bps / 100).toFixed(0)}% of budget used{mine.days_to_target != null ? ` · ${mine.days_to_target}d to target` : ''}</small></div>
            )}
          </div>
        </div>
        <div className="card copilotCard">
          <div className="copilotChat">
            {msgs.map((m, i) => <div key={i} className={`msg ${m.who}`}>{m.text}</div>)}
          </div>
          <div className="quickPrompts">
            {['Where is my budget at risk?', 'What must happen this week?', 'Can I still hit my target margin?'].map((q) => (
              <button key={q} className="btn ghost" onClick={() => setInput(q)}>{q}</button>
            ))}
          </div>
          <div className="copilotInput">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask about cost, cash, schedule, risk…" />
            <button className="btn p" onClick={send}>Send</button>
          </div>
        </div>
      </div>
    </section>
  )
}
