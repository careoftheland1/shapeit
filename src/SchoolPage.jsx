import SiteFooter from "./SiteFooter.jsx";

const chapters = [
  { number: "01", title: "Soils", summary: "Learn what is beneath your feet and whether it can become a wall.", lessons: ["Reading the land", "Simple field tests", "Soil composition", "Mix trials + test blocks"] },
  { number: "02", title: "Foundations", summary: "Move loads safely into the ground and keep water away from the building.", lessons: ["Drainage before concrete", "Setting out the building", "Slabs + footings", "Capillary breaks"] },
  { number: "03", title: "Engineering", summary: "Understand the forces at work and know when local expertise is required.", lessons: ["Loads in plain language", "Walls, openings + spans", "Wind + seismic conditions", "Working with an engineer"] },
  { number: "04", title: "Planning", summary: "Turn a drawing into an ordered, permitted and properly supplied project.", lessons: ["Permits + jurisdiction", "Budgeting the work", "Material takeoffs", "People, tools + sequence"] },
  { number: "05", title: "Building", summary: "Follow the shelter from the first line on the ground to a weather-tight shell.", lessons: ["Layout + excavation", "Formwork + reinforcement", "Making the walls", "Openings, roof + services"] },
  { number: "06", title: "Finishing", summary: "Complete the surfaces, systems and quiet details that make shelter habitable.", lessons: ["Earthen surfaces", "Floors + fixtures", "Water management", "Care + repair"] },
];

const resources = [
  ["01", "Project budget", "A simple cost plan organized around the sequence of the build.", "XLSX"],
  ["02", "Material inventory", "Track what is needed, sourced, delivered and still outstanding.", "XLSX"],
  ["03", "Build schedule", "A practical framework for dependencies, labor and time on site.", "XLSX"],
  ["04", "Calculators", "Working quantities for soil, aggregate, cement, walls and floors.", "XLSX"],
];

function SchoolPage() {
  return <main className="school-page">
    <header className="nav school-nav"><a className="wordmark" href="/">shelter&nbsp;&nbsp;&nbsp;on the&nbsp;&nbsp;land</a><nav><a href="#curriculum">Curriculum</a><a href="#first-lesson">First lesson</a><a href="#resources">Resources</a><a href="#consultation">Consultation</a></nav><a className="nav-cta" href="#start">Begin with the soil ↘</a></header>

    <section className="school-hero" id="top">
      <p className="kicker">Shelter School / Free and open</p>
      <h1>Learn to<br/>build it.</h1>
      <div><p>A complete video guide to building small shelter from the land—from the first soil test to the last finished surface.</p><a href="#curriculum">See the curriculum <span>↓</span></a></div>
    </section>

    <section className="school-statement" id="start"><p className="kicker">Knowledge belongs on site</p><h2>Plans tell you what.<br/>School shows you how.</h2><div><p>Good information makes independent building possible. Every lesson follows the actual order of the work, using direct language, visible demonstrations and tools you can carry into the field.</p><p>The school and the shelter plans are free. When a decision depends on your soil, climate, code or structure, you can bring us in for a focused consultation.</p></div></section>

    <section className="curriculum" id="curriculum">
      <header><p className="kicker">The complete build / Six chapters</p><h2>From ground<br/>to shelter.</h2><p>Move in order or go directly to the work in front of you. Each chapter combines short lessons, demonstrations and downloadable field references.</p></header>
      <div className="chapter-list">{chapters.map((chapter, index) => <article className="chapter" key={chapter.number}>
        <div className="chapter-title"><span className="chapter-number">{chapter.number}</span><h3>{chapter.title}</h3><p>{chapter.summary}</p><span>{chapter.lessons.length} lessons</span></div>
        <ol>{chapter.lessons.map((lesson, i) => <li key={lesson}><span>{chapter.number}.{String(i + 1).padStart(2,"0")}</span><b>{lesson}</b><i>{index === 0 && i === 0 ? "Watch first lesson" : "Video lesson"}</i><em>↗</em></li>)}</ol>
      </article>)}</div>
    </section>

    <section className="featured-lesson" id="first-lesson">
      <div className="lesson-screen"><div className="soil-lines"/><button aria-label="Play lesson"><span>▶</span></button><p>01.01 / Reading the land</p><i>12:48</i></div>
      <div className="lesson-copy"><p className="kicker">First lesson</p><h2>Before you draw,<br/>look down.</h2><p>Begin by observing water, slope, plants and exposed earth. These clues tell you how the site behaves—and where more careful testing should begin.</p><a href="#curriculum">Watch the lesson <span>↗</span></a></div>
    </section>

    <section className="field-notes"><p className="kicker">How to use the school</p><div><article><span>01</span><h3>Watch before the work</h3><p>See the whole operation before materials, tools and people are moving.</p></article><article><span>02</span><h3>Carry it into the field</h3><p>Use chapter notes, checklists and calculations alongside the drawings.</p></article><article><span>03</span><h3>Stop when it gets specific</h3><p>Local soil, structure and code need local judgment. Know when to ask.</p></article></div></section>

    <section className="school-resources" id="resources"><header><p className="kicker">Free resources</p><h2>The quiet tools<br/>behind a build.</h2><p>Planning documents made for a small, owner-led project. Download them, change them and make them part of your own way of working.</p></header><div className="resource-list">{resources.map(([n,title,copy,type]) => <a href="mailto:build@onthe.land?subject=School resource" key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p><i>{type}</i><b>↓</b></a>)}</div></section>

    <section className="school-plans"><p className="kicker">Learn with something real</p><h2>Choose a shelter.<br/>Follow the build.</h2><p>The lessons refer back to the free shelter plans, giving every demonstration a real dimension, assembly and sequence.</p><a href="/#shelters">Get the free plans <span>↗</span></a></section>

    <section className="school-help" id="consultation"><p className="kicker">When general knowledge meets your land</p><h2>One good question<br/>can move a build.</h2><p>Book a focused consultation when you need another set of eyes on soil tests, siting, plans, materials or an approaching construction decision.</p><a href="mailto:build@onthe.land?subject=School consultation">Ask for a consultation <span>↗</span></a><small>Or compare <a href="/packages/">all ways of working →</a></small></section>

    <SiteFooter/>
  </main>;
}

export default SchoolPage;
