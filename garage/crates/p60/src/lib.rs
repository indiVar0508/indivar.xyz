//! The BMW P60B40 for the garage: its timing and kinematics, and a synthesized engine sound.
//!
//! Built for `wasm32-unknown-unknown` with plain C exports, so the same binary runs in an AudioWorklet (the sound)
//! and on the page (the moving parts) with no glue code. Each instance keeps one engine and one kinematics frame in
//! static memory; JavaScript reads them through the pointers these functions return.

pub mod drivetrain;
pub mod engine;
pub mod synth;
pub mod timing;

use core::cell::UnsafeCell;
use engine::{IDLE_RPM, LIMIT_RPM};
use synth::{Synth, MAX_FRAMES};
use timing::{KIN_LEN, CYLINDERS};

/// A wasm instance runs on one thread, so a plain cell is enough.
struct Slot<T>(UnsafeCell<Option<T>>);
unsafe impl<T> Sync for Slot<T> {}

static SYNTH: Slot<Synth> = Slot(UnsafeCell::new(None));
static FRAME: Slot<[f32; KIN_LEN]> = Slot(UnsafeCell::new(None));

fn synth() -> &'static mut Synth {
    unsafe { (*SYNTH.0.get()).get_or_insert_with(|| Synth::new(48_000.0, 1)) }
}

fn cylinder(cyl: u32) -> Option<usize> {
    (1..=CYLINDERS as u32).contains(&cyl).then_some(cyl as usize)
}

/// Sets up the synthesizer for the audio context's sample rate. `seed` varies the engine's small irregularities.
#[no_mangle]
pub extern "C" fn synth_init(sample_rate: f32, seed: u32) {
    unsafe { *SYNTH.0.get() = Some(Synth::new(sample_rate, seed)) }
}

/// Renders up to `synth_max_frames()` frames and returns the left channel; the right follows `synth_max_frames()` later.
#[no_mangle]
pub extern "C" fn synth_render(frames: u32) -> *const f32 {
    let synth = synth();
    synth.render(frames as usize);
    synth.out.as_ptr()
}

#[no_mangle]
pub extern "C" fn synth_max_frames() -> u32 {
    MAX_FRAMES as u32
}

#[no_mangle]
pub extern "C" fn synth_start() {
    synth().start();
}

#[no_mangle]
pub extern "C" fn synth_stop() {
    synth().engine.stop();
}

#[no_mangle]
pub extern "C" fn synth_reset() {
    synth().engine.reset();
}

/// The accelerator, 0 to 1.
#[no_mangle]
pub extern "C" fn synth_set_throttle(pedal: f32) {
    synth().engine.set_pedal(pedal);
}

#[no_mangle]
pub extern "C" fn synth_rpm() -> f32 {
    synth().engine.rpm
}

/// What the engine gets from the throttle and idle control, 0 to 1.
#[no_mangle]
pub extern "C" fn synth_load() -> f32 {
    synth().engine.effective
}

/// Fits or removes the game turbo kit. The real P60B40 is naturally aspirated.
#[no_mangle]
pub extern "C" fn synth_set_turbo(fitted: u32) {
    synth().engine.turbo = fitted != 0;
}

/// Turbo boost, 0 to 1.
#[no_mangle]
pub extern "C" fn synth_boost() -> f32 {
    synth().engine.boost
}

/// 0 off, 1 cranking, 2 running, 3 stopping.
#[no_mangle]
pub extern "C" fn synth_status() -> u32 {
    synth().engine.status as u32
}

/// Changes gear: up (1) or down (0). Returns 1 if the gearbox took the change, 0 if it refused it (past 6th or
/// neutral, mid-change, or into a gear that would over-rev the engine).
#[no_mangle]
pub extern "C" fn synth_shift(up: u32) -> u32 {
    let drive = &mut synth().engine.drive;
    (if up != 0 { drive.shift_up() } else { drive.shift_down() }) as u32
}

/// 0 neutral, 1 to 6 the gears.
#[no_mangle]
pub extern "C" fn synth_gear() -> u32 {
    synth().engine.drive.gear as u32
}

/// The rear wheels' speed on the rollers, rad/s.
#[no_mangle]
pub extern "C" fn synth_wheel() -> f32 {
    synth().engine.drive.wheel
}

/// Torque through the clutch, N·m: positive drives the wheels, negative is engine braking.
#[no_mangle]
pub extern "C" fn synth_clutch() -> f32 {
    synth().engine.drive.clutch
}

/// The gearbox's tooth counts, by index: the constant-mesh pair (input, layshaft), then each gear's layshaft and
/// output teeth from 1st to 6th, then the final drive's pinion and crown wheel.
#[no_mangle]
pub extern "C" fn p60_gearbox(id: u32) -> u32 {
    let (cm, fd) = (drivetrain::CONSTANT_MESH, drivetrain::FINAL_DRIVE);
    let mut teeth = [0u32; 16];
    teeth[0] = cm.0;
    teeth[1] = cm.1;
    for (k, (lay, out)) in drivetrain::GEAR_TEETH.iter().enumerate() {
        teeth[2 + 2 * k] = *lay;
        teeth[3 + 2 * k] = *out;
    }
    teeth[14] = fd.0;
    teeth[15] = fd.1;
    teeth.get(id as usize).copied().unwrap_or(0)
}

/// Fills the kinematics frame for a crank angle (degrees), engine load (0 to 1) and speed (rpm), and returns it; see
/// `timing::kinematics` for the layout.
#[no_mangle]
pub extern "C" fn kin_update(crank: f32, load: f32, rpm: f32) -> *const f32 {
    let frame = unsafe { (*FRAME.0.get()).get_or_insert([0.0; KIN_LEN]) };
    timing::kinematics(crank, load, rpm, frame);
    frame.as_ptr()
}

#[no_mangle]
pub extern "C" fn kin_len() -> u32 {
    KIN_LEN as u32
}

#[no_mangle]
pub extern "C" fn p60_fire_angle(cyl: u32) -> f32 {
    cylinder(cyl).map_or(f32::NAN, timing::fire_angle)
}

#[no_mangle]
pub extern "C" fn p60_valve_centre(cyl: u32, exhaust: u32) -> f32 {
    cylinder(cyl).map_or(f32::NAN, |c| timing::valve_centre(c, exhaust != 0))
}

#[no_mangle]
pub extern "C" fn p60_bank_angle(cyl: u32) -> f32 {
    cylinder(cyl).map_or(f32::NAN, timing::bank_angle)
}

#[no_mangle]
pub extern "C" fn p60_pin_phase(cyl: u32) -> f32 {
    cylinder(cyl).map_or(f32::NAN, timing::pin_phase)
}

/// Named constants, by index: crank radius, rod length, compression height, valve lift, valve duration, cam base
/// radius (metres and crank degrees), idle and limiter rpm, the rear tyres' rolling radius (m), the seconds a gear
/// change takes, and the share of the clutch's torque that reaches the wheels.
#[no_mangle]
pub extern "C" fn p60_constant(id: u32) -> f32 {
    match id {
        0 => timing::CRANK_RADIUS,
        1 => timing::ROD_LENGTH,
        2 => timing::COMPRESSION_HEIGHT,
        3 => timing::VALVE_LIFT,
        4 => timing::VALVE_DURATION,
        5 => timing::CAM_BASE_RADIUS,
        6 => IDLE_RPM,
        7 => LIMIT_RPM,
        8 => drivetrain::TYRE_RADIUS,
        9 => drivetrain::SHIFT_SECONDS,
        10 => drivetrain::EFFICIENCY,
        _ => f32::NAN,
    }
}
