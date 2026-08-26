const steps = [
  {
    id: "space-it",
    number: "01",
    name: "SPACE IT",
    phase: "BEGIN WITH A SEED",
    copy: "Explore how volumes come together around the way life moves through space. Let four walls grow into a home, a compound, or a village.",
    action: "GROW THE PLAN",
  },
  {
    id: "shape-it",
    number: "02",
    name: "SHAPE IT",
    phase: "MAKE IT BUILDABLE",
    copy: "Give the plan volume. Set walls, openings, materials, and dimensions while a live takeoff keeps the physical build in view.",
    action: "BUILD THE MODEL",
  },
  {
    id: "see-it",
    number: "03",
    name: "SEE IT",
    phase: "SEE WHAT IT COULD BE",
    copy: "Carry Shape It views into a focused render engine. Explore light, material, atmosphere, and the feeling of being there before work begins.",
    action: "RENDER THE SHELTER",
  },
  {
    id: "shelter",
    number: "04",
    name: "SHELTER",
    phase: "LEARN HOW TO BUILD IT",
    copy: "Move from the chosen design to practical guidance, field lessons, plans, and support for building with earth and lavacrete.",
    action: "START THE BUILD",
  },
  {
    id: "shared",
    number: "05",
    name: "SHARED",
    phase: "GET THE TOOLS TOGETHER",
    copy: "Find, organize, borrow, and return the tools a local build requires. Shared makes access part of the building system.",
    action: "OPEN THE TOOL BANK",
  },
  {
    id: "stay",
    number: "06",
    name: "STAY",
    phase: "OPEN THE DOOR",
    copy: "Share a finished shelter with people who value how it was made. Earn income from your build—or swap nights in shelters around the world.",
    action: "STAY ON THE LAND",
  },
];

export default function Guide() {
  const jumpTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <main className="guide-page">
      <header className="guide-bar">
        <div className="guide-wordmark">shelter&nbsp;&nbsp; on the &nbsp;&nbsp;land</div>
        <div className="guide-title">ECOSYSTEM GUIDE</div>
        <div className="guide-count">01—06</div>
      </header>

      <section className="guide-intro">
        <p className="guide-kicker">FROM FIRST THOUGHT TO FINISHED SHELTER</p>
        <h1>One path.<br />Six useful tools.</h1>
        <p className="guide-deck">The On the Land ecosystem helps a building move from an idea in your head to a place you can stand inside.</p>
        <div className="guide-line" aria-hidden="true"><span /></div>
      </section>

      <nav className="journey-tabs" aria-label="Ecosystem journey">
        {steps.map((step) => (
          <button key={step.id} onClick={() => jumpTo(step.id)}>
            <span>{step.number}</span>{step.name}
          </button>
        ))}
      </nav>

      <div className="journey">
        {steps.map((step, index) => (
          <section className="journey-step" id={step.id} key={step.id}>
            <header>
              <span className="step-number">{step.number}</span>
              <h2>{step.name}</h2>
            </header>
            <div className="step-body">
              <p className="step-phase">{step.phase}</p>
              <p className="step-copy">{step.copy}</p>
            </div>
            <div className="step-action"><span>{step.action}</span><b>↗</b></div>
            <div className="step-progress" aria-hidden="true">
              {steps.map((item, itemIndex) => <i className={itemIndex <= index ? "passed" : ""} key={item.id} />)}
            </div>
          </section>
        ))}
      </div>

      <footer className="guide-footer">
        <p>THINK IT THROUGH.<br />MAKE IT REAL.</p>
        <p>SPACE IT → SHAPE IT → SEE IT → SHELTER → SHARED → STAY</p>
        <span>ON THE LAND</span>
      </footer>
    </main>
  );
}
