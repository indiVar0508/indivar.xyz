# Garage: gears, wheels, and more of the engine

Follow-up to `2026-10-18-engine-details-design.md`. The owner asked again whether the middle two cylinders move
together (yes: each bank of a flat-plane crank is laid out like a four-cylinder engine, and the panel already says
so). They then asked for two things: more parts inside the engine, and a way to see how the tyres move when the engine
revs, including what the gears change. Asked to choose the details, they said "you pick u r the expert", so the calls
below are Claude's.

## 1. Facts (sources)

The BMW Group press release of 14 March 2001, "New BMW M3 GTR unveiled for ALMS"
(press.bmwgroup.com/global/article/detail/T0003841EN), gives:
- a triple-disc carbon-fibre clutch;
- a straight-cut six-speed manual gearbox;
- a "step-up differential with visco-lock", i.e. a viscous limited-slip differential;
- a vehicle weight of 1,120 kg, the minimum the rules allowed;
- over 400 bhp at about 7,500 rpm, and about 480 N·m at about 5,500 rpm.

No source found gives the gear ratios, final drive, tyre size or where the gearbox sits. Those are illustrative. The
gearbox goes behind the engine, as in the road M3.

## 2. Gears and wheels

- **Rolling road.** Twin rollers under each rear wheel, set into the garage floor. The rear wheels turn on them and the
  front wheels stay still, because the car is rear-wheel drive. The rollers model road load: the car's 1,120 kg of
  inertia, rolling resistance, and aerodynamic drag.
- **Gear selector.** N and gears 1 to 6, changed with a down button and an up button (arrow keys too). It is shown in
  the engine dock while the engine runs.
  - A downshift that would over-rev the engine is refused, with a note.
  - Upshifting cuts the throttle and opens the clutch briefly, so the revs drop to suit the road speed.
- **Crate (`crates/p60`, a new drivetrain module).**
  - Engine and wheels are coupled through an automatic clutch. It slips below about 2,700 rpm and is open below
    1,200 rpm, so cranking and stalling still work.
  - The engine's inertia is derived from TORQUE_GAIN and the 480 N·m peak (about 0.19 kg·m²). With a gear engaged,
    the reflected car inertia slows revving: about 8× in 1st and 45× in 6th.
  - Illustrative ratios: 2.43, 1.84, 1.46, 1.22, 1.06, 0.95, with a final drive of about 3.84. That gives about
    113 km/h in 1st and 290 km/h in 6th at 8,500 rpm. The tooth counts are the source of truth, and
    `build_drivetrain.py` reads them from p60.wasm, as build-internals does for timing.
  - The worklet reports gear, road speed and wheel speed alongside rpm, load and boost.
  - Sound: straight-cut gear whine at the gears' mesh frequency, louder under load, plus a hum from the rollers.
- **Car model.** `prepare_car.py` splits Tyres, Rims and BrakeDiscs per wheel into `Wheel_<FL|FR|RL|RR>` pivots with
  `_mesh` children, because meshopt quantization would otherwise move the pivots. The calipers stay on Body. The car
  contract and check-assets gain the wheel pivots.
- **Drivetrain model** (`build_drivetrain.py`, a lazy GLB in car space). It holds:
  - a bellhousing and a gearbox case, which show as a ghost;
  - the input shaft, layshaft and output shaft, with six constant-mesh gear pairs;
  - three dog rings and their selector forks, which slide to engage each gear;
  - the propshaft, a crown wheel and pinion in the differential, the half-shafts, and the rollers.
- **Drivetrain view.** A new car hotspot and topic, "Gearbox and drive".
  - The camera frames the side of the car from above. The body turns to an x-ray ghost, and the engine and drivetrain
    show inside.
  - It runs 40× slower, like the engine x-ray, so every shaft turns at its true relative speed: the crank, the
    layshaft, each free-wheeling output gear, the propshaft and the wheels.
  - The engaged gear pair glows. Outside the x-ray, the wheels turn at real speed up to a cap.
- **Panel.** Verified facts (the clutch, the straight-cut gears, the viscous differential, 1,120 kg), plus a live gear
  strip. For each gear it shows a bar from 0 to its speed at the limiter, and how much it multiplies the torque. The
  current gear and speed are marked.

## 3. More of the engine (the internals GLB)

- **Valve springs.** One per valve, compressing as the valve opens. Each is a pivot scaled along the stem axis.
- **Timing drive.** The cam sprockets (56 teeth) and the crank's timing gear already exist. Add a chain per bank from
  the crank to its two cam sprockets, drawn as links moving along a path at crank speed times the sprocket radius.
  The chain is illustrative, since no source says chain or gears.
- **Oil pump.** Rotors turning inside the dry-sump pump stack, at (−0.262, −0.1) in engine space, along z −0.21..0.29.
- **Piston oil jets.** Oil spraying up from the block onto the underside of each piston, while the engine runs.
- The pistons already have ring grooves and wrist pins. Raise the internals budget from 40k to 60k triangles.

## 4. Constraints

- JavaScript is at 445 of 450 KB gzip. Keep the logic in the crate. If the budget still breaks, trim code or raise it,
  and say so.
- Keep the existing rules:
  - pivots with `_mesh` children;
  - "illustrative" badges where no source exists;
  - phones fit their controls, using short labels;
  - tests come first;
  - GARAGE_URL=http://localhost:4177/ when port 4176 is busy.
- Commit on `garage-drivetrain`, which branches from `garage-engine-details`. Don't push without asking.

## 5. As built

- **Driven wheels only.** Only the rear wheels are pivots (`Wheel_RL`, `Wheel_RR`), since the fronts never turn on a
  two-wheel-drive rolling road. Each holds its tyre, rim and brake disc; the calipers stay on the body.
- **Clutch and creep.** The automatic clutch bites from 1,200 rpm, so in gear at idle the car creeps, to about 17 km/h
  in 1st, as a car does with the clutch out at idle. Shift presses come no faster than a change takes (0.12 s).
- **Roller brake.** In neutral the rollers coast against road load, but once the engine stops the rolling road brakes
  them at 6 m/s², so the wheels don't spin on for a minute after a stop at speed.
- **Measured drive** (48 kHz render, `--gears`): 0–100 km/h in 4.3 s and 0–200 in 13 s, changing up at 8,000 rpm at
  106, 142, 175 and 201 km/h. Drag holds 6th to about 265 km/h, short of the 282 km/h its ratio allows at the limiter.
- **Measured sound.** A long lift in gear stays at about 0.04 RMS (idle is 0.06): with the fuel cut, the pumping pulses
  grow with rpm so the overrun isn't silent. Peaks stay under 0.65.
- **Camera.** The view is from behind the left side and above, so on a desktop screen the whole driveline sits left of
  the panel and above the dock (a test checks it).
- **Timing drive.** A 28-tooth double sprocket on the crank and 56-tooth cam sprockets turn the cams at half speed. The
  left bank's chain runs 14 mm in front of the right's, so they pass at the crank, and the crank's nose narrows to a
  15 mm radius to fit the sprocket.
- **Oil pump.** Five gerotor stages at half crank speed (illustrative), with the outer rings following at 6/7.
- **Sizes and budget.**
  - Car: 2.8 MB and 116,360 triangles, unchanged by the split.
  - Drivetrain: 0.2 MB and 20,040 triangles.
  - Moving parts: 0.3 MB and 54,100 triangles, with the budget raised from 40k to 60k.
  - JavaScript: 449 of 450 KB gzip. The budget is effectively full; the next feature needs code trimmed or the
    budget raised.

## 6. Under the hood (2026-11-27)

The owner changed gear with the hood open and saw nothing change. Two causes, measured in the page:
- Outside the x-ray the belt drive turned at the strobe cap (about 1,200°/s) at any speed above about 200 rpm, so rev changes never showed.
- The engine's roll followed only the crank's acceleration. In gear the car's inertia slows that 8–45×, so the engine
  leaned 0.1° pulling in 1st against 0.7° revving in neutral: the opposite of a real engine.

Fixes:
- **Mount torque in the crate.** `Drivetrain::mount` is what spins up the crank plus what the gearbox sends on down the
  propshaft: the engine's torque less the clutch's, plus the clutch's times the gearbox ratio (ignoring the gears' small
  losses). The worklet reports it as `mount`. Pulling at 5,000 rpm it is about 2.2× the engine's torque in 1st and
  about equal to it in 6th. An upshift unloads it (spark cut, clutch open) until the next gear takes the drive, and
  engine braking reverses it.
- **Lean.** The engine leans by the mount torque over an illustrative stiffness of 28,000 N·m/rad, capped at 2.6°,
  through the existing spring-damper. Measured: 0.8° revving in neutral, 1.9° pulling in 1st. That is softer than a race
  car's mounts, and the panel says so.
- **Belts.** Every pulley is slowed by one factor, so the fastest (the tensioner, 2.5× the crank) reaches the strobe
  cap at the 8,500 rpm limiter. The drive keeps its ratios and follows the revs: about 73°/s for the crank pulley at
  idle, 480°/s at the limiter.

## 7. Watching a gear change (2026-11-28)

The lean and belts of §6 were still too small and quick to see: the crate's change is over in 0.12 s, and the parts
that change gear sat behind the engine, shown only in the gearbox view at full speed. The owner asked to see what
happens inside when the gear changes, with the gearbox visible.

- **Look inside shows the clutch and gearbox.** The driveline shows and the body turns x-ray whenever the hood is open
  and the visitor looks inside, as in the gearbox view. The engine bay's shell turns x-ray with the engine, or it hid
  the gearbox. The camera moved from above the nose to the car's right side, a little above the engine, 1.5 m off, so
  the back of the engine, the clutch and the gearbox line up across the screen left of the panel, gears side-on; the
  gearbox spans over a quarter of the screen. That view looks through the raised hood, which is a ghost there, so the
  hood checks skip it; it gets its own orbit limits (no zooming closer), or swinging back would reach the cabin.
- **The clutch pack is seven parts.** `Clutch_disc_1..3` (carbon, turning with the input shaft) and
  `Clutch_plate_1..4` (steel, turning with the flywheel), front to back, each with `extras.spread`: how far it slides
  back wide open, 4 mm more per gap, 24 mm for the pressure plate. Real clutches move about a millimetre; the panel says
  it is drawn wider. The flywheel keeps the face and longer bolts. Without a replay the pack sits shut in gear and open
  in neutral, as the crate's automatic clutch is.
- **The replay** (`src/drive/shiftReplay.ts`). A change the x-ray sees is replayed over the crate's shift time × 40
  (4.8 s), in up to four equal steps over the first 90%: the clutch opens (with the spark cut going up, the throttle
  blip going down), the old gear's dog ring slides to the middle, the new gear's slides in, the clutch closes. From
  neutral there is no opening or sliding out; into neutral, no sliding in or closing. 1st and 2nd share a ring, which
  slides right across. The parts a step moves glow cyan; the drive's path stays orange, dimmed by how far the clutch
  is open, and moves to the new gear once its ring is in. The live engine, sound and gauges carry on at full speed;
  the revs either side of the change are read 0.24 s after it (twice the shift time) for the last step's sentence.
  A new change restarts the replay.
- **The panel** lists the steps (`ShiftSteps`): done, under way (lit, with a sentence), to come; once played, all done
  with the revs. It sits in both x-ray panels, above the firing order and the gear chart. Outside the x-ray, in gear
  with the hood open, the dock says to look inside.
- **Budget.** The work took the JavaScript to 451 KB gzip. drei's `<Environment>` was replaced by `StudioEnvironment`,
  which renders the same Lightformers once into the same 256 px half-float cube map without drei's HDR, EXR and
  gain-map loaders; the showroom renders identically (only the drifting dust differs) and the total fell to 434 KB.
