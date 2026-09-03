// The last two screens without a real backend: the AI Designer (deferred)
// and Reports generation (Phase 4). Everything else reads live data.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'

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
