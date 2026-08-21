import SiteFooter from "./SiteFooter.jsx";

const packages = [
  {
    index: "01", name: "Independent", price: "Free", note: "For the capable self-starter",
    intro: "Take the plans and make a start. You lead the work, assemble your local team and adapt the design to your land.",
    includes: ["Complete digital plan set", "Material quantities + build sequence", "Editable project checklist", "Future plan updates"],
    action: "Choose a shelter", href: "/#shelters"
  },
  {
    index: "02", name: "Supported", price: "From $1,000", note: "For a strong start and timely answers",
    intro: "Bring us into the decisions that shape the build. We review your direction, help assemble a team and stay available at key moments.",
    includes: ["Everything in Independent", "Site + orientation review", "Two design work sessions", "Engineer + contractor introductions", "Shared project portal"],
    action: "Ask about support", href: "mailto:build@onthe.land?subject=Supported build"
  },
  {
    index: "03", name: "Guided", price: "From $5,000", note: "For an owner-builder with a partner",
    intro: "A longer working relationship from site planning through construction. You remain the builder; we help keep the whole effort coherent.",
    includes: ["Everything in Supported", "Plan adaptations", "Material + assembly guidance", "Milestone drawing reviews", "Regular build consultations", "Shared project portal"],
    action: "Plan a guided build", href: "mailto:build@onthe.land?subject=Guided build"
  },
  {
    index: "04", name: "Custom", price: "By proposal", note: "For architecture made for one place",
    intro: "A full architectural commission shaped around your land, climate, material, budget and way of living—from first idea to a buildable design.",
    includes: ["Original site-specific design", "Architecture + consultant coordination", "Permit drawing set", "Material research + prototyping", "Construction-phase support", "Shared project portal"],
    action: "Start a conversation", href: "mailto:build@onthe.land?subject=Custom shelter"
  }
];

const portalItems = [
  ["01", "One source of truth", "Current drawings, specifications, site photographs and meeting notes stay together—not scattered across inboxes."],
  ["02", "Decisions made visible", "Open questions, approvals and next actions are recorded so everyone knows what has changed and why."],
  ["03", "Help in the field", "Share a photograph or question from the build and keep the response connected to the right detail or milestone."],
];

function PackagesPage() {
  return <main className="packages-page">
    <header className="nav packages-nav">
      <a className="wordmark" href="/">shelter&nbsp;&nbsp;&nbsp;on the&nbsp;&nbsp;land</a>
      <nav><a href="/#practice">Practice</a><a href="/#shelters">Shelters</a><a href="/#process">Process</a><a href="/#about">About</a></nav>
      <a className="nav-cta" href="#choose">Find your way ↘</a>
    </header>

    <section className="packages-hero">
      <p className="kicker">Plans + ways of working</p>
      <h1>Build it<br/>your way.</h1>
      <div className="packages-hero-copy"><p>Every project begins with a free plan. Go independently, ask for a few well-timed conversations, or bring us alongside for the whole build.</p><a href="#packages">Compare the paths <span>↓</span></a></div>
    </section>

    <section className="packages-intro" id="choose">
      <p className="kicker">Choose your level of support</p>
      <h2>The plans are free.<br/>Experience is there<br/>when you need it.</h2>
      <p>Start small. Add support only when it creates real value—at the site, around the table or during the build. You can begin independently and move into another path later.</p>
    </section>

    <section className="package-list" id="packages">
      {packages.map((item, i) => <article className={`package-row package-${i + 1}`} key={item.name}>
        <div className="package-heading"><span>{item.index}</span><p>{item.note}</p><h2>{item.name}</h2></div>
        <div className="package-details"><div className="package-price"><span>Starting at</span><strong>{item.price}</strong></div><p className="package-intro">{item.intro}</p><div className="package-includes"><span>What is included</span><ul>{item.includes.map(x => <li key={x}>{x}</li>)}</ul></div><a href={item.href}>{item.action}<span>↗</span></a></div>
      </article>)}
    </section>

    <section className="portal">
      <header><p className="kicker">The project portal / In development</p><h2>A clear place<br/>for the work.</h2><p>Supported, Guided and Custom projects will share a simple online workspace built around the realities of making a building.</p></header>
      <div className="portal-window">
        <div className="portal-top"><span>S—01 / The Four Walls</span><span>Build overview</span><i>24% complete</i></div>
        <div className="portal-body"><aside><b>Overview</b><span>Drawings</span><span>Decisions <i>3</i></span><span>Site log</span><span>Conversations</span></aside><div className="portal-content"><p>Next milestone</p><h3>Confirm the building on the land</h3><div className="progress"><i/></div><dl><div><dt>Current drawing</dt><dd>A—101 / Site plan v.03</dd></div><div><dt>Next conversation</dt><dd>Friday / 10:00 Arizona</dd></div><div><dt>Open decisions</dt><dd>3 items need attention</dd></div></dl></div></div>
      </div>
      <div className="portal-points">{portalItems.map(([n,title,copy]) => <article key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="package-guide">
      <p className="kicker">A simple guide</p><h2>Not sure where<br/>you belong?</h2>
      <div><p>If you already have land, practical building experience and trusted local professionals, begin <b>Independent</b>.</p><p>If you want an experienced eye on the early decisions or a reliable person to call, choose <b>Supported</b>.</p><p>If you intend to lead the build but want ongoing design guidance, choose <b>Guided</b>.</p><p>If the project needs to be drawn from the land outward, begin with <b>Custom</b>.</p></div>
    </section>

    <section className="packages-contact"><p className="kicker">Tell us what you are building</p><h2>Begin with<br/>the land.</h2><p>You do not need to know which package fits. Send a few words about the place, the shelter and what you hope to do yourself.</p><a href="mailto:build@onthe.land?subject=My shelter project">Start a conversation <span>↗</span></a></section>
    <SiteFooter/>
  </main>;
}

export default PackagesPage;
