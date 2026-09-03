import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { projectFinancials, portfolioFinancials, formatCents, formatRoi } from './lib/financials'
import type { Financials } from './lib/financials'
import { myRole, canSeeFinancials, canManageProperties } from './lib/data'
import type { OrgRole } from './lib/data'
import { HomePage, FinancialsPage, FieldPage, FeedPage, PortalPage, RiskPage, TeamPage, LiveScopePage, LiveBidsPage, LiveMaterialsPage, LiveSchedulePage, LiveChangesPage, LiveCloseoutPage, LiveDealPage, LiveCopilotPage, LiveCapturePage } from './pages/live'
import type { Ctx } from './pages/live'
import {
  DesignPage,
  ReportsPage,
} from './pages/preview'
import './App.css'

// Nav order and icons match the concept build exactly.
const NAV: [string, string, string][] = [
  ['home', '⌂', 'Command Center'],
  ['copilot', '✦', 'FlipScope Copilot'],
  ['deal', '◆', 'Deal Underwriting'],
  ['capture', '◉', 'Property Walkthrough'],
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
      const { data: created, error: projErr } = await supabase.from('projects').insert({
        org_id: ctx.orgId,
        property_id: property.id,
        name: projectName || address,
        status: 'rehab',
        purchase_price_cents: priceCents,
      }).select('id').single()
      if (projErr) throw projErr

      onClose()
      // Land on the property that was just created.
      ctx.selectProject(created.id)
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

interface ProjectRow {
  id: string
  name: string
  status: string
  arv_cents: number | null
  properties: { address: string } | null
}

// Which deal the user was last looking at. Per-browser convenience only —
// it can come back empty and the shell just falls back to the first project.
const PROJECT_KEY = 'flipscope.selectedProject'
const readStoredProject = () => { try { return localStorage.getItem(PROJECT_KEY) ?? '' } catch { return '' } }
const storeProject = (id: string) => { try { localStorage.setItem(PROJECT_KEY, id) } catch { /* storage unavailable */ } }

function Shell({ session }: { session: Session }) {
  const [page, setPage] = useState('home')
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [role, setRole] = useState<OrgRole | null>(null)
  const [showAddProperty, setShowAddProperty] = useState(false)
  const [selectedId, setSelectedId] = useState(readStoredProject)
  const [menuOpen, setMenuOpen] = useState(false)

  const selectProject = useCallback((id: string) => { setSelectedId(id); storeProject(id) }, [])

  const load = useCallback(async () => {
    const me = await myRole()
    if (!me) return
    setRole(me.role)

    const { data: orgs } = await supabase.from('organizations').select('id, name')
    const { data: pfs } = await supabase.from('portfolios').select('id, name')
    const { data: prjs } = await supabase
      .from('projects')
      .select('id, name, status, arv_cents, properties(address)')
      .order('created_at')

    const rows = (prjs ?? []) as unknown as ProjectRow[]
    const projects = rows.map((r) => ({
      id: r.id, name: r.name, status: r.status, address: r.properties?.address ?? '',
    }))
    // Stay on the selected deal across reloads; fall back to the first.
    const project = rows.find((r) => r.id === selectedId) ?? rows[0]

    const orgId = me.orgId
    const orgName = orgs?.[0]?.name ?? ''
    const portfolioId = pfs?.[0]?.id ?? ''

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
      hasProject: !!project,
      projectId: project?.id ?? '',
      projectName: project?.name ?? '',
      projectStatus: project?.status ?? '',
      address: project?.properties?.address ?? '',
      arvCents: project?.arv_cents ?? null,
      fin,
      portfolioFin: pfFin,
      projects,
      selectProject,
      reload: () => { load() },
      go: setPage,
      addProperty: () => setShowAddProperty(true),
    })
  }, [selectedId, selectProject])

  useEffect(() => { load() }, [load])

  if (!ctx || !role) return null
  const showMoney = canSeeFinancials(role)
  const f = ctx.fin
  const allIn = f ? f.actual_cents : 0

  const pages: Record<string, React.ReactNode> = {
    home: <HomePage ctx={ctx} />,
    copilot: <LiveCopilotPage ctx={ctx} />,
    deal: <LiveDealPage ctx={ctx} />,
    capture: <LiveCapturePage ctx={ctx} />,
    scope: <LiveScopePage ctx={ctx} />,
    bids: <LiveBidsPage ctx={ctx} />,
    design: <DesignPage />,
    schedule: <LiveSchedulePage ctx={ctx} />,
    field: <FieldPage ctx={ctx} />,
    materials: <LiveMaterialsPage ctx={ctx} />,
    financials: showMoney ? <FinancialsPage ctx={ctx} /> : <PortalPage ctx={ctx} />,
    changes: <LiveChangesPage ctx={ctx} />,
    portal: <PortalPage ctx={ctx} />,
    risk: <RiskPage ctx={ctx} />,
    team: <TeamPage ctx={ctx} />,
    closeout: <LiveCloseoutPage ctx={ctx} />,
    feed: <FeedPage />,
    reports: <ReportsPage />,
  }

  const pageLabel = NAV.find(([id]) => id === page)?.[2] ?? ''

  return (
    <div className="app">
      {/* Phone header. The concept CSS hides the sidebar under 720px, so
          without this there is no navigation at all on a phone — which is
          exactly where a walkthrough gets recorded. */}
      <div className="mobilebar">
        <b>Flip<span>Scope</span></b>
        <span className="subtle" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 8px' }}>{pageLabel}</span>
        <button className="btn" style={{ padding: '6px 11px' }} onClick={() => setMenuOpen(true)} aria-label="Open menu">☰</button>
      </div>
      {menuOpen && <div className="navbackdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={`side${menuOpen ? ' open' : ''}`}>
        <div className="brand"><div className="mark" /><b>Flip<span>Scope</span></b></div>
        <div className="project">
          {ctx.projects.length > 1 ? (
            <select
              value={ctx.projectId}
              onChange={(e) => ctx.selectProject(e.target.value)}
              style={{ width: '100%', background: '#0a130e', border: '1px solid var(--line)', color: 'var(--text)', borderRadius: 7, padding: '6px 7px', fontWeight: 700 }}
            >
              {ctx.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.address || p.name}</option>
              ))}
            </select>
          ) : (
            <strong>{ctx.address || ctx.projectName || 'No property yet'}</strong>
          )}
          <small>{ctx.orgName}{ctx.projects.length > 1 ? ` · ${ctx.projects.length} properties` : ''}</small>
          {ctx.hasProject && <span className="phase">{ctx.projectStatus.replace(/_/g, ' ').toUpperCase()}</span>}
          {canManageProperties(role) && (
            <button
              className="btn ghost"
              style={{ width: '100%', marginTop: 9, padding: '6px 8px', fontSize: 11 }}
              onClick={() => setShowAddProperty(true)}
            >+ Add property</button>
          )}
        </div>
        <div className="nav">
          {NAV.map(([id, ico, label]) => (
            <button key={id} className={page === id ? 'on' : ''} onClick={() => { setPage(id); setMenuOpen(false) }}>
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
            <button className="btn p" onClick={() => setPage('capture')}>＋ Walkthrough</button>
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
