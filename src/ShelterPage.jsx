import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import modelUrl from "./assets/lavacrete-200.glb?url";
import exteriorUrl from "./assets/lavacrete-312.png";
import nightUrl from "./assets/lavacrete-atmosphere-night.png";
import atmosphereUrl from "./assets/lavacrete-atmosphere.png";
import interiorUrl from "./assets/re-corner.png";
import SiteFooter from "./SiteFooter.jsx";

const builds = {
  "the-four-walls": { number: "S—01", name: "The Four Walls", area: "200 sq ft", rooms: "Studio / 1 bath", footprint: "14′ × 18′", occupancy: "1–2 people", wall: "18–24 in", duration: "4–7 months", cost: "$45–75k", description: "Four walls, one quiet room, made from the ground beneath it. The Four Walls is the smallest complete shelter in the collection—a place to begin, retreat, work or stay." },
  "the-courtyard": { number: "S—02", name: "The Courtyard", area: "600 sq ft", rooms: "3 volumes + courtyards", footprint: "Site-adapted cluster", occupancy: "1–3 people", wall: "18–24 in", duration: "7–11 months", cost: "$95–145k", description: "Three Four Walls volumes come together around protected outdoor rooms. The Courtyard makes 600 square feet of interior shelter—and a much larger place to live through the useful space held between its walls." },
  "the-long-house": { number: "S—03", name: "The Long House", area: "1,000 sq ft", rooms: "4–6+ volumes", footprint: "Site-adapted linear arrangement", occupancy: "2–4 people", wall: "18–24 in", duration: "10–15 months", cost: "$140–210k", description: "Four Walls volumes repeat along a narrow site, opening and closing as they go. The Long House moves between enclosed rooms and the courts, passages and pauses created in the voids between them." },
};

function ModelViewer() {
  const mount = useRef(null);
  const controlsRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const el = mount.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb8b2a6);
    scene.fog = new THREE.Fog(0xb8b2a6, 17, 34);
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
    camera.position.set(17, 10, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true; controls.dampingFactor = .055;
    controls.target.set(0, 1.7, 0); controls.minDistance = 10; controls.maxDistance = 32;
    controls.minPolarAngle = .55; controls.maxPolarAngle = 1.48;
    scene.add(new THREE.HemisphereLight(0xe9e2d3, 0x514a3e, 2.3));
    const sun = new THREE.DirectionalLight(0xffe3bd, 4.6);
    sun.position.set(-7, 11, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(36, 64), new THREE.MeshStandardMaterial({ color: 0x8e897e, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    let loadedModel;
    new GLTFLoader().load(modelUrl, (gltf) => {
      loadedModel = gltf.scene;
      loadedModel.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(loadedModel), size = box.getSize(new THREE.Vector3());
      loadedModel.scale.setScalar(8.3 / Math.max(size.x, size.z)); loadedModel.updateMatrixWorld(true);
      const fitted = new THREE.Box3().setFromObject(loadedModel), center = fitted.getCenter(new THREE.Vector3());
      loadedModel.position.set(-center.x, -fitted.min.y, -center.z); scene.add(loadedModel); setLoaded(true);
    });
    const resize = () => { const w=el.clientWidth,h=el.clientHeight; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize(); let raf;
    const draw = () => { controls.update(); renderer.render(scene,camera); raf=requestAnimationFrame(draw); }; draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);
  const reset = () => { const c=controlsRef.current; if (!c) return; c.object.position.set(17,10,20); c.target.set(0,1.7,0); c.update(); };
  return <div className="model-wrap" ref={mount}><span className={`model-status ${loaded ? "ready" : ""}`}>{loaded ? "Drag to explore · Scroll to zoom" : "Loading model…"}</span><button onClick={reset}>Reset view</button></div>;
}

const specsFor = b => [["Interior area",b.area],["Footprint",b.footprint],["Program",b.rooms],["Occupancy",b.occupancy],["Wall system","Rammed earth / lavacrete"],["Wall thickness",b.wall],["Foundation","Site-adapted slab"],["Roof","Low-slope shed roof"],["Typical build",b.duration],["Indicative cost",b.cost+"*"],["Plan version","1.0 / August 2026"],["Skill level","Ambitious owner-builder"]];

function ShelterPage() {
  const requestedSlug = location.pathname.split("/").filter(Boolean).pop();
  const slug = requestedSlug === "the-room" ? "the-four-walls" : requestedSlug;
  const build = builds[slug] || builds["the-four-walls"];
  const related = Object.entries(builds).filter(([key]) => key !== slug).slice(0,2);
  return <main className="shelter-page">
    <header className="nav detail-nav"><a className="wordmark" href="/">shelter&nbsp;&nbsp;&nbsp;on the&nbsp;&nbsp;land</a><nav><a href="/#practice">Practice</a><a href="/#shelters">Shelters</a><a href="/#process">Process</a><a href="/#about">About</a></nav><a className="nav-cta" href="#downloads">Get the plans ↘</a></header>
    <section className="model-hero" id="top"><ModelViewer/><div className="model-title"><p>{build.number} / Buildable shelter</p><h1>{build.name}</h1><span>{build.area}<br/>{build.rooms}</span></div><a className="model-down" href="#overview">Explore the shelter ↓</a></section>

    <section className="shelter-intro" id="overview"><p className="kicker">The idea</p><h2>{build.description}</h2><p>Designed as a legible set of spaces and assemblies, this shelter can be built with local mineral materials and adapted to the realities of a particular site.</p></section>

    <section className="specs"><header><p className="kicker">Building specifications</p><h2>Small by design.<br/>Complete by nature.</h2><p>*Conceptual construction range in 2026 USD, excluding land, utilities, professional fees and unusually difficult site work.</p></header><dl>{specsFor(build).map(([term,value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl></section>

    <section className="building-gallery"><figure className="gallery-wide"><img src={exteriorUrl} alt={`${build.name} exterior under a starry sky`}/><figcaption>01 / Exterior approach</figcaption></figure><div className="gallery-pair"><figure><img src={interiorUrl} alt="Earthen interior illuminated by afternoon sun"/><figcaption>02 / Light and thermal mass</figcaption></figure><figure><img src={nightUrl} alt={`${build.name} at night`}/><figcaption>03 / Shelter in the landscape</figcaption></figure></div><figure className="gallery-wide"><img src={atmosphereUrl} alt="Lavacrete shelter in desert fog"/><figcaption>04 / Monolithic material expression</figcaption></figure></section>

    <section className="plan-contents"><header><p className="kicker">The plan set</p><h2>Everything you need<br/>to find a place to start.</h2></header><div className="sheet-preview"><div className="sheet-plan"><span>A—101</span><svg viewBox="0 0 600 380"><rect x="105" y="50" width="390" height="280"/><path d="M105 225h150m86 105V225h154M255 225v105M341 225h154"/><circle cx="300" cy="190" r="110"/><path d="M60 350h480M80 360v-20m440 20v-20"/></svg><b>Dimensioned floor plan / Scale varies</b></div></div><ul>{["Dimensioned plans","Exterior elevations","Building sections","Foundation details","Wall and opening details","Roof assembly","Door + window schedule","Outline material quantities","Suggested build sequence","Digital reference model"].map((x,i)=><li key={x}><span>{String(i+1).padStart(2,"0")}</span>{x}</li>)}</ul></section>

    <section className="downloads" id="downloads"><p className="kicker">Downloads / Version 1.0</p><h2>Build from<br/>good information.</h2><div><a href="/downloads/shelter-plan-preview.svg" download><span>Sample plan sheet</span><small>SVG · Preview</small><b>↓</b></a><a href="/downloads/shelter-specifications.csv" download><span>Specifications</span><small>CSV · 2 KB</small><b>↓</b></a><a className="purchase" href="mailto:build@onthe.land?subject=Plan set enquiry"><span>Complete plan set</span><small>Enquire to purchase</small><b>↗</b></a></div></section>

    <section className="before-build"><p className="kicker">Before you build</p><h2>A plan is a foundation,<br/>not a permit.</h2><div><p>Every site brings its own soil, climate, wind, seismic conditions and code requirements. These plans are designed as a robust starting point and must be localized before construction.</p><p>Work with your local building department and, where required, a licensed architect or engineer. Material mixes should be tested using the earth and aggregates available near your site.</p></div></section>

    <section className="support"><p className="kicker">Adaptation + support</p><h2>Build it yourself.<br/>Don’t figure it out alone.</h2><p>We can help orient the building, adapt openings, review material choices and talk through the difficult moments of a natural build.</p><a href="/packages/">See the ways we can work together <span>↗</span></a></section>

    <section className="related"><p className="kicker">Other shelters</p><div>{related.map(([key,item])=><a href={`/shelters/${key}/`} key={key}><span>{item.number}</span><h3>{item.name}</h3><p>{item.area} / {item.rooms}</p><b>↗</b></a>)}</div></section>
    <SiteFooter/>
  </main>;
}

export default ShelterPage;
