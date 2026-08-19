import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { projectFinancials, portfolioFinancials, formatCents, formatRoi } from './lib/financials'
import type { Financials } from './lib/financials'
import { myRole, canSeeFinancials } from './lib/data'
import type { OrgRole } from './lib/data'
import { HomePage, FinancialsPage, FieldPage, FeedPage, PortalPage, RiskPage, TeamPage } from './pages/live'
import type { Ctx } from './pages/live'
import {
  CopilotPage, DealPage, CapturePage, ScopePage, BidsPage, DesignPage,
  SchedulePage, MaterialsPage, ChangesPage, CloseoutPage, ReportsPage,
} from './pages/preview'
import './App.css'

// Nav order and icons match the concept build exactly.
const NAV: [string, string, string][] = [
  ['home', '⌂', 'Command Center'],
  ['copilot', '✦', 'FlipScope Copilot'],
  ['deal', '◆', 'Deal Underwriting'],
  ['capture', '◉', 'AI Walkthrough'],
  ['scope', '▤', 'Scope & Estimate'],
  ['bids', '⇄', 'Bid Room'],
  ['design', '✦', 'AI Designer'],
  ['schedule', '▦', 'Calendar & Schedule'],
  ['field', '📷', 'Field & Verification'],
  ['materials', '▥', 'Materials & POs'],
  ['financials', '$', 'Financials'],
  ['changes', '↗', 'Change Orders & RFIs'],
  ['portal', '◎', 'Client / Investor Portal'],
  ['risk', '!', 'Risk Radar'],
  ['team', '♙', 'Team & Access'],
  ['closeout', '✓', 'Closeout & Warranty'],
  ['feed', '◌', 'Project Feed'],
  ['reports', '▧', 'Reports'],
]

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={signIn}>
        <div className="brand"><div className="mark" /><b>Flip<span>Scope</span></b></div>
        <p className="subtle">Sign in to your organization.</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <p className="autherr">{error}</p>
        <button className="btn p" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

function Shell({ session }: { session: Session }) {
  const [page, setPage] = useState('home')
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [role, setRole] = useState<OrgRole | null>(null)

  const load = useCallback(async () => {
    const me = await myRole()
    if (!me) return
    setRole(me.role)

    const { data: orgs } = await supabase.from('organizations').select('id, name')
    const { data: pfs } = await supabase.from('portfolios').select('id, name')
    const { data: prjs } = await supabase
      .from('projects')
      .select('id, name, arv_cents, properties(address)')
      .order('created_at')
    const project = prjs?.[0] as unknown as { id: string; name: string; arv_cents: number | null; properties: { address: string } | null } | undefined
    if (!project || !pfs?.[0]) return

    let fin: Financials | null = null
    let pfFin: Financials | null = null
    if (canSeeFinancials(me.role)) {
      fin = await projectFinancials(project.id).catch(() => null)
      pfFin = await portfolioFinancials(pfs[0].id).catch(() => null)
    }

    setCtx({
      orgId: me.orgId,
      orgName: orgs?.[0]?.name ?? '',
      role: me.role,
      portfolioId: pfs[0].id,
      projectId: project.id,
      projectName: project.name,
      address: project.properties?.address ?? '',
      arvCents: project.arv_cents,
      fin,
      portfolioFin: pfFin,
      reload: () => { load() },
      go: setPage,
    })
  }, [])

  useEffect(() => { load() }, [load])

  if (!ctx || !role) return null
  const showMoney = canSeeFinancials(role)
  const f = ctx.fin
  const allIn = f ? f.actual_cents : 0

  const pages: Record<string, React.ReactNode> = {
    home: <HomePage ctx={ctx} />,
    copilot: <CopilotPage />,
    deal: <DealPage />,
    capture: <CapturePage />,
    scope: <ScopePage />,
    bids: <BidsPage />,
    design: <DesignPage />,
    schedule: <SchedulePage />,
    field: <FieldPage ctx={ctx} />,
    materials: <MaterialsPage />,
    financials: showMoney ? <FinancialsPage ctx={ctx} /> : <PortalPage ctx={ctx} />,
    changes: <ChangesPage />,
    portal: <PortalPage ctx={ctx} />,
    risk: <RiskPage ctx={ctx} />,
    team: <TeamPage ctx={ctx} />,
    closeout: <CloseoutPage />,
    feed: <FeedPage />,
    reports: <ReportsPage />,
  }

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><div className="mark" /><b>Flip<span>Scope</span></b></div>
        <div className="project">
          <strong>{ctx.address || ctx.projectName}</strong>
          <small>{ctx.orgName}</small>
          <span className="phase">ACTIVE REHAB</span>
        </div>
        <div className="nav">
          {NAV.map(([id, ico, label]) => (
            <button key={id} className={page === id ? 'on' : ''} onClick={() => setPage(id)}>
              <span className="ico">{ico}</span>{label}
            </button>
          ))}
        </div>
        <div className="sidefoot">
          {showMoney && f ? (
            <>
              <div className="minirow"><span>All-in cost</span><strong>{formatCents(allIn)}</strong></div>
              <div className="minirow"><span>ARV</span><strong>{ctx.arvCents != null ? formatCents(ctx.arvCents) : '—'}</strong></div>
              <div className="minirow"><span>Projected profit</span><strong style={{ color: 'var(--green)' }}>{formatCents(f.profit_cents)}</strong></div>
              <div className="minirow"><span>ROI</span><strong style={{ color: 'var(--green)' }}>{formatRoi(f.roi_bps)}</strong></div>
            </>
          ) : (
            <div className="minirow"><span>Role</span><strong>{role}</strong></div>
          )}
          <div className="minirow" style={{ marginTop: 10 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user.email}</span>
            <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <input className="search" placeholder={`${ctx.orgName} · ${role}${role === 'investor' ? ' · read-only' : ''}`} readOnly />
          <div className="topactions">
            <button className="btn ghost" onClick={() => window.print()}>Export</button>
            <button className="btn p" onClick={() => setPage('capture')}>＋ AI Walkthrough</button>
          </div>
        </div>
        <div className="content">{pages[page]}</div>
      </main>
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
  return session ? <Shell session={session} /> : <Login />
}
