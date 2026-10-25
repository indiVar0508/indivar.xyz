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
