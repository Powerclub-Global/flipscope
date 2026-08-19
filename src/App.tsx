import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { portfolioFinancials, projectFinancials, formatCents, formatRoi } from './lib/financials'
import type { Financials } from './lib/financials'
import './App.css'

interface Portfolio {
  id: string
  name: string
}

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

function Dashboard({ session }: { session: Session }) {
  const [orgName, setOrgName] = useState('')
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [portfolioFin, setPortfolioFin] = useState<Record<string, Financials>>({})
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [projectFin, setProjectFin] = useState<Record<string, Financials>>({})

  useEffect(() => {
    async function load() {
      const { data: orgs } = await supabase.from('organizations').select('id, name')
      if (orgs?.[0]) setOrgName(orgs[0].name)

      const { data: pfs } = await supabase.from('portfolios').select('id, name')
      setPortfolios(pfs ?? [])

      const { data: prjs } = await supabase
        .from('projects')
        .select('id, name, status, purchase_price_cents, properties(address, portfolio_id)')
      setProjects((prjs as unknown as ProjectRow[]) ?? [])

      // Every figure below comes from the server-side engine — never summed here.
      const pfFin: Record<string, Financials> = {}
      for (const pf of pfs ?? []) pfFin[pf.id] = await portfolioFinancials(pf.id)
      setPortfolioFin(pfFin)

      const prFin: Record<string, Financials> = {}
      for (const pr of (prjs as unknown as ProjectRow[]) ?? []) prFin[pr.id] = await projectFinancials(pr.id)
      setProjectFin(prFin)
    }
    load()
  }, [])

  const totals = Object.values(portfolioFin)

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand"><div className="mark" /><b>Flip<span>Scope</span></b></div>
        <div>
          <span className="muted" style={{ marginRight: 12 }}>{orgName} · {session.user.email}</span>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>

      {totals.map((f, i) => (
        <div className="kpis" key={portfolios[i]?.id ?? i}>
          <div className="kpi"><small>Budget</small><strong>{formatCents(f.budget_cents)}</strong></div>
          <div className="kpi"><small>Committed</small><strong>{formatCents(f.committed_cents)}</strong></div>
          <div className="kpi"><small>Actual</small><strong>{formatCents(f.actual_cents)}</strong></div>
          <div className="kpi"><small>Profit</small><strong className={f.profit_cents >= 0 ? 'pos' : 'neg'}>{formatCents(f.profit_cents)}</strong></div>
          <div className="kpi"><small>ROI</small><strong className={f.roi_bps >= 0 ? 'pos' : 'neg'}>{formatRoi(f.roi_bps)}</strong></div>
        </div>
      ))}

      <div className="card">
        <h3>Projects</h3>
        <table>
          <thead>
            <tr>
              <th>Project</th><th>Property</th><th>Status</th>
              <th className="num">Purchase</th><th className="num">Budget</th>
              <th className="num">Actual</th><th className="num">Profit</th><th className="num">ROI</th>
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
                  <td className="num">{p.purchase_price_cents != null ? formatCents(p.purchase_price_cents) : '—'}</td>
                  <td className="num">{f ? formatCents(f.budget_cents) : '…'}</td>
                  <td className="num">{f ? formatCents(f.actual_cents) : '…'}</td>
                  <td className="num">{f ? formatCents(f.profit_cents) : '…'}</td>
                  <td className="num">{f ? formatRoi(f.roi_bps) : '…'}</td>
                </tr>
              )
            })}
            {projects.length === 0 && (
              <tr><td colSpan={8} className="muted">No projects yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
