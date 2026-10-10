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
  index.html               Static shell: <main id="main">, one <h1>, skip link, canonical, noscript/WebGL fallback
  package.json             private; scripts: dev, build, test, check:assets, qa, prepare:car
  vite.config.ts           base './'; injects canonical from ../_config.yml url + baseurl (+ SITE_BASEURL override)
  src/
    main.tsx               mounts <App/>; detects WebGL2, else shows fallback
    App.tsx                <Canvas> + HUD overlay; Suspense with <Loader/>
    state.ts               zustand store: view, selection, audio, quality
    scene/Garage.tsx       floor, walls, roller door, props, hanging tubes
    scene/Lighting.tsx     key/rim/fill lights, strip-light Environment via drei Lightformers
    scene/Effects.tsx      N8AO, bloom, vignette, noise, tone mapping; quality-scaled
    scene/materials.ts     canvas-generated concrete/metal textures (seeded noise)
    car/Car.tsx            useGLTF (meshopt + KTX2), paint upgrade, hood hinge animation
    car/manifest.ts        node-name → role map and validation
    car/shots.ts           camera shots (position, target, fov) in car-local space
    car/hotspots.ts        car hotspot definitions and content ids
    engine/P60B40.tsx      code-built V8 and engine bay tub
    engine/parts.ts        engine part content: facts, sources, accuracy badges
    content/types.ts       shared Fact/Source/Badge types
    content/car.ts         car hotspot content (real car vs. in the game)
    ui/Hotspot.tsx         drei <Html> button anchored to a 3D point
    ui/InfoPanel.tsx       panel with "Real car" / "In the game" tabs, badges, sources
    ui/Hud.tsx             title, breadcrumbs, audio controls, back link, credits/disclaimer
    ui/Loader.tsx          progress + facts while loading
    ui/hud.css             MW-inspired original styling
    audio/ambience.ts      Web Audio graph: room tone, tube hum, traffic, pad
    audio/schedule.ts      pure parameter schedules (testable)
    audio/sfx.ts           synthesized hood clunk and UI ticks
    audio/ownTrack.ts      local file playback via object URL
  public/models/m3-gtr.glb processed model, committed, ≤ 12 MB
  tools/prepare-car.py     headless Blender: normalize, split/rename, hinge, export
  tools/car-map.json       source object name patterns → roles
  tools/compress.mjs       gltf-transform: dedup, prune, weld, meshopt, KTX2 (WebP fallback), resize ≤ 2048
  tools/check-assets.mjs   asserts roles, size, triangle budget
  tools/install-ktx.sh     fetches KTX-Software CLI into tools/bin (one-time, only for re-processing)
  tests/smoke.spec.ts      Playwright (local only)
  assets-src/              raw Sketchfab download (gitignored)
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
| `Body` | painted body shell (livery material) |
| `Hood` | hood panel; origin at the hinge line, rotation about local X opens it |
| `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR` | wheel groups |
| `Glass` | all glazing |
| `EngineBay` | empty marking where the engine sits (origin = crank centerline at the front axle plane, after normalization) |

Normalization: meters, +Y up, car facing +Z, wheels on y = 0, centered on x = 0. Everything else is optional and passed through. If the source has no separate hood, `prepare-car.py` separates body faces inside the hood region (a box above the front fenders, ahead of the windshield base, upward-facing normals) and reports it for visual review.

### 4.3 Paint and materials

- Body: `MeshPhysicalMaterial` keeping the livery base-color map, metalness about 0.5, roughness about 0.35, clearcoat 1, clearcoat roughness about 0.04. Values live in one `paint` config object.
- Glass: low-roughness physical material with slight tint; no transmission (cost).
- Tires, rims, and trim keep source materials, with roughness clamped to sensible ranges.

### 4.4 Engine and bay

- The model is expected to have no engine bay, so `P60B40.tsx` also builds a dark bay tub (inner fenders, firewall, radiator face, strut brace) that hides the cavity.
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
- Lights: two to three hanging fluorescent tubes (emissive, bloom), one flickering on a seeded schedule; warm amber key spot with shadows; cool teal fill; strip Lightformers in the environment so the paint shows long highlights.
- Atmosphere: exponential fog, faint dust motes, and a grade with teal shadows and amber highlights via tone mapping plus a color-grading pass.
- Quality tiers: `high` (desktop default) and `low` (coarse pointer or small screen, or measured frame time over 28 ms for 2 s). `low` caps DPR at 1.5, disables AO and reflector blur, and halves shadow-map size.

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

1. Owner downloads the glTF zip from Sketchfab (account required) into `garage/assets-src/`.
2. `npm run prepare:car` runs `blender -b --python tools/prepare-car.py -- assets-src/<file> tmp.glb`: normalize, map names via `car-map.json`, split hood if needed, set hinge pivot, add `EngineBay` empty, export.
3. `tools/compress.mjs`: dedup, prune, weld, resize textures to ≤ 2048, KTX2 (ETC1S for color, UASTC for normal maps) when `tools/bin/ktx` exists, else WebP; meshopt geometry compression.
4. `tools/check-assets.mjs` validates the contract in §4.2, size ≤ 12 MB, and ≤ 150k triangles.
5. Commit `public/models/m3-gtr.glb` and update `CREDITS.md`.

Runtime decoders: `MeshoptDecoder` and `KTX2Loader` with the Basis transcoder (WASM), served from the build output so no CDN is needed.

## 7. Performance budgets

- Initial JavaScript ≤ 450 KB gzip; model ≤ 12 MB; first meaningful frame under 5 s on a 20 Mbps connection.
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
- **Phase 2, "Under the skin":** Rust crate `garage/crates/p60-audio` compiled to WASM and run in an AudioWorklet: real-time flat-plane V8 synthesis using the real firing order, rev control in the bay; Rust-computed piston and crank kinematics driving an animated exploded engine view; photo mode.
- **Phase 3, "Out of the garage":** Rapier (Rust to WASM) raycast vehicle; roll out to a small night lot; engine audio driven by physics rpm; speedometer and nitrous; evaluate the WebGPU renderer.

## 10. Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Model lacks a separate hood | Region-based split in `prepare-car.py`, reviewed by screenshot; if the seam is ugly, hide the source hood faces and build a hood panel in code that matches the livery |
| No engine bay or visible gaps under the hood | Code-built bay tub (§4.4) |
| Livery texture blurry up close | Upscale the hood and side regions or repaint with a projected livery texture in Blender; a follow-up task only if screenshots show it |
| Model provenance challenged | Model is one file behind a manifest; swap to another model without code changes |
| KTX-Software unavailable | WebP textures via gltf-transform (larger VRAM, same visuals) |
| Headless WebGL in CI is slow and flaky | Playwright runs locally only; CI relies on unit, asset, and site checks |
| CI time grows | npm cache; the garage build is about a minute |

## 11. Credits and disclaimer

- Model: "BMW M3 E46 GTR" by Flamestroke, <https://sketchfab.com/3d-models/bmw-m3-e46-gtr-7a0e538dd533481da79a6dcc0fc05213>, licensed CC BY 4.0 (<https://creativecommons.org/licenses/by/4.0/>). Modifications: rescaled, re-centered, hood separated, materials adjusted, compressed.
- Everything else (garage, engine, audio, UI) is original to this project.
- *Need for Speed* and *Most Wanted* are trademarks of Electronic Arts. BMW and M3 are trademarks of BMW AG. This project is not affiliated with or endorsed by either.
