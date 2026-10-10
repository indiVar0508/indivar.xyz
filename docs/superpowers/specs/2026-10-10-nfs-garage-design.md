# NFS Most Wanted Garage — Phase 1 design

Status: approved in conversation on 2026-10-10; this document awaits written-spec review.
Owner: Indivar Mishra. Lives at `indivar.xyz/garage/`, built from `garage/` in this repository.

## 1. Intent

Indivar wants a browser-based 3D garage inspired by *Need for Speed: Most Wanted* (2005), starting with the game's hero car, the BMW M3 GTR (E46) in its blue-and-silver livery. Phase 1 must look realistic and polished, let visitors inspect the car through hotspots, open the hood, and learn accurate facts about the real engine. It is an unofficial, non-commercial fan project on his portfolio, built the same way as his `threat-level-midnight` fan game: original art and audio, a clear disclaimer, React Three Fiber, with Rust compiled to WebAssembly where it does real work.

**Success means:** a visitor lands on `/garage/`, sees a convincing M3 GTR in a moody garage within a few seconds, can orbit it, click hotspots, pop the hood, and read sourced facts about the P60B40 V8, on desktop and phone, without errors. The portfolio build and link checks still pass.

### What the owner asked for vs. what this design does

| Asked | Design | Why |
| --- | --- | --- |
| NFS MW garage/menu music | Original synthesized ambience plus a local "play my own track" file picker | The soundtrack belongs to EA and licensed artists; a public site cannot redistribute it. Same approach as `threat-level-midnight`. |
| Car model like the attached LibertyCity image | Sketchfab model *BMW M3 E46 GTR* by Flamestroke, CC BY 4.0 | The image is a GTA V mod. Several Sketchfab M3 GTRs state they were ripped from the game, so their CC labels are void. Flamestroke's model has a varied, license-conscious upload history and no rip claim. |
| "4.0L P65 V8" | P60B40 | Wikipedia and BMW Group Classic identify the engine as the P60B40. "P65" likely conflates it with the later S65 street V8. |
| Supercharger/turbo elements | Shown only under a "game lore" badge | The real P60B40 is naturally aspirated; forced induction exists only as a game upgrade. |
| Livery recreated by Claude | Keep the model's painted livery; upgrade the paint material | The chosen model already carries the livery. Repaint only if it fails close inspection (see §10). |
| "Entirely in WebAssembly" | WASM where it earns its place | Phase 1: meshopt and Basis/KTX2 decoders. Phase 2: own Rust crate for engine audio. Phase 3: Rapier physics. |

## 2. Decisions

| Decision | Choice | Alternatives rejected |
| --- | --- | --- |
| Model source | Sketchfab CC-BY, Flamestroke, uid `7a0e538dd533481da79a6dcc0fc05213` | Buying a commercial model (cost, purchase step); building the car in code (not realistic) |
| Hosting | `garage/` subfolder, served at `indivar.xyz/garage/`, built in the existing Pages workflow | Separate repo on Vercel; local only |
| Stack | React 19, React Three Fiber 9, drei 10, `@react-three/postprocessing` 3, zustand 5, TypeScript, Vite 8, Vitest | Vanilla three.js (more hand-written UI); Bevy to WASM (large download, weaker realism for the effort) |
| Garage environment | Built entirely in code, no HDRI or scanned assets | HDRI downloads (extra asset licensing and weight) |
| Engine | Built in code at proportions derived from verified bore and stroke | No downloadable P60B40 model exists |
| Portfolio | Featured project row linking to `/garage/` | /work/ only |

## 3. Non-goals for Phase 1

Driving or physics, engine sound synthesis, the project's own Rust crate, livery or color editor, exploded engine animation, photo mode, WebGPU, multiplayer, a sitemap entry for `/garage/`, and any EA audio, logos, fonts, or UI art.

## 4. Architecture

```
garage/
  index.html               Static shell: <main id="main">, one <h1>, skip link, canonical, noscript, credits footer
  package.json             private; scripts: dev, build, test, check:assets, check:bundle, qa, prepare:car
  vite.config.ts           base './'; Vitest config
  build/siteUrl.ts         canonical URL from ../_config.yml url + baseurl (+ SITE_BASEURL override)
  build/garagePlugin.ts    injects the canonical; serves and emits the Basis transcoder at basis/
  src/
    main.tsx               mounts <App/> or the WebGL 2 fallback; binds audio; exposes the store under ?qa
    App.tsx                <Canvas> + <Hud/> + <Loader/>
    qa.ts, webgl.ts        ?qa / ?quality= flags; WebGL 2 detection
    math.ts, random.ts     Vec3 helpers; seeded PRNG
    state/view.ts          view state machine (pure reducer)
    state/quality.ts       quality tiers and the frame-time window
    state/store.ts         zustand store: view, quality, reduced motion, ready, sound, own track
    content/               types, sources, car and engine topics, validator, loader facts
    car/manifest.ts        asset contract (shared with tools/check-assets.ts)
    car/Car.tsx            GLTFLoader (meshopt + KTX2), prepareCar, hood hinge animation
    car/prepareCar.ts      contract check, paint/glass/primer upgrade, anchors from markers
    car/paint.ts, hood.ts  material configs; hood angle and easing
    car/loaders.ts         one KTX2Loader per page
    car/shots.ts           camera shots, car solids, hood profile, engine shots, portrait FOV
    car/hotspots.ts        car hotspot positions and normals
    engine/geometry.ts     P60B40 figures and cylinder layout
    engine/anchors.ts      engine hotspot anchors, bay box, radiator
    engine/P60B40.tsx      code-built V8 with highlightable parts
    engine/Bay.tsx         the bay tub the source model lacks
    scene/Scene.tsx        composes lights, garage, car, engine, hotspots, effects
    scene/Garage.tsx       floor, walls, roller door, props, hanging tubes
    scene/props.tsx        workbench, tool chest, tyres, drums, shelf, roller door, corrugated wall, tubes
    scene/textures.ts      seeded concrete and grime DataTextures
    scene/layout.ts        room size and tube positions
    scene/flicker.ts       seeded tube flicker
    scene/Lighting.tsx     key and rim spots, strip-light Environment via drei Lightformers
    scene/Effects.tsx      bloom, AgX tone mapping, split tone, vignette, noise; quality-scaled
    scene/splitTone.ts     teal/amber grade effect
    scene/CameraRig.tsx    flies to each shot; idle drift (scene/drift.ts)
    scene/FrameMonitor.tsx drops to low quality on sustained slow frames
    scene/ReadySignal.tsx  marks the garage ready for the loader, HUD and tests
    ui/Hotspot.tsx         drei <Html> button anchored to a 3D point, faded by facing
    ui/CarHotspots.tsx     the six car hotspots
    ui/InfoPanel.tsx       panel with "Real car" / "In the game" tabs, badges, sources
    ui/Hud.tsx             breadcrumbs, hood button, sound controls, hint, Esc
    ui/SoundControls.tsx   sound toggle and "Play my own track"
    ui/Loader.tsx          progress + verified facts while loading
    ui/topicFor.ts, facing.ts  view → topic and breadcrumbs; hotspot facing
    ui/base.css, hud.css   MW-inspired original styling
    audio/ambience.ts      Web Audio graph: room tone, tube hum, traffic, pad
    audio/schedule.ts      pure parameter schedules (testable)
    audio/noise.ts         brown noise and reverb impulse
    audio/sfx.ts           synthesized hood clunk and UI ticks
    audio/controller.ts    AudioContext owner; local own-track playback via object URL
    audio/prefs.ts, bindings.ts  remembered sound preference; store → audio wiring
  public/models/m3-gtr.glb processed model, committed, ≤ 12 MB
  tools/prepare-car.ts     orchestrates Blender, glTF-Transform ETC1S (KTX2) and meshopt, then the asset check
  tools/blender/prepare_car.py  headless Blender: normalize, rename, roles, hinge, markers, report
  tools/car-map.json       source mesh names → roles and names
  tools/check-assets.ts    asserts the contract, size and triangle budget
  tools/check-bundle.ts    asserts the JavaScript gzip budget
  tools/install-ktx.sh     pins and checksums KTX-Software 4.4.2 into tools/bin (only for re-processing)
  tools/shot.ts            Playwright screenshots of any sequence of views
  tests/smoke.spec.ts      Playwright smoke tests (local only)
  assets-src/              raw Sketchfab download and prepare-report.json (gitignored)
  CREDITS.md               model attribution and license
```

### 4.1 View state machine

```
showroom ──click car hotspot──▶ focus(id) ──Esc/back──▶ showroom
showroom ──click hood──▶ bay ──click part──▶ bay-part(id) ──Esc/back──▶ bay ──Esc/close hood──▶ showroom
```

- `showroom`: camera drifts slowly around the car (disabled under `prefers-reduced-motion`); user orbit allowed; car hotspots visible.
- `focus(id)`: camera tweens to the hotspot's shot; panel open; other hotspots dimmed.
- `bay`: hood animates open about its hinge (about 0.6 s, eased, about 50°); camera moves to the engine bay shot; car hotspots hidden, engine hotspots shown.
- `bay-part(id)`: camera frames the part; panel open.
- Any user orbit stops the drift until the next return to `showroom`.

### 4.2 Car asset contract

The processed `m3-gtr.glb` must contain these nodes (validated by `tools/check-assets.mjs` and at runtime by `manifest.ts`):

| Node | Role |
| --- | --- |
| `Body` | group of every non-hood mesh; painted meshes carry `extras.role = "paint"` |
| `Hood` | group whose origin is the hinge line; rotating about local X opens it |
| `Glass` | glazing mesh |
| `Marker_Wheel_FL`, `_FR`, `_RL`, `_RR` | empties at wheel centers (anchors for hotspots and camera shots) |
| `Marker_EngineBay` | empty at the floor of the empty engine bay, on the centerline |

Normalization: meters, +Y up, car facing +Z, tyres touching y = 0, centered on x = 0, overall length scaled to 4.49 m. Everything else is passed through.

**Source model findings (inspected 2026-10-10):** the Sketchfab glTF is 30 meshes split by material, not by part, with base-color textures only (no roughness or normal maps); about 117k triangles and 8 MB. The hood is already a separate mesh (`blinn8`) with vent cutouts; its louvre inserts (`aw`, `sd`, `lambert15`) sit inside its outline and move with it. Opening it about its rear edge works cleanly and reveals an empty bay (floor pan and open wheel wells), which confirms §4.4. The four wheels are merged into shared rim, tyre, disc, and caliper meshes, so Phase 1 adds wheel-center markers instead of splitting geometry; splitting moves to Phase 3, where wheels must spin. Painted panels are `blinn3`, `blinn8`, `blinn9`, `blinn10`, `blinn12` (silver mirrors and trim), `blinn13`, `blinn14`, `blinn18`. The source poses the front-right wheel steered about 35°, so the car's X bounds are lopsided (-1.07 to 0.93 m); markers sit at the true wheel centers. Glass (`wind`) is opaque black and becomes dark tinted glass. The hood's underside shows the livery texture, so the runtime renders its back faces with a dark primer material.

### 4.3 Paint and materials

- Body: `MeshPhysicalMaterial` keeping the livery base-color map, metalness about 0.5, roughness about 0.35, clearcoat 1, clearcoat roughness about 0.04. Values live in one `paint` config object.
- Glass: low-roughness physical material with slight tint; no transmission (cost).
- Tires, rims, and trim keep source materials, with roughness clamped to sensible ranges.

### 4.4 Engine and bay

- The model has no engine bay, so `Bay.tsx` builds a dark bay tub (inner fenders, firewall, radiator face, strut towers) that hides the cavity. The hood's edges fall from 0.79 m at the hinge to 0.62 m near the nose and the nose is only ±0.43 m wide at the radiator, so the walls stop at 0.60 m and z 1.8 m and the radiator is ±0.38 m wide; anything larger shows through the closed hood's seams.
- The E46 hood wraps down over the nose, so the open hood's lip hangs 0.38 m below its hinge line. The camera's hood-clearance check models the measured centreline profile, not a flat panel.
- V8: two banks at 90°, four cylinders each. Cylinder geometry derives from bore 94 mm and stroke 72 mm; block length, head size, and accessories are illustrative and scaled to fit the bay. Parts: block, two heads with cam covers, intake plenum with two restrictor inlets, airbox, runners, fuel rails, headers, dry-sump tank and lines, crank pulley. Materials: cast aluminium, machined aluminium, black crinkle paint, carbon, braided hose.
- Each hotspot part is its own group so it can be framed and highlighted (emissive rim on hover).

### 4.5 Content model

```ts
type Badge = 'verified' | 'illustrative' | 'game-lore';
type Source = { label: string; url: string };
type Fact = { text: string; badge: Badge; sources: Source[] };
type Topic = { id: string; title: string; summary: string; real: Fact[]; game: Fact[] };
```

Rule (enforced by a test): every `verified` fact has at least one source; `game-lore` facts cite a game source; `illustrative` facts may omit sources and display "Illustrative".

Engine topics and the verified facts they will carry:

| Topic | Facts |
| --- | --- |
| V8 layout | Naturally aspirated 90° V8; 3,997 cc; bore 94 mm × stroke 72 mm (oversquare, favors high rpm); front-mounted longitudinally |
| Cylinder heads | DOHC, four valves per cylinder; aluminium block and heads; 12.0:1 compression (Wikipedia; another source lists 11:1, shown as a range note) |
| Crankshaft | Flat-plane, five main bearings; firing order 1-8-3-6-4-5-2-7 |
| Intake restrictors | Two 30.4 mm restrictors in race trim: 444 bhp at 7,500 rpm; about 650–700 bhp unrestricted; the road car was rated 380 bhp |
| Dry sump | Dry-sump lubrication, water-cooled (verified); why race engines use a dry sump (lower mounting, no oil starvation in corners) is a general explanation marked illustrative |
| Fuel | Multi-port fuel injection |
| Exhaust headers | Illustrative only |
| Game lore | NFS MW performance upgrades, including forced induction, are game fiction |

Car hotspot topics: hood (enters bay), front splitter, rear wing, wheels and brakes, and livery story (the player's car at the start of the game, sabotaged, won back by beating Razor, Blacklist #1). Real-car facts for these are researched during implementation and follow the same badge rule; anything unverifiable is labeled illustrative or dropped.

Primary sources so far: [Wikipedia: BMW P60B40](https://en.wikipedia.org/wiki/BMW_P60B40), [BMW Group Classic: M3 GTR (E46)](https://www.bmwgroup-classic.com/en/models/bmw-classics/product-description-page.ad-900-1.bmw-m3-gtr-e46.html), [Encycarpedia: M3 GTR Strassenversion](https://www.encycarpedia.com/bmw/01-m3-gtr-e46-strassenversion-coupe). Wikipedia's own citations are weak (forums, almanac scans), so conflicting figures are shown as ranges rather than single numbers.

### 4.6 Garage look

- Floor: polished concrete with seeded canvas-generated albedo, roughness, and stain maps; drei `MeshReflectorMaterial` for soft, blurred reflections (lower resolution on low quality).
- Walls and props built from primitives with generated textures: corrugated panels, roller door behind the car, workbench, tool chest, tire stack, oil drums, extension cable, parts shelf.
- Lights: four hanging fluorescent tubes (emissive, bloom, each with a point light), one flickering on a seeded schedule; warm key spot with shadows; cool teal fill; strip Lightformers in the environment so the paint shows long highlights. RectAreaLights were dropped: their lookup tables cost about 100 KB gzip.
- Atmosphere: exponential fog, faint dust motes, and a grade with teal shadows and amber highlights via tone mapping plus a color-grading pass.
- Quality tiers: `high` (desktop default) and `low` (coarse pointer or small screen, or measured frame time over 28 ms for 2 s). `low` caps DPR at 1.5, disables multisampling, noise and reflector blur. Ambient occlusion (N8AO) was dropped from both tiers: about 75 KB gzip for under 1/255 average pixel change in this dark scene with contact shadows.

### 4.7 Audio

- Muted until the user turns sound on (autoplay policy). Remember the choice in `localStorage` (try/catch).
- Ambience graph: filtered brown noise room tone; 100 Hz mains hum with harmonics on the tube lights; low-passed noise swells for distant traffic; a slow minor-key pad (two detuned oscillators, slow filter LFO) with original chord movement and no melody quoted from any game.
- SFX: hood latch clunk (noise burst through a resonant low-pass), soft UI ticks.
- "Play my own track": `<input type="file" accept="audio/*">`; the file plays from an object URL, is never uploaded or stored, and ducks the ambience.

### 4.8 HUD and accessibility

- Original styling: Saira Condensed via `@fontsource` (bundled; no external font requests), italic headings, angled translucent dark panels, blue and silver accents from the livery, small mono captions.
- The `<h1>` is the HUD title "BMW M3 GTR · E46". Hotspots are `<button>`s with accessible names; Tab moves through them; Enter opens; Esc goes back one level.
- Footer: "Unofficial, non-commercial fan project. Not affiliated with or endorsed by Electronic Arts or BMW." plus the CC-BY credit and a link back to indivar.xyz.
- If WebGL2 is missing, the page shows a static explanation and links back.

## 5. Site integration

| File | Change |
| --- | --- |
| `_config.yml` | add `garage` to `exclude` |
| `.gitignore` | add `garage/node_modules/`, `garage/dist/`, `garage/assets-src/`, `garage/tools/bin/`, `garage/test-results/` |
| `scripts/build-site.sh` | new: build garage, build Jekyll, copy `garage/dist` to `_site/garage`, run `test_site.rb`; used by CI and locally; accepts the same output dir and baseurl arguments as `test_site.rb` |
| `.github/workflows/pages.yml` | set up Node 24 with npm cache on `garage/package-lock.json`; `npm ci` and `npm test` in `garage/`; call `scripts/build-site.sh` |
| `test_site.rb` | require `garage/index.html` |
| `_includes/project-row.html` | pass internal URLs (no scheme) through `relative_url` |
| `_data/projects.yml` | add a featured "Most Wanted Garage" entry, URL `/garage/` |
| `README.md` | short "Garage" section: dev server, model re-processing, credits |

The garage `index.html` satisfies `test_site.rb` as-is: exactly one `<h1>`, `href="#main"` skip link with a matching `id="main"`, canonical `https://indivar.xyz/garage/` (or the preview baseurl), relative asset links that resolve inside `_site/garage/`, and no Liquid delimiters.

## 6. Asset pipeline

1. Owner downloads the glTF zip from Sketchfab (account required) into `garage/assets-src/` and unzips it into `assets-src/model/`.
2. `tools/install-ktx.sh` (once) installs KTX-Software 4.4.2, pinned and checksummed.
3. `npm run prepare:car` runs `blender -b --python tools/blender/prepare_car.py`: normalize, rename via `car-map.json`, tag paint roles, set the hood hinge, add markers, write `assets-src/prepare-report.json`, export. It then runs `gltf-transform etc1s` (KTX2) and `gltf-transform meshopt`, and finally the asset check.
4. `tools/check-assets.ts` validates the contract in §4.2, size ≤ 12 MB, and ≤ 150k triangles. `npm test` runs it in CI.
5. Commit `public/models/m3-gtr.glb` (2.8 MB, 116,360 triangles, 18 KTX2 textures) and keep `CREDITS.md` current.

Runtime decoders: `MeshoptDecoder` and `KTX2Loader` with the Basis transcoder (WASM), served from the build output so no CDN is needed.

## 7. Performance budgets

- Initial JavaScript ≤ 450 KB gzip; model ≤ 12 MB; first meaningful frame under 5 s on a 20 Mbps connection. `tools/check-bundle.ts` sums every JS file in `dist/assets`, which includes an unused hashed copy of the Basis transcoder wrapper (15 KB) that three's KTX2Loader emits; the Phase 1 total is about 436 KB.
- 60 fps on the owner's RTX 4060 laptop at `high`; ≥ 30 fps on a mid-range phone at `low`.
- No per-frame allocations in hotspot projection or the camera rig.

## 8. Testing

- **Vitest** (CI):
  - Content: every `verified` fact has a source; topic ids match hotspot ids; no empty strings.
  - Manifest: missing roles are reported by name.
  - Shots: every camera position lies outside the car's bounding box and above the floor.
  - Audio schedules: pure functions produce bounded, monotonic ramps.
  - Quality: tier selection from inputs.
- **Asset check** (CI): `tools/check-assets.mjs` against the committed glb.
- **Site check** (CI): `scripts/build-site.sh` runs `test_site.rb` over the combined `_site`, plus the `/preview` baseurl variant locally.
- **Playwright smoke** (local, `npm run qa`): loads `/garage/`; canvas is not blank (pixel variance); Tab reaches a hotspot; opening the hood shows engine hotspots; Esc returns to showroom; no console errors; screenshots saved for review at desktop and phone sizes.

## 9. Roadmap

- **Phase 1 (this spec):** garage, hero car, hotspots, opening hood, P60B40 breakdown, synthesized ambience, site integration.
- **Phase 2, "Under the skin":** starts with a research task the owner asked for: how best to show the engine running (cutaway vs. exploded view, crank, piston, and valve-timing animation, airflow and firing-order visualization, synchronized sound), with references. Then: Rust crate `garage/crates/p60-audio` compiled to WASM and run in an AudioWorklet: real-time flat-plane V8 synthesis using the real firing order, rev control in the bay; Rust-computed piston and crank kinematics driving an animated exploded engine view; photo mode.
- **Phase 3, "Out of the garage":** Rapier (Rust to WASM) raycast vehicle; roll out to a small night lot; engine audio driven by physics rpm; speedometer and nitrous; evaluate the WebGPU renderer.

## 10. Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Model lacks a separate hood | Resolved: the source hood is its own mesh (§4.2) |
| No engine bay or visible gaps under the hood | Code-built bay tub (§4.4) |
| Livery texture blurry up close | Upscale the hood and side regions or repaint with a projected livery texture in Blender; a follow-up task only if screenshots show it |
| Model provenance challenged | Model is one file behind a manifest; swap to another model without code changes |
| KTX-Software unavailable | Resolved: `tools/install-ktx.sh` pins and checksums KTX-Software 4.4.2 |
| Headless WebGL in CI is slow and flaky | Playwright runs locally only, on the full Chromium build with the real GPU (the headless shell falls back to SwiftShader); CI relies on unit, asset, and site checks |
| CI time grows | npm cache; the garage build is about a minute |

## 11. Credits and disclaimer

- Model credit, shown in the garage footer, `garage/CREDITS.md`, and the README: This work is based on "BMW M3 E46 GTR" (<https://sketchfab.com/3d-models/bmw-m3-e46-gtr-7a0e538dd533481da79a6dcc0fc05213>) by Flamestroke (<https://sketchfab.com/Flamestroke>), licensed under CC-BY-4.0 (<http://creativecommons.org/licenses/by/4.0/>). Modifications: rescaled, re-centered, regrouped, hood pivot set, materials adjusted, compressed.
- Everything else (garage, engine, audio, UI) is original to this project.
- *Need for Speed* and *Most Wanted* are trademarks of Electronic Arts. BMW and M3 are trademarks of BMW AG. This project is not affiliated with or endorsed by either.
