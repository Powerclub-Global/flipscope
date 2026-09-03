import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { projectFinancials, portfolioFinancials, formatCents, formatRoi } from './lib/financials'
import type { Financials } from './lib/financials'
import { myRole, canSeeFinancials } from './lib/data'
import type { OrgRole } from './lib/data'
import { HomePage, FinancialsPage, FieldPage, FeedPage, PortalPage, RiskPage, TeamPage, LiveScopePage, LiveBidsPage, LiveMaterialsPage, LiveSchedulePage } from './pages/live'
import type { Ctx } from './pages/live'
import {
  CopilotPage, DealPage, CapturePage, DesignPage,
  ChangesPage, CloseoutPage, ReportsPage,
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

function AddPropertyModal({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const { data: property, error: propErr } = await supabase
        .from('properties')
        .insert({ org_id: ctx.orgId, portfolio_id: ctx.portfolioId, address, city, state })
        .select('id')
        .single()
      if (propErr) throw propErr

      const priceCents = purchasePrice ? Math.round(parseFloat(purchasePrice) * 100) : null
      const { error: projErr } = await supabase.from('projects').insert({
        org_id: ctx.orgId,
        property_id: property.id,
        name: projectName || address,
        status: 'rehab',
        purchase_price_cents: priceCents,
      })
      if (projErr) throw projErr

      onClose()
      ctx.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create property')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal on">
      <div className="modalbox">
        <div className="sectiontitle"><h2>Add property</h2></div>
        <form onSubmit={submit}>
          <div className="field"><label>Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} required /></div>
          <div className="formgrid" style={{ margin: '10px 0' }}>
            <div className="field"><label>City</label><input value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div className="field"><label>State</label><input value={state} onChange={(e) => setState(e.target.value)} /></div>
          </div>
          <div className="field"><label>Project name (optional)</label>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div>
          <div className="field" style={{ margin: '10px 0' }}><label>Purchase price (USD, optional)</label>
            <input inputMode="decimal" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} /></div>
          {error && <p className="autherr">{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn p" disabled={busy}>{busy ? 'Adding…' : 'Add property'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Shell({ session }: { session: Session }) {
  const [page, setPage] = useState('home')
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [role, setRole] = useState<OrgRole | null>(null)
  const [showAddProperty, setShowAddProperty] = useState(false)

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
    const orgId = me.orgId
    const orgName = orgs?.[0]?.name ?? ''
    const portfolioId = pfs?.[0]?.id ?? ''
    const hasProject = !!project

    let fin: Financials | null = null
    let pfFin: Financials | null = null
    if (project && canSeeFinancials(me.role)) {
      fin = await projectFinancials(project.id).catch(() => null)
      pfFin = portfolioId ? await portfolioFinancials(portfolioId).catch(() => null) : null
    }

    setCtx({
      orgId,
      orgName,
      role: me.role,
      portfolioId,
      hasProject,
      projectId: project?.id ?? '',
      projectName: project?.name ?? '',
      address: project?.properties?.address ?? '',
      arvCents: project?.arv_cents ?? null,
      fin,
      portfolioFin: pfFin,
      reload: () => { load() },
      go: setPage,
      addProperty: () => setShowAddProperty(true),
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
    scope: <LiveScopePage ctx={ctx} />,
    bids: <LiveBidsPage ctx={ctx} />,
    design: <DesignPage />,
    schedule: <LiveSchedulePage ctx={ctx} />,
    field: <FieldPage ctx={ctx} />,
    materials: <LiveMaterialsPage ctx={ctx} />,
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
          <strong>{ctx.address || ctx.projectName || 'No property yet'}</strong>
          <small>{ctx.orgName}</small>
          {ctx.hasProject && <span className="phase">ACTIVE REHAB</span>}
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
      {showAddProperty && <AddPropertyModal ctx={ctx} onClose={() => setShowAddProperty(false)} />}
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
