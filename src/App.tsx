import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { portfolioFinancials, projectFinancials, formatCents, formatRoi } from './lib/financials'
import type { Financials } from './lib/financials'
import {
  myRole, auditTrail, proofFeed, proofUrl, uploadProof, addLedgerEntry,
  portfolioCashflow, portfolioRisk,
  canEditFinancials, canSeeFinancials, canUploadProof,
} from './lib/data'
import type { OrgRole, AuditRow, ProofRow, CashflowMonth, RiskRow } from './lib/data'
import './App.css'

interface Portfolio { id: string; name: string }

interface ProjectRow {
  id: string
  name: string
  status: string
  purchase_price_cents: number | null
  properties: { address: string; portfolio_id: string } | null
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={signIn}>
        <div className="brand"><div className="mark" /><b>Flip<span>Scope</span></b></div>
        <p className="muted">Sign in to your organization.</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <p className="error">{error}</p>
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

function LedgerForm({ orgId, projectId, onAdded }: { orgId: string; projectId: string; onAdded: () => void }) {
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
      await addLedgerEntry(orgId, projectId, entryType, category.trim() || 'general', cents)
      setCategory(''); setAmount('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <select value={entryType} onChange={(e) => setEntryType(e.target.value as typeof entryType)}>
        <option value="budget">Budget</option>
        <option value="committed">Committed</option>
        <option value="actual">Actual</option>
        <option value="revenue">Revenue</option>
      </select>
      <input placeholder="Category (e.g. kitchen)" value={category} onChange={(e) => setCategory(e.target.value)} />
      <input placeholder="Amount $" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button className="btn">Add entry</button>
      {error && <span className="error">{error}</span>}
    </form>
  )
}

function ProofSection({ orgId, projectId, role }: { orgId: string; projectId: string; role: OrgRole }) {
  const [items, setItems] = useState<ProofRow[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    const rows = await proofFeed(projectId)
    setItems(rows)
    const u: Record<string, string> = {}
    for (const r of rows) {
      const s = await proofUrl(r.storage_path)
      if (s) u[r.id] = s
    }
    setUrls(u)
  }, [projectId])

  useEffect(() => { reload() }, [reload])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 3000 })
    })
    try {
      await uploadProof(orgId, projectId, file, caption, position)
      setCaption('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
    setBusy(false)
    e.target.value = ''
  }

  return (
    <div className="card">
      <h3>Proof of work</h3>
      {canUploadProof(role) && (
        <div className="inline-form">
          <input placeholder="Caption (what does this show?)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <label className="btn">
            {busy ? 'Uploading…' : 'Add photo'}
            <input type="file" accept="image/*,video/*" hidden onChange={onFile} disabled={busy} />
          </label>
          {error && <span className="error">{error}</span>}
        </div>
      )}
      <div className="proof-grid">
        {items.map((p) => (
          <figure className="proof" key={p.id}>
            {urls[p.id] && p.content_type.startsWith('image/')
              ? <img src={urls[p.id]} alt={p.caption ?? 'proof'} />
              : <div className="proof-file">{p.content_type}</div>}
            <figcaption>
              <b>{p.caption ?? 'Untitled'}</b>
              <small>{new Date(p.captured_at).toLocaleString()}{p.lat != null ? ` · ${p.lat.toFixed(3)}, ${p.lng?.toFixed(3)}` : ''}</small>
            </figcaption>
          </figure>
        ))}
        {items.length === 0 && <p className="muted">No proof uploaded yet.</p>}
      </div>
    </div>
  )
}

function RiskSection({ portfolioId }: { portfolioId: string }) {
  const [rows, setRows] = useState<RiskRow[]>([])
  useEffect(() => { portfolioRisk(portfolioId).then(setRows) }, [portfolioId])

  return (
    <div className="card">
      <h3>Risk heatmap</h3>
      <table>
        <thead>
          <tr><th>Project</th><th>Property</th><th>Status</th>
          <th className="num">Budget</th><th className="num">Spent</th>
          <th className="num">Budget used</th><th className="num">Days to target</th><th>Risk</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.project_id}>
              <td>{r.project_name}</td>
              <td>{r.address}</td>
              <td><span className="pill">{r.status}</span></td>
              <td className="num">{formatCents(r.budget_cents)}</td>
              <td className="num">{formatCents(r.actual_cents)}</td>
              <td className="num">{(r.budget_used_bps / 100).toFixed(1)}%</td>
              <td className="num">{r.days_to_target ?? '—'}</td>
              <td><span className={`risk ${r.risk_level}`}>{r.risk_level}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CashflowSection({ portfolioId }: { portfolioId: string }) {
  const [rows, setRows] = useState<CashflowMonth[]>([])
  useEffect(() => { portfolioCashflow(portfolioId).then(setRows) }, [portfolioId])
  const peak = Math.max(1, ...rows.map((r) => Math.max(r.inflow_cents, r.outflow_cents)))

  return (
    <div className="card">
      <h3>Cash flow</h3>
      {rows.map((r) => (
        <div className="cash-row" key={r.month}>
          <span className="cash-month">{new Date(r.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
          <div className="cash-bars">
            <div className="cash-bar in" style={{ width: `${(r.inflow_cents / peak) * 100}%` }} />
            <div className="cash-bar out" style={{ width: `${(r.outflow_cents / peak) * 100}%` }} />
          </div>
          <span className={`cash-net ${r.net_cents >= 0 ? 'pos' : 'neg'}`}>{formatCents(r.net_cents)}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="muted">No cash movement yet.</p>}
    </div>
  )
}

function AuditSection() {
  const [rows, setRows] = useState<AuditRow[]>([])
  useEffect(() => { auditTrail().then(setRows) }, [])

  function describe(r: AuditRow): string {
    const n = r.new_row as { name?: string; category?: string; amount_cents?: number } | null
    if (r.table_name === 'ledger_entries' && n?.amount_cents != null) {
      return `${r.action} ledger: ${n.category} ${formatCents(n.amount_cents)}`
    }
    return `${r.action} ${r.table_name}${n?.name ? `: ${n.name}` : ''}`
  }

  return (
    <div className="card">
      <h3>Audit trail</h3>
      {rows.map((r) => (
        <div className="audit-row" key={r.id}>
          <span>{describe(r)}</span>
          <small className="muted">{new Date(r.created_at).toLocaleString()}</small>
        </div>
      ))}
      {rows.length === 0 && <p className="muted">No activity recorded yet.</p>}
    </div>
  )
}

function Dashboard({ session }: { session: Session }) {
  const [orgName, setOrgName] = useState('')
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState<OrgRole | null>(null)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [portfolioFin, setPortfolioFin] = useState<Record<string, Financials>>({})
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [projectFin, setProjectFin] = useState<Record<string, Financials>>({})

  const load = useCallback(async () => {
    const me = await myRole()
    if (!me) return
    setOrgId(me.orgId)
    setRole(me.role)

    const { data: orgs } = await supabase.from('organizations').select('id, name')
    if (orgs?.[0]) setOrgName(orgs[0].name)

    const { data: pfs } = await supabase.from('portfolios').select('id, name')
    setPortfolios(pfs ?? [])

    const { data: prjs } = await supabase
      .from('projects')
      .select('id, name, status, purchase_price_cents, properties(address, portfolio_id)')
    const projectRows = (prjs as unknown as ProjectRow[]) ?? []
    setProjects(projectRows)

    if (canSeeFinancials(me.role)) {
      // Every figure comes from the server-side engine — never summed here.
      const pfFin: Record<string, Financials> = {}
      for (const pf of pfs ?? []) pfFin[pf.id] = await portfolioFinancials(pf.id)
      setPortfolioFin(pfFin)

      const prFin: Record<string, Financials> = {}
      for (const pr of projectRows) prFin[pr.id] = await projectFinancials(pr.id)
      setProjectFin(prFin)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (!role) return null
  const showMoney = canSeeFinancials(role)
  const firstProject = projects[0]

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand"><div className="mark" /><b>Flip<span>Scope</span></b></div>
        <div>
          <span className="pill" style={{ marginRight: 10 }}>{role}{role === 'investor' ? ' · read-only' : ''}</span>
          <span className="muted" style={{ marginRight: 12 }}>{orgName} · {session.user.email}</span>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>

      {showMoney && portfolios.map((pf) => {
        const f = portfolioFin[pf.id]
        if (!f) return null
        return (
          <div className="kpis" key={pf.id}>
            <div className="kpi"><small>Budget</small><strong>{formatCents(f.budget_cents)}</strong></div>
            <div className="kpi"><small>Committed</small><strong>{formatCents(f.committed_cents)}</strong></div>
            <div className="kpi"><small>Actual</small><strong>{formatCents(f.actual_cents)}</strong></div>
            <div className="kpi"><small>Profit</small><strong className={f.profit_cents >= 0 ? 'pos' : 'neg'}>{formatCents(f.profit_cents)}</strong></div>
            <div className="kpi"><small>ROI</small><strong className={f.roi_bps >= 0 ? 'pos' : 'neg'}>{formatRoi(f.roi_bps)}</strong></div>
          </div>
        )
      })}

      <div className="card">
        <h3>Projects</h3>
        <table>
          <thead>
            <tr>
              <th>Project</th><th>Property</th><th>Status</th>
              {showMoney && <><th className="num">Purchase</th><th className="num">Budget</th>
              <th className="num">Actual</th><th className="num">Profit</th><th className="num">ROI</th></>}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const f = projectFin[p.id]
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.properties?.address ?? '—'}</td>
                  <td><span className={`pill ${p.status === 'rehab' ? 'green' : ''}`}>{p.status}</span></td>
                  {showMoney && <>
                    <td className="num">{p.purchase_price_cents != null ? formatCents(p.purchase_price_cents) : '—'}</td>
                    <td className="num">{f ? formatCents(f.budget_cents) : '…'}</td>
                    <td className="num">{f ? formatCents(f.actual_cents) : '…'}</td>
                    <td className="num">{f ? formatCents(f.profit_cents) : '…'}</td>
                    <td className="num">{f ? formatRoi(f.roi_bps) : '…'}</td>
                  </>}
                </tr>
              )
            })}
            {projects.length === 0 && (
              <tr><td colSpan={showMoney ? 8 : 3} className="muted">No projects yet.</td></tr>
            )}
          </tbody>
        </table>
        {canEditFinancials(role) && firstProject && (
          <LedgerForm orgId={orgId} projectId={firstProject.id} onAdded={load} />
        )}
      </div>

      {showMoney && portfolios[0] && <RiskSection portfolioId={portfolios[0].id} />}
      {showMoney && portfolios[0] && <CashflowSection portfolioId={portfolios[0].id} />}
      {firstProject && <ProofSection orgId={orgId} projectId={firstProject.id} role={role} />}
      {showMoney && <AuditSection />}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return null
  return session ? <Dashboard session={session} /> : <Login />
}
