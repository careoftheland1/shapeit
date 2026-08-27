import { useEffect, useRef, useState } from "react";
import { renderScene } from "./render/renderClient";

const AUTOSAVE_KEY = "see-it:on-the-land:project:v1";
const DEFAULT_SCENE = "Afternoon light. Warm desaturated tones. Chiricahua foothills. Native grasses, mesquite and acacia. Rammed earth texture with horizontal lift lines. Minimal, quiet atmosphere.";
const MODES = ["source", "scene", "render", "results"];
const blankProject = () => ({ version: 1, id: crypto.randomUUID(), name: "PROJECT 01", source: null, scene: DEFAULT_SCENE, frame: "source", quality: "standard", results: [], currentResultId: null });

function restoreProject() { try { const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY)); return saved?.version === 1 ? saved : blankProject(); } catch { return blankProject(); } }
function readImage(file) { return new Promise((resolve, reject) => { if (!file?.type.startsWith("image/")) return reject(new Error("Choose a JPEG, PNG, or WebP image.")); const reader = new FileReader(); reader.onload = () => resolve({ id: crypto.randomUUID(), name: file.name, dataUrl: reader.result, type: file.type, role: "architecture" }); reader.onerror = () => reject(new Error("The image could not be read.")); reader.readAsDataURL(file); }); }
function downloadData(dataUrl, filename) { const link = document.createElement("a"); link.href = dataUrl; link.download = filename; link.click(); }

export default function SeeIt() {
  const [project, setProject] = useState(restoreProject);
  const [mode, setMode] = useState(project.source ? "scene" : "source");
  const [menuOpen, setMenuOpen] = useState(true), [projectMenu, setProjectMenu] = useState(false), [moreMenu, setMoreMenu] = useState(false);
  const [rendering, setRendering] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState("");
  const fileInput = useRef(null), loadInput = useRef(null);
  useEffect(() => { try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project)); } catch { /* large images may exceed browser storage */ } }, [project]);
  const currentResult = project.results.find((r) => r.id === project.currentResultId);
  const workspaceImage = currentResult?.dataUrl || project.source?.dataUrl;

  async function acceptFile(file) { setError(""); try { const source = await readImage(file); setProject((p) => ({ ...p, source, results: [], currentResultId: null })); setMode("scene"); } catch (e) { setError(e.message); } }
  async function runRender() {
    if (!project.source) { setMode("source"); setError("Add a source image before rendering."); return; }
    if (!project.scene.trim()) { setMode("scene"); setError("Describe the scene before rendering."); return; }
    setRendering(true); setProgress(8); setError(""); setMode("render");
    try {
      const result = await renderScene({ sourceImages: [project.source], sceneDescription: project.scene, frame: project.frame, quality: project.quality, projectId: project.id }, setProgress);
      const entry = { ...result, number: project.results.length + 1, createdAt: new Date().toISOString(), frame: project.frame };
      setProject((p) => ({ ...p, results: [...p.results, entry], currentResultId: entry.id })); setMode("results");
    } catch (e) { setError(e.message || "The render failed. Your project has been preserved."); } finally { setRendering(false); setProgress(0); }
  }
  function saveProject() { const blob = new Blob([JSON.stringify(project)], { type: "application/json" }); const url = URL.createObjectURL(blob); downloadData(url, `${project.name.toLowerCase().replaceAll(" ", "-")}.seeit.json`); setTimeout(() => URL.revokeObjectURL(url), 500); setProjectMenu(false); }
  async function loadProject(file) { try { const loaded = JSON.parse(await file.text()); if (loaded?.version !== 1 || !loaded.id || !Array.isArray(loaded.results)) throw new Error(); setProject(loaded); setMode(loaded.currentResultId ? "results" : loaded.source ? "scene" : "source"); setError(""); } catch { setError("This is not a valid See It project file."); } }
  function resetProject() { if (!confirm("Reset this project? This clears the current source and render history.")) return; setProject(blankProject()); setMode("source"); setMoreMenu(false); setError(""); }

  function renderPanel() {
    if (mode === "source") return <section className="panel-section"><div className="section-no">01</div><h1>SOURCE</h1><p>Choose the view to visualize.</p>
      <button className="source-handoff" onClick={() => fileInput.current.click()}><span>FROM SHAPE IT</span><small>USE A CAPTURE OR SCREENSHOT</small></button><button className="primary" onClick={() => fileInput.current.click()}>UPLOAD IMAGE</button>
      <div className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files[0]); }}>OR DROP AN IMAGE HERE</div>
      {project.source && <div className="source-file"><img src={project.source.dataUrl} alt="Source thumbnail"/><span><b>ACTIVE SOURCE</b>{project.source.name}</span><button onClick={() => fileInput.current.click()}>REPLACE</button></div>}
      <button className="next" disabled={!project.source} onClick={() => setMode("scene")}>CONTINUE TO SCENE →</button></section>;
    if (mode === "scene") return <section className="panel-section"><div className="section-no">01</div><h1>SCENE</h1><p>Describe the place, light, and atmosphere.</p><label className="field-label" htmlFor="scene">DESCRIPTION</label><textarea id="scene" value={project.scene} onChange={(e) => setProject({ ...project, scene: e.target.value })} placeholder="Describe the landscape, light, material, and feeling…"/><div className="text-meta">{project.scene.length} CHARACTERS</div><button className="primary" onClick={() => setMode("render")}>CONTINUE TO RENDER →</button></section>;
    if (mode === "render") return <><section className="panel-section compact"><div className="section-no">01</div><h1>FRAME</h1><p>Preserve the source composition or choose an output frame.</p><div className="segments">{["source", "1:1", "4:3", "16:9"].map((f) => <button key={f} className={project.frame === f ? "active" : ""} onClick={() => setProject({ ...project, frame: f })}>{f.toUpperCase()}</button>)}</div></section>
      <section className="panel-section compact"><div className="section-no">02</div><h1>QUALITY</h1><div className="segments two">{["standard", "high"].map((q) => <button key={q} className={project.quality === q ? "active" : ""} onClick={() => setProject({ ...project, quality: q })}>{q.toUpperCase()}</button>)}</div></section>
      <section className="panel-section compact"><div className="section-no">03</div><h1>RENDER</h1><p>Generate a photorealistic visualization.</p><button className="primary render-button" disabled={rendering} onClick={runRender}>{rendering ? `RENDERING ${Math.round(progress)}%` : "RENDER SCENE"}</button>{rendering && <div className="progress"><i style={{ width: `${progress}%` }}/></div>}</section></>;
    return <><section className="panel-section compact"><div className="section-no">01</div><h1>RESULTS</h1><p>The newest visualization is shown in the workspace.</p>{currentResult && <dl className="metadata"><div><dt>RENDER</dt><dd>{String(currentResult.number).padStart(2, "0")}</dd></div><div><dt>FRAME</dt><dd>{currentResult.frame.toUpperCase()}</dd></div><div><dt>DATE</dt><dd>{new Date(currentResult.createdAt).toLocaleDateString()}</dd></div></dl>}</section>
      <section className="panel-section compact"><div className="section-no">02</div><h1>ITERATE</h1><button className="primary" onClick={runRender}>RENDER AGAIN</button><div className="paired"><button onClick={() => setMode("scene")}>REFINE</button><button onClick={() => setMode("scene")}>NEW SCENE</button></div></section>
      <section className="panel-section compact"><div className="section-no">03</div><h1>EXPORT</h1><div className="paired"><button onClick={() => downloadData(currentResult.dataUrl, `${project.name}-render-${currentResult.number}.jpg`)}>↓ JPEG</button><button onClick={() => downloadData(currentResult.dataUrl, `${project.name}-render-${currentResult.number}.png`)}>↓ PNG</button></div></section></>;
  }
  return <main className={`app ${menuOpen ? "menu-open" : "menu-closed"}`}><header className="app-bar"><button className="brand" onClick={() => setMenuOpen(true)}>SEE IT <span>(ON THE LAND)</span></button><div className="header-actions">
    <div className="popover-wrap"><button className="project-button" onClick={() => { setProjectMenu(!projectMenu); setMoreMenu(false); }}>{project.name} <span>⌄</span></button>{projectMenu && <div className="popover"><button onClick={saveProject}>SAVE PROJECT</button><button onClick={() => { const name = prompt("Project name", project.name); if (name?.trim()) setProject({ ...project, name: name.trim().toUpperCase() }); setProjectMenu(false); }}>RENAME</button><button onClick={() => loadInput.current.click()}>OPEN / LOAD</button></div>}</div>
    <div className="popover-wrap"><button className="more" aria-label="More options" onClick={() => { setMoreMenu(!moreMenu); setProjectMenu(false); }}>•••</button>{moreMenu && <div className="popover right"><button onClick={() => alert("SEE IT transforms an architectural source image into an atmospheric visualization while preserving the design.")}>WHAT IS THIS?</button><button onClick={resetProject}>RESET PROJECT</button></div>}</div></div></header>
    <aside className="side-panel"><nav>{MODES.map((m) => <button key={m} className={mode === m ? "active" : ""} disabled={(m !== "source" && !project.source) || (m === "results" && !project.results.length)} onClick={() => setMode(m)}>{m}</button>)}</nav><div className="panel-scroll">{renderPanel()}{error && <div className="error" role="alert">{error}</div>}</div><button className="collapse" onClick={() => setMenuOpen(false)}>← HIDE MENU</button></aside>
    {!menuOpen && <button className="reopen" onClick={() => setMenuOpen(true)}>MENU →</button>}
    <section className="workspace" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files[0]); }}>{workspaceImage ? <div className={`image-stage ${rendering ? "is-rendering" : ""}`}><img src={workspaceImage} alt={currentResult ? "Current architectural visualization" : "Architectural source"}/>{rendering && <div className="render-status"><span>RENDERING SCENE</span><b>{Math.round(progress)}%</b></div>}</div> : <div className="empty"><span>01</span><p>Begin with an architectural view.</p><button onClick={() => fileInput.current.click()}>ADD SOURCE IMAGE</button></div>}
      {project.results.length > 0 && <div className="filmstrip"><span>HISTORY</span>{project.results.map((r) => <button key={r.id} className={r.id === project.currentResultId ? "active" : ""} onClick={() => { setProject({ ...project, currentResultId: r.id }); setMode("results"); }}><img src={r.dataUrl} alt={`Render ${r.number}`}/><i>{String(r.number).padStart(2, "0")}</i></button>)}</div>}</section>
    <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => acceptFile(e.target.files[0])}/><input ref={loadInput} hidden type="file" accept="application/json,.json" onChange={(e) => loadProject(e.target.files[0])}/></main>;
}
