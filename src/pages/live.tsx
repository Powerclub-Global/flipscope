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
  canEditFinancials, canUploadProof,
} from '../lib/data'
import type { OrgRole, AuditRow, ProofRow, CashflowMonth, RiskRow } from '../lib/data'

export interface Ctx {
  orgId: string
  orgName: string
  role: OrgRole
  portfolioId: string
  projectId: string
  projectName: string
  address: string
  arvCents: number | null
  fin: Financials | null
  portfolioFin: Financials | null
  reload: () => void
  go: (page: string) => void
}

const kpi = (label: string, val: string, delta?: string, color?: string) => (
  <div className="kpi" key={label}><small>{label}</small><strong style={color ? { color } : undefined}>{val}</strong>{delta && <div className="delta">{delta}</div>}</div>
)

export function HomePage({ ctx }: { ctx: Ctx }) {
  const [risk, setRisk] = useState<RiskRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  useEffect(() => {
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

      {f && (
        <div className="grid">
          {kpi('Portfolio budget', formatCents(f.budget_cents))}
          {kpi('Actual to date', formatCents(f.actual_cents))}
          {kpi('Projected profit', formatCents(f.profit_cents), undefined, f.profit_cents >= 0 ? 'var(--green)' : 'var(--red)')}
          {kpi('ROI', formatRoi(f.roi_bps), 'from the live ledger', f.roi_bps >= 0 ? 'var(--green)' : 'var(--red)')}
        </div>
      )}

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
    </section>
  )
}

export function FinancialsPage({ ctx }: { ctx: Ctx }) {
  const [cash, setCash] = useState<CashflowMonth[]>([])
  useEffect(() => { portfolioCashflow(ctx.portfolioId).then(setCash).catch(() => {}) }, [ctx.portfolioId])
  const f = ctx.fin
  const peak = Math.max(1, ...cash.map((r) => Math.max(r.inflow_cents, r.outflow_cents)))

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
  useEffect(() => { portfolioRisk(ctx.portfolioId).then(setRows).catch(() => {}) }, [ctx.portfolioId])
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
