// Concept pages for the features that still need an AI service layer
// (Phases 3-5). Every other module now reads the real backend; these are
// the only screens left showing demo data, and each says so on its face.
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
