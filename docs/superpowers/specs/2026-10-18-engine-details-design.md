# Garage: more of the engine, working

Follow-up to `2026-10-11-engine-running-design.md`. The owner tried the running engine ("its working good") and
asked two things:

- **"The middle pistons seem to go together."** That is correct, and explaining it is part of this work. On a
  flat-plane crank each bank is laid out like a four-cylinder engine: pins 2 and 3 share a phase, opposite pins 1
  and 4. One of the pair is firing while the other ends its exhaust stroke. The panel says so, and the flash shows
  which is which.
- **"Add other components ... as close to reality as possible, turbo, fuel injector etc."** Asked to choose, the
  owner picked:
  - a game turbo kit as a switch;
  - moving parts outside;
  - fuel and spark inside;
  - the real parts that are missing;
  - oil and coolant flow.

## 1. Real engine

**Moving parts outside.** These are visible with the hood open:
- the crank damper and pulley, water pump, alternator, idler and tensioner pulleys turn at their belt ratios;
- the eight throttle butterflies open with the throttle.

Each one is a pivot node holding its mesh, as in the moving-parts file, so quantization can't move the pivot. They
stay inside their `Part_*` nodes, so clicking them still opens their topic.

**Fuel and spark inside** (in the x-ray, at the same 40× slow motion):
- **Spark:** a blue-white spark at each plug shortly before top dead centre. The advance grows with rpm, from about
  12° at idle to about 30° near the limiter.
- **Injection:** each injector sprays at the back of its intake valve. The spray starts before the valve opens and
  lasts longer with more load (port injection's closed-valve timing).
- **Air:** air streams into the two restrictor inlets, harder with more airflow, and down each runner while its
  intake valve is open.
- **Exhaust:** a glowing pulse runs down each cylinder's header primary after its exhaust valve opens.
- **Fuel:** fuel moves along the feed line and crossover into the rails.

The timing for these comes from the crate's kinematics frame, so it agrees with the sound. Injection and spark
timing, and the advance curve, are illustrative.

**Missing real parts.**
- **Spark plugs:** one central plug per cylinder between the four valves, in the moving-parts file.
- **Flywheel and clutch:** a flywheel with a ring gear and a small multi-plate race clutch on the back of the crank.
- **Starter motor:** a body bolted to the bellhousing flange, and a pinion that meshes with the ring gear and
  spins only while cranking.
- **Wiring:** an injector harness along each rail, with a branch to every injector.

These are illustrative; no source shows the P60B40's.

**Oil and coolant flow** (in the x-ray):
- **Oil:** amber oil runs from the pump stack to the tank and back through the dry-sump lines.
- **Coolant:** coolant runs through the radiator hoses and the expansion line.
- Both flow faster with engine speed.

**Flow paths.** The engine GLB carries each pipe's centreline as an empty node, `Flow_<kind>_<k>`, with
`extras.points`. They come from the same point lists the Blender script sweeps the tubes along, so the flow stays
inside its pipe.

## 2. Game turbo kit

The real P60B40 is naturally aspirated. A "Game turbo" switch in the engine dock bolts on a twin-turbo kit, labelled
*only in the game*. *Most Wanted* sells turbo upgrades (the existing `game-turbo` topic and its source cover this).
The switch is off by default and is not remembered between visits.

- **Model:** `tools/blender/build_turbo.py` writes `p60b40-turbo.glb`, loaded only when the switch first turns on.
  - A turbo sits on each bank's header collector, with a turbine housing, a centre section, and a compressor
    housing with a cone filter.
  - Charge pipes run forward and up into the two restrictor inlets.
  - The compressor wheels are pivots that spin with boost.
- **Sound** (crate):
  - Boost builds with exhaust flow, with lag, and adds torque.
  - The compressor whistles as it spools.
  - The blow-off valve hisses when the throttle snaps shut under boost.
  - The turbines soften the exhaust.
- **Gauges:** the tach shows boost while the kit is on, and the turbine housings glow faintly with boost.

## 3. Contracts and checks

- **Engine GLB:**
  - `Spin_<pulley>` and `Throttle_<n>` pivots with no mesh of their own;
  - `Injector_<n>` tips;
  - `Flow_*` paths with at least two points.
  - The existing hotspot and budget rules still apply.
- **Moving parts:** `Plugs` and `Starter_pinion`, both pivots holding their meshes.
- **Turbo GLB:** the `Turbo` root, `Compressor_left` and `Compressor_right` pivots, under 1 MB and 30,000 triangles.
- **Tests:**
  - The crate's tests cover boost lag, blow-off and the advance curve.
  - The page's tests cover frame layout, pulley ratios, the flow path sampler, and the store rule for the turbo
    switch.
  - Playwright switches the kit on and checks boost rises while revving, and checks the x-ray effects appear.
- **Budget:** JavaScript stays under 450 KB gzip.

## 4. As built

- **Flywheel.** The flywheel, its 120-tooth ring gear and the clutch turn with the crank, so they are part of the
  `Crank` mesh rather than a node of their own. The 11-tooth starter pinion is phased to sit in a ring-gear gap.
- **Turbo layout.** The turbos sit low behind the collectors, 1–2 cm clear of the firewall, the strut towers and the
  bay floor. The charge pipes run outside the heads at x ±0.44 and arc over the belt drive into the inlets.
- **Measured turbo sound.** In a 48 kHz test drive:
  - the limiter peaks at 0.55;
  - the exhaust's spectral centroid drops from about 1.9 kHz to 1.0 kHz through the turbines;
  - the blow-off hiss is 0.08 RMS or more.
- **Phones.** The engine controls show short words ("Start", "Inside", "Turbo", "Rev"), while their accessible names
  stay in full, so the HUD fits two rows with the engine off.
- **Sizes and budget.**
  - Engine: 78,364 triangles.
  - Moving parts: 38,944 triangles.
  - Turbo kit: 9,576 triangles and 0.1 MB.
  - JavaScript: 445 of 450 KB gzip, so little headroom is left.
- **Test server.** Playwright reuses whatever is already serving on port 4176. When another project holds that port,
  run the suite against a preview of this one, for example `GARAGE_URL=http://localhost:4177/`.

## 5. Out of scope

Photo mode, the exploded view, and driving (Phase 3, with Rapier).
