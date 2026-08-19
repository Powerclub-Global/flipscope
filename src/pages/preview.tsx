// Concept pages for features that land in Beta (Phases 3-4). Layouts and
// data mirror the concept build so the product vision stays visible while
// the real backends arrive.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { seed } from '../concept/seed'

const $ = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function BetaPill({ phase = 3 }: { phase?: number }) {
  return <span className="pill amber">CONCEPT PREVIEW · SHIPS IN BETA (PHASE {phase})</span>
}

function Section({ title, sub, children, pill }: { title: string; sub?: string; pill?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <>
      <div className="sectiontitle"><div><h2>{title}</h2>{sub && <div className="subtle">{sub}</div>}</div>{pill}</div>
      {children}
    </>
  )
}

export function CopilotPage() {
  const [msgs, setMsgs] = useState([
    { who: 'assistant', text: 'I’m the FlipScope Copilot. Once the AI service layer is live I’ll answer questions about this project’s cost, cash, schedule and risk from live data.' },
  ])
  const [input, setInput] = useState('')
  const f = seed.forecast

  function send() {
    if (!input.trim()) return
    setMsgs((m) => [...m, { who: 'user', text: input }, { who: 'assistant', text: 'The Copilot backend arrives in Phase 3 — this preview shows the interaction model from the concept build.' }])
    setInput('')
  }

  return (
    <section className="page on">
      <Section title="FlipScope Copilot" sub="Project-aware assistant for cost, cash, schedule and risk." pill={<BetaPill />} />
      <div className="copilotShell">
        <div>
          <div className="card">
            <h3>Live project insight</h3>
            <div className="insightBox"><small className="subtle">Projected final cost</small><b>{$(f.finalCost)}</b><div className="confidence"><i style={{ width: `${f.costConfidence}%` }} /></div><small className="subtle">{f.costConfidence}% confidence</small></div>
            <div className="insightBox"><small className="subtle">Projected profit</small><b style={{ color: 'var(--green)' }}>{$(f.profit)}</b><small className="subtle">ROI {f.roi}% · finish {f.finish}</small></div>
            <div className="insightBox"><small className="subtle">Risk score</small><b>{f.riskScore}/100</b><div className="confidence"><i style={{ width: `${100 - f.riskScore}%` }} /></div></div>
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

export function DealPage() {
  const d = seed.deal
  const p = seed.project
  const rehab = seed.costs.filter((c: any) => c.cat !== 'Purchase').reduce((a: number, c: any) => a + c.budget, 0)
  const selling = Math.round(p.arv * d.sellingPct / 100)
  const allIn = p.purchase + rehab + d.financing + d.holding + d.contingency + selling
  const profit = p.arv - allIn
  const roi = ((profit / allIn) * 100).toFixed(1)
  return (
    <section className="page on">
      <Section title="Deal Underwriting" sub="Buy-box math before you commit — ARV, all-in cost, margin." pill={<BetaPill phase={4} />} />
      <div className="grid">
        <div className="kpi"><small>Purchase</small><strong>{$(p.purchase)}</strong></div>
        <div className="kpi"><small>Rehab budget</small><strong>{$(rehab)}</strong></div>
        <div className="kpi"><small>ARV</small><strong>{$(p.arv)}</strong><div className="delta">Comps feed lands in Phase 4</div></div>
        <div className="kpi"><small>Projected profit</small><strong style={{ color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>{$(profit)}</strong><div className="delta">ROI {roi}%</div></div>
      </div>
      <div className="card">
        <h3>Cost stack</h3>
        <table className="table"><tbody>
          {[['Purchase', p.purchase], ['Rehab', rehab], ['Financing', d.financing], ['Holding', d.holding], ['Contingency', d.contingency], [`Selling (${d.sellingPct}%)`, selling]].map(([k, v]) => (
            <tr key={k as string}><td>{k}</td><td style={{ textAlign: 'right' }}>{$(v as number)}</td></tr>
          ))}
          <tr><td><b>All-in</b></td><td style={{ textAlign: 'right' }}><b>{$(allIn)}</b></td></tr>
        </tbody></table>
      </div>
    </section>
  )
}

export function CapturePage() {
  return (
    <section className="page on">
      <Section title="AI Walkthrough" sub="Walk the property once, talking naturally — get a priced scope back." pill={<BetaPill />} />
      <div className="stepbar">
        {[['1 · Record', 'Video + voice walkthrough'], ['2 · Transcribe', 'Voice becomes text'], ['3 · Extract', 'LLM builds line items'], ['4 · Price', 'Editable, human-in-the-loop']].map(([b, s], i) => (
          <div key={b} className={`step ${i === 0 ? 'done' : ''}`}><b>{b}</b><small>{s}</small></div>
        ))}
      </div>
      <div className="capture">
        <div className="camera">
          <div className="overlay"><button className="record" title="Recording pipeline ships in Phase 3" /></div>
        </div>
        <div className="card">
          <h3>Transcript</h3>
          <div className="transcript">{'Kitchen — remove existing cabinets and countertops. Install about eighteen feet of shaker cabinets, quartz tops around forty square feet…\n\n(The live transcription and scope engine arrive in Phase 3.)'}</div>
          <div className="drop" style={{ marginTop: 10 }}>Drop walkthrough video here (Phase 3)</div>
        </div>
      </div>
    </section>
  )
}

export function ScopePage() {
  const [items, setItems] = useState<any[]>(seed.scope.map((s: any) => ({ ...s })))
  const total = items.reduce((a, s) => a + s.qty * (s.labor + s.material), 0)
  return (
    <section className="page on">
      <Section title="Scope & Estimate" sub="Every line priced; toggle complete as work verifies." pill={<BetaPill />} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        <div className="kpi"><small>Line items</small><strong>{items.length}</strong></div>
        <div className="kpi"><small>Estimate total</small><strong>{$(Math.round(total))}</strong></div>
      </div>
      <div className="card">
        {items.map((s, i) => (
          <div className="scopeitem" key={i}>
            <div className={`check ${s.status === 'Done' ? 'done' : ''}`} onClick={() => setItems((xs) => xs.map((x, j) => j === i ? { ...x, status: x.status === 'Done' ? 'Ready' : 'Done' } : x))}>{s.status === 'Done' ? '✓' : ''}</div>
            <div>
              <strong>{s.task}</strong>
              <div className="scopemeta">
                <span className="pill">{s.room}</span><span className="pill">{s.trade}</span>
                <span className="pill">{s.qty} {s.unit}</span>
                {s.proof && <span className="pill green">proof required</span>}
              </div>
            </div>
            <b>{$(Math.round(s.qty * (s.labor + s.material)))}</b>
          </div>
        ))}
      </div>
    </section>
  )
}

export function BidsPage() {
  return (
    <section className="page on">
      <Section title="Bid Room" sub="Collect, compare and award sub bids per trade." pill={<BetaPill phase={4} />} />
      <div className="card tablewrap">
        <table className="table">
          <thead><tr><th>Trade</th><th>Vendor</th><th>Bid</th><th>Days</th><th>Rating</th><th>Status</th></tr></thead>
          <tbody>
            {seed.bids.map((b: any, i: number) => (
              <tr key={i}><td>{b.trade}</td><td>{b.vendor}</td><td>{$(b.amount)}</td><td>{b.days}</td><td>{b.rating}★</td>
              <td><span className={`pill ${b.status === 'Preferred' ? 'green' : ''}`}>{b.status}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function DesignPage() {
  const [pick, setPick] = useState(0)
  const products = [
    ['Shaker White Cabinets', '$5,180 · set', '#e8e3da'],
    ['Carrara Quartz', '$56 / SF', '#dcdcdc'],
    ['Driftwood Oak LVP', '$2.80 / SF', '#b39b7d'],
    ['Matte Black Fixtures', '$189+', '#2a2a2a'],
  ]
  return (
    <section className="page on">
      <Section title="AI Designer" sub="Re-design the space from walkthrough frames; every product priced into scope." pill={<BetaPill />} />
      <div className="designer">
        <div className="stage">
          <div className="empty"><div><b>Render pipeline ships in Phase 5</b><p className="subtle">The Designer takes a room photo and returns the finished space in your selected style, with the product list flowing straight into scope and materials.</p></div></div>
          <div className="beforeAfter"><span className="pill">BEFORE</span><span className="pill green">AFTER</span></div>
        </div>
        <div className="card toolrail">
          <h3>Style</h3>
          {['Modern', 'Transitional', 'Farmhouse'].map((s) => <button key={s} className={`btn ${s === 'Modern' ? 'p' : ''}`}>{s}</button>)}
          <h3 style={{ marginTop: 10 }}>Products</h3>
          <div className="productgrid">
            {products.map(([name, price, swatch], i) => (
              <div key={name} className={`product ${pick === i ? 'on' : ''}`} onClick={() => setPick(i)}>
                <div className="swatch" style={{ background: swatch }} /><b>{name}</b><span>{price}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export function SchedulePage() {
  const rows = seed.schedule
  const min = Math.min(...rows.map((r: any) => +new Date(r.startDate)))
  const max = Math.max(...rows.map((r: any) => +new Date(r.startDate) + r.durDays * 864e5))
  const span = max - min
  return (
    <section className="page on">
      <Section title="Calendar & Schedule" sub="Trade-level plan; progress rolls up from verified field work." pill={<BetaPill />} />
      <div className="card">
        <div className="gantt">
          {rows.map((r: any, i: number) => {
            const left = ((+new Date(r.startDate) - min) / span) * 100
            const width = (r.durDays * 864e5 / span) * 100
            return (
              <div className="grow" key={i}>
                <small>{r.task.slice(0, 24)}</small>
                <div className="gbar"><i style={{ left: `${left}%`, width: `${width}%`, opacity: r.status === 'Done' ? 1 : 0.65 }} /></div>
                <small className="subtle">{r.progress}%</small>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function MaterialsPage() {
  return (
    <section className="page on">
      <Section title="Materials & POs" sub="Selections, orders and deliveries tied to scope lines." pill={<BetaPill phase={4} />} />
      <div className="card tablewrap">
        <table className="table">
          <thead><tr><th>Item</th><th>Vendor</th><th>Qty</th><th>Price</th><th>Status</th></tr></thead>
          <tbody>
            {seed.materials.map((m: any, i: number) => (
              <tr key={i}><td>{m.name}</td><td>{m.vendor}</td><td>{m.qty} {m.unit}</td><td>{$(m.price)}</td>
              <td><span className={`pill ${m.status === 'Delivered' ? 'green' : ''}`}>{m.status}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ChangesPage() {
  return (
    <section className="page on">
      <Section title="Change Orders & RFIs" sub="Scope changes priced, approved and signed before work proceeds." pill={<BetaPill phase={4} />} />
      <div className="grid2">
        {seed.changes.map((c: any, i: number) => (
          <div className="card" key={i}>
            <div className="sectiontitle"><h3 style={{ margin: 0 }}>{c.title}</h3><span className={`pill ${c.status === 'Approved' ? 'green' : 'amber'}`}>{c.status}</span></div>
            <b style={{ fontSize: 22 }}>{$(c.amount)}</b>
            <p className="subtle" style={{ fontSize: 12 }}>E-signature flow lands in Phase 4.</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function CloseoutPage() {
  return (
    <section className="page on">
      <Section title="Closeout & Warranty" sub="Punch, lien waivers, inspections and the warranty packet." pill={<BetaPill phase={4} />} />
      <div className="grid2">
        <div className="card">
          <h3>Closeout checklist</h3>
          {seed.closeout.map((c: any, i: number) => (
            <div className="scopeitem" key={i}>
              <div className={`check ${c.status === 'Done' ? 'done' : ''}`}>{c.status === 'Done' ? '✓' : ''}</div>
              <strong>{c.title}</strong><span className="pill">{c.status}</span>
            </div>
          ))}
        </div>
        <div className="card tablewrap">
          <h3>Warranties</h3>
          <table className="table">
            <thead><tr><th>Item</th><th>Vendor</th><th>Expires</th></tr></thead>
            <tbody>{seed.warranties.map((w: any, i: number) => <tr key={i}><td>{w.item}</td><td>{w.vendor}</td><td>{w.expires}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export function ReportsPage() {
  return (
    <section className="page on">
      <Section title="Reports" sub="Investor-grade exports: budget vs actual, draw requests, closeout packet." pill={<BetaPill phase={4} />} />
      <div className="grid3">
        {[['Budget vs Actual', 'Category-level variance with committed costs'], ['Draw Request', 'Verified-work draw package for the lender'], ['Before / After', 'Marketing gallery with proof-chain provenance']].map(([t, s]) => (
          <div className="card" key={t}><h3>{t}</h3><p className="subtle" style={{ fontSize: 12.5 }}>{s}</p><button className="btn">Generate (Phase 4)</button></div>
        ))}
      </div>
    </section>
  )
}
