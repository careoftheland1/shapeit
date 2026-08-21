import { lazy, Suspense } from "react";
import heroUrl from "./assets/re-corner.png";
import SiteFooter from "./SiteFooter.jsx";

const ShelterPage = lazy(() => import("./ShelterPage.jsx"));
const PackagesPage = lazy(() => import("./PackagesPage.jsx"));
const SchoolPage = lazy(() => import("./SchoolPage.jsx"));

const services = [
  { number: "01", kind: "plans", title: "Start small", copy: "Begin with the Four Walls—a 200 sq ft seed volume that contains the basic language of every shelter in the collection.", action: "See the shelters", href: "#shelters" },
  { number: "02", kind: "school", title: "Learn to build", copy: "Follow a complete build from soil and foundations through walls, roof and finishing. The school is free and open.", action: "Enter Shelter School", href: "/school/" },
  { number: "03", kind: "tool", title: "Shape your own", copy: "Repeat and arrange the Four Walls volume, place openings and understand preliminary material quantities in our free browser tool.", action: "Open Build It", href: "https://buildit.onthe.land/" },
];

const shelters = [
  { number: "S—01", name: "The Four Walls", area: "200 sq ft", rooms: "Studio / 1 bath", shape: "room", slug: "the-four-walls" },
  { number: "S—02", name: "The Courtyard", area: "600 sq ft", rooms: "3 volumes + courtyards", shape: "court", slug: "the-courtyard" },
  { number: "S—03", name: "The Long House", area: "1,000 sq ft", rooms: "4–6+ volumes", shape: "long", slug: "the-long-house" },
];

function Plan({ shape }) {
  return <svg className={`plan plan-${shape}`} viewBox="0 0 420 260" aria-hidden="true">
    {shape === "room" && <><rect x="105" y="34" width="210" height="192"/><path d="M105 164h80m45 62v-62h85M185 164v62M230 164h85"/><path className="door" d="M185 180a38 38 0 0 1 38-38"/></>}
    {shape === "court" && <><path d="M58 45h304v170H58zM156 95h108v120H156z"/><path d="M58 95h98m108 0h98M110 95v120m200-120v120"/><path className="door" d="M156 130a35 35 0 0 0-35-35M264 130a35 35 0 0 1 35-35"/></>}
    {shape === "long" && <><rect x="28" y="70" width="364" height="120"/><path d="M128 70v120m98-120v120m78-120v120M28 130h100m98 0h78"/><path className="door" d="M128 150a30 30 0 0 1 30-30M226 150a30 30 0 0 0-30-30"/></>}
  </svg>;
}

function EntryVisual({ kind }) {
  if (kind === "plans") return <svg className="entry-visual" viewBox="0 0 240 88" aria-hidden="true"><rect x="44" y="12" width="150" height="64"/><path d="M44 50h55m35 26V50h60M99 50v26m35-26h60"/></svg>;
  if (kind === "school") return <div className="entry-visual school-sequence" aria-hidden="true">{["SOIL","FOUND","ENG","PLAN","BUILD","FINISH"].map((x,i)=><i key={x}><span>{String(i+1).padStart(2,"0")}</span>{x}</i>)}</div>;
  return <svg className="entry-visual" viewBox="0 0 240 88" aria-hidden="true"><path d="M35 67 91 36l54 27 59-34v38l-59 10-54-14-56 8z"/><path d="M91 36v27m54 0v14m59-48-59-13-54 20-56-9v40"/><circle cx="185" cy="24" r="4"/></svg>;
}

function BuildingLanguageDiagram() {
  return <figure className="building-language">
    <svg viewBox="0 0 1040 250" role="img" aria-labelledby="language-title language-desc">
      <title id="language-title">One shelter volume arranged into courtyard and long house configurations</title>
      <desc id="language-desc">A single square becomes a cluster around open courtyards, then stretches into a linear sequence.</desc>
      <path className="language-thread" d="M104 111H236M424 111h91M708 111h75"/>
      <g className="language-seed"><rect x="42" y="49" width="124" height="124"/><circle cx="104" cy="111" r="4"/></g>
      <g className="language-court-one"><rect x="256" y="27" width="78" height="78"/><rect x="346" y="27" width="78" height="78"/><rect x="256" y="117" width="78" height="78"/><path className="language-void" d="M346 117h78v78h-78z"/></g>
      <g className="language-court-two"><rect x="535" y="27" width="72" height="72"/><rect x="619" y="27" width="72" height="72"/><rect x="535" y="111" width="72" height="72"/><rect x="619" y="111" width="72" height="72"/><path className="language-void" d="M596 88h34v34h-34z"/></g>
      <g className="language-long"><rect x="803" y="70" width="62" height="82"/><rect x="877" y="44" width="62" height="82"/><rect x="951" y="82" width="62" height="82"/><path className="language-void" d="M865 126h86v38h-86z"/></g>
    </svg>
    <figcaption><span>01 / The seed</span><span>02 / Courtyard studies</span><span>03 / Linear studies</span></figcaption>
  </figure>;
}

function App() {
  if (window.location.pathname.startsWith("/school")) {
    return <Suspense fallback={<div className="page-loading">Opening the school…</div>}><SchoolPage /></Suspense>;
  }
  if (window.location.pathname.startsWith("/packages")) {
    return <Suspense fallback={<div className="page-loading">Loading support…</div>}><PackagesPage /></Suspense>;
  }
  if (window.location.pathname.startsWith("/shelters/")) {
    return <Suspense fallback={<div className="page-loading">Loading shelter…</div>}><ShelterPage /></Suspense>;
  }
  return <main>
    <header className="nav">
      <a className="wordmark" href="#top">shelter&nbsp;&nbsp;&nbsp;on the&nbsp;&nbsp;land</a>
      <nav><a href="#practice">Practice</a><a href="#shelters">Shelters</a><a href="#process">Process</a><a href="#about">About</a></nav>
      <a className="nav-cta" href="#contact">Start a build ↗</a>
    </header>

    <section className="hero" id="top">
      <img src={heroUrl} alt="Warm afternoon light inside a naturally built earthen shelter"/>
      <div className="hero-wash"/>
      <p className="hero-note">Free plans, practical knowledge +<br/>experienced help for building on the land</p>
      <h1>be a<br/>builder</h1>
      <a className="down" href="#process">See how it works <span>↓</span></a>
    </section>

    <section className="manifesto" id="practice">
      <p className="kicker">Shelter on the Land / The practice</p>
      <div>
        <h2>Good shelter can<br/>come from the ground.</h2>
        <p>We make small buildings that ordinary people can understand, adapt and build. The plans and lessons are free. Experienced help is there when the work calls for it.</p>
      </div>
    </section>

    <section className="services">
      {services.map(item => <article key={item.number}><a href={item.href}><span>{item.number}</span><EntryVisual kind={item.kind}/><h3>{item.title}</h3><p>{item.copy}</p><b>{item.action} ↗</b></a></article>)}
    </section>

    <section className="plans" id="shelters">
      <header><p className="kicker">The free shelter collection</p><h2>Plans made<br/>to be built.</h2><p>The Four Walls is the seed: a 200 sq ft room that teaches the whole system. Larger shelters grow through repetition, gathering enclosed rooms and useful open space between them.</p></header>
      <BuildingLanguageDiagram/>
      <div className="plan-grid">
        {shelters.map(s => <a className="plan-card" href={`/shelters/${s.slug}/`} key={s.number}>
          <div className="plan-meta"><span>{s.number}</span><span>{s.area}</span></div>
          <Plan shape={s.shape}/>
          <div className="plan-name"><h3>{s.name}</h3><p>{s.rooms}</p><b>↗</b></div>
        </a>)}
      </div>
      <a className="text-link" href="/school/">Learn how to build <span>→</span></a>
    </section>

    <section className="process" id="process">
      <p className="kicker">How it works</p>
      <h2>From a free plan<br/>to a built shelter.</h2>
      <ol>
        <li><span>01</span><div><small>Plans · Details · Material schedule</small><h3>Start with a complete shelter</h3><p>Choose a free plan with dimensioned drawings, assemblies and preliminary quantities—or use Build It to test a form of your own.</p><a href="#shelters">Choose a shelter ↗</a></div></li>
        <li><span>02</span><div><small>Budget · Inventory · Build sequence</small><h3>Understand the work ahead</h3><p>Turn the drawings into a working budget, material inventory and realistic sequence. Shelter School demonstrates each stage before you reach it on site.</p><a href="/school/">Enter Shelter School ↗</a></div></li>
        <li><span>03</span><div><small>Site · Code · Engineering</small><h3>Make the plan belong to the land</h3><p>Confirm access, utilities, soil, climate and local requirements. Adapt siting, foundations and structural details with the professionals required in your jurisdiction.</p></div></li>
        <li><span>04</span><div><small>Review · Tailoring · Build support</small><h3>Build independently—or with us</h3><p>Carry the plan into construction yourself. When a decision needs experience, bring us in for a focused review, plan tailoring or guidance through the build.</p><a href="/packages/">See ways of working ↗</a></div></li>
      </ol>
    </section>

    <section className="contact" id="contact">
      <p className="kicker">Plans to build your own shelter / Free</p>
      <h2>Start with<br/>a shelter.</h2>
      <div className="contact-actions"><a href="#shelters">See the free plans <span>↗</span></a><a href="mailto:build@onthe.land?subject=My land">Tell us about your land <span>↗</span></a></div>
    </section>

    <SiteFooter/>
  </main>;
}

export default App;
