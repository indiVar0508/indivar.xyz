# Garage: the P60B40 running

Follow-up to `2026-10-11-engine-and-radio-design.md`. The owner asked to "implement the next step", which the last
report named: the engine doesn't start or rev, and nothing shows it working. This is the first part of Phase 2
("Under the skin") in `2026-10-10-nfs-garage-design.md`: the engine's own Rust crate, compiled to WebAssembly, drives
both the sound and the moving parts.

## 1. What a visitor gets

- **Start the engine.** The starter cranks, the engine catches, flares and settles to idle. The engine shakes on its
  mounts, and twists against them when revved.
- **Hold to rev.** A button (or the R key) opens the throttle. Hold it and the engine runs up to the limiter and
  bounces off it. Let go and it falls back to idle, crackling on the overrun.
- **Tach:** engine speed, live, with the limiter zone marked.
- **Look inside.** The block, heads, airbox and covers turn to an x-ray, and the moving parts show through:
  - the flat-plane crank, eight rods and pistons;
  - four camshafts and 32 valves;
  - a flash in each cylinder as it fires.

  The motion is slowed 40× so each stroke can be followed, and a strip in the panel lights up the firing order as
  it goes.

The engine runs only with sound on: starting it turns sound on, and turning sound off stops it.

## 2. One engine model, in Rust

`garage/crates/p60` is a small Rust crate built for `wasm32-unknown-unknown` with plain C exports and no
wasm-bindgen. It is the single source of truth for the engine's timing:

- **Verified:** firing order 1-8-3-6-4-5-2-7, flat-plane crank, 90° V, 72 mm stroke, four valves per cylinder.
- **Derived:**
  - pins 1 and 4 share a phase, and pins 2 and 3 sit 180° from them;
  - pin *k* carries cylinders *k* and *k*+4;
  - the crank turns clockwise seen from the front;
  - a cylinder fires every 90°, alternating banks.
- **Illustrative** (no source gives them):
  - rod length 172 mm and valve timing (280° duration, lobe centres 105°, 12 mm lift);
  - idle at 1,500 rpm and the limiter at 8,500 rpm. Peak power is quoted at 7,500 rpm, but no source gives the
    real limit.

The same `p60.wasm` runs twice:

1. **In an AudioWorklet**, it simulates engine speed sample by sample and synthesizes the sound:
   - **Dynamics:** throttle, an idle controller, the starter, the limiter, friction and pumping losses.
   - **Exhaust:** a blowdown pulse for each cylinder at exhaust-valve opening, sized by that cycle's combustion. Idle
     cycles vary, so the idle lopes. Each bank's pulses feed its own exhaust pipe (comb-filter waveguides), so each
     bank sounds like a four-cylinder, and the two together give the flat-plane wail.
   - **Intake:** suction pulses into an airbox resonance, plus restrictor rush that grows with airflow.
   - **Mechanical:** valve-seat ticks and block ring.
   - **Starter:** whine, with the compression chug.
   - **Pops:** afterfire on the overrun and at the limiter.
   - **Output:** soft saturation, with a short garage reverb added on the main thread.
2. **On the main thread**, it computes the kinematics for the x-ray view: piston positions, rod angles, cam rotation,
   valve lifts and combustion glow for a given crank angle.

Both come from the same tables, so a cylinder that flashes in the x-ray is the one the sound fires.

**Build.** `npm run build:wasm` builds the crate and copies `p60.wasm` into `public/wasm/`. The binary is committed,
like the models, so the site build needs no Rust. A source hash beside the crate lets `npm test` catch a binary that
is out of date. `cargo test` covers the timing, dynamics and synthesis.

**Worklet.** `public/wasm/p60-worklet.js` is plain JavaScript. The main thread fetches the wasm bytes and passes them
in; the worklet compiles them, renders 128-frame blocks into wasm memory, and reports rpm and status about 50 times a
second.

## 3. The moving parts

`tools/blender/build_internals.py` reuses the engine script's helpers and builds the moving parts:

- crank: main journals, pins, webs and counterweights, a timing snout and flange;
- eight rods (big end, beam and small end) and eight pistons with ring lands;
- four camshafts, with lobes cut to the valve-lift curve and sprockets;
- 32 valves with bucket tappets.

Each moving part is its own node, with its origin at its pivot. Cam lobes are placed by the same timing the crate
uses, so a lobe's nose meets its tappet at peak lift. `npm run build:internals` writes
`public/models/p60b40-internals.glb`. It is loaded only when someone first looks inside.

**Asset contract** (`check-assets`):
- nodes `Internals`, `Crank`, `Rod_1`–`Rod_8`, `Piston_1`–`Piston_8`, four `Cam_*`, and `Valve_<n>_in|ex`;
- at most 1 MB and 40,000 triangles.

## 4. Runtime

**X-ray.** Looking inside swaps the engine's materials for a fresnel ghost: additive, with no depth write. The
selected part's ghost is brighter. The engine casts no shadows while it is see-through, so the parts inside stay lit.
The bay keeps its normal materials.

**Camera.** In the bay view, looking inside moves the camera to a closer shot of the whole engine, from above the
nose. Part views keep their own shots.

**Panel.** The bay view's panel becomes "How it runs":
- the four strokes;
- the firing order, alternating banks;
- why a flat-plane crank wails;
- what is illustrative;
- a live firing-order strip.

**Shake.** Shake is a small jitter that scales with idle roughness, plus a damped roll against the crank's spin
whenever engine speed changes. With reduced motion there is no shake. The x-ray still animates, since the visitor
asks for it.

**Controls.**
- **Desktop:** an engine dock at the bottom right, above the credits, so it never covers the radio player.
- **Phones:** one row among the HUD buttons, above the bottom sheet.
- **"Hold to rev":** works by pointer (with pointer capture), Space or Enter on the button, or holding R anywhere.

## 5. As built

- **Pivots.** Meshopt's quantization folds a scale and offset into whichever node holds a mesh, which moved every
  moving part's pivot to the middle of its mesh. So each part is now a pivot node holding its mesh as a child
  (`<name>_mesh`). The asset check rejects a pivot that holds a mesh, and a test reads the committed file to confirm
  that every cam lobe's nose meets its tappet at the crate's peak-lift angle, to within 4°.
- **Inside shot.** The inside shot stands 2.0 m from the engine, the nearest distance that keeps the whole engine in
  frame.
- **Flash.** It is drawn without depth testing, so it shows through the valves and cams above it, and it fades over
  60° of crank.
- **Phones.** The engine controls flow in among the HUD buttons, which are smaller on phones, so that with the radio
  open every engine marker stays tappable.
- **Measured sound** (48 kHz test drive, `cargo run --example render`):

  | Phase | RMS | Character |
  | --- | --- | --- |
  | Idle (1,500 rpm) | 0.055 | harmonics at 105, 211, 425 and 530 Hz |
  | Limiter | 0.23 | peaks under 0.7 |
  | Starter | 0.03 | |

- **Size.** `p60.wasm` is 81 KB (18 KB gzip) with no imports. The moving parts are 190 KB and 35,000 triangles.
  The page's JavaScript is 442 KB of its 450 KB budget.

## 6. Testing

- **Rust:**
  - The firing order alternates banks.
  - Each piston is at TDC at its firing angle, and rods join pins to pistons.
  - Valve lift peaks at the lobe centres.
  - The engine catches and settles to idle, and revs to the limiter in under a second.
  - The limiter holds, and a stopped engine falls silent.
  - Audio stays finite and below full scale, and is louder revving than idling.
- **Vitest:**
  - wasm exports match `geometry.ts`, and the committed wasm matches its source hash;
  - the worklet renders sound after `start`;
  - store rules (closing the hood ends the x-ray);
  - bindings (sound off stops the engine);
  - shots and topics for the inside view.
- **Playwright:**
  - start the engine, hold to rev (rpm rises past 5,000), release (it falls);
  - look inside: the parts load and the pistons move between frames;
  - controls stay reachable on a phone and never cover the radio;
  - no console errors.

## 7. Out of scope

Photo mode, an exploded view, and engine audio driven by driving physics (Phase 3).

I can't listen to the result, so the sound is checked by measurement: levels, spectra, rpm behaviour. The owner's ear
is the final test.
