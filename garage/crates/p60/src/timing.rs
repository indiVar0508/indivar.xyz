//! The P60B40's crank, rods and valve timing, and the kinematics of its moving parts.
//!
//! Engine space matches the garage: x toward the car's left, y up, z toward the nose, origin on the crank axis.
//! Angles in the x-y plane are measured clockwise from +y as seen from the front, which is the way the crank turns.
//! Crank angles run over the 720° four-stroke cycle, with cylinder 1 firing at 0°.

use core::f32::consts::PI;

pub const CYLINDERS: usize = 8;

/// Verified: the firing order.
pub const FIRING_ORDER: [usize; CYLINDERS] = [1, 8, 3, 6, 4, 5, 2, 7];

/// Verified: a 72 mm stroke.
pub const CRANK_RADIUS: f32 = 0.036;

// Illustrative from here on: no source gives them. They fit a 94 mm bore and the block's 0.24 m deck.
pub const ROD_LENGTH: f32 = 0.172;
/// Piston pin to crown.
pub const COMPRESSION_HEIGHT: f32 = 0.032;
pub const VALVE_LIFT: f32 = 0.012;
/// Crank degrees each valve is open.
pub const VALVE_DURATION: f32 = 280.0;
/// Peak intake lift, in crank degrees after the overlap TDC.
pub const INTAKE_CENTRE: f32 = 105.0;
/// Peak exhaust lift, in crank degrees before the overlap TDC.
pub const EXHAUST_CENTRE: f32 = 105.0;
pub const CAM_BASE_RADIUS: f32 = 0.016;

/// Cylinders 1–4 are the right bank, leaning toward -x; 5–8 the left, toward +x (90° V).
pub fn bank_angle(cyl: usize) -> f32 {
    if cyl <= 4 {
        -45.0
    } else {
        45.0
    }
}

/// The bank a cylinder sits in: 0 for the right (1–4), 1 for the left (5–8).
pub fn bank(cyl: usize) -> usize {
    usize::from(cyl > 4)
}

/// Each pin carries one rod from each bank: pin k takes cylinders k and k+4. Pins 1 and 4 share a phase and pins
/// 2 and 3 sit opposite them, which is what makes the crank flat. Angles are at crank angle 0.
pub fn pin_phase(cyl: usize) -> f32 {
    match (cyl - 1) % 4 {
        0 | 3 => -45.0,
        _ => 135.0,
    }
}

/// The crank angle at which a cylinder fires: one every 90°, in firing order.
pub fn fire_angle(cyl: usize) -> f32 {
    let slot = FIRING_ORDER.iter().position(|&c| c == cyl).unwrap_or(0);
    slot as f32 * 90.0
}

pub fn wrap720(angle: f32) -> f32 {
    angle.rem_euclid(720.0)
}

/// How far `angle` is past `from` around the cycle, in [-360, 360).
pub fn delta720(angle: f32, from: f32) -> f32 {
    (angle - from + 360.0).rem_euclid(720.0) - 360.0
}

/// The crank angle of peak lift for a cylinder's intake or exhaust valves.
pub fn valve_centre(cyl: usize, exhaust: bool) -> f32 {
    let overlap_tdc = fire_angle(cyl) + 360.0;
    wrap720(if exhaust { overlap_tdc - EXHAUST_CENTRE } else { overlap_tdc + INTAKE_CENTRE })
}

/// A smooth lift curve: cos² over the valve's open duration, peaking at `centre`.
pub fn valve_lift(crank: f32, centre: f32) -> f32 {
    let d = delta720(crank, centre);
    if d.abs() >= VALVE_DURATION / 2.0 {
        return 0.0;
    }
    let c = (PI * d / VALVE_DURATION).cos();
    VALVE_LIFT * c * c
}

/// The crank angles where a cylinder's valves open and close.
pub fn valve_events(cyl: usize, exhaust: bool) -> (f32, f32) {
    let centre = valve_centre(cyl, exhaust);
    (wrap720(centre - VALVE_DURATION / 2.0), wrap720(centre + VALVE_DURATION / 2.0))
}

/// Brightness of the combustion flash: full at firing, fading over the power stroke.
pub fn glow(cyl: usize, crank: f32) -> f32 {
    let d = wrap720(crank - fire_angle(cyl));
    if d < 180.0 {
        (-d / 60.0).exp()
    } else {
        0.0
    }
}

/// Illustrative: spark advance before top dead centre, growing with rpm (degrees).
pub fn spark_advance(rpm: f32) -> f32 {
    12.0 + 18.0 * ((rpm - 1500.0) / 6000.0).clamp(0.0, 1.0)
}

/// Brightness of the spark at the plug: a short flash, `spark_advance` degrees before the cylinder fires.
pub fn spark(cyl: usize, crank: f32, rpm: f32) -> f32 {
    let d = wrap720(crank - (fire_angle(cyl) - spark_advance(rpm)));
    if d < 10.0 {
        1.0 - d / 10.0
    } else {
        0.0
    }
}

/// Illustrative port injection: the injector sprays at the back of the shut intake valve and stops just after it
/// opens. More load means a longer spray. Returns 0 to 1, with short ramps at each end.
pub fn injection(cyl: usize, crank: f32, load: f32) -> f32 {
    let (opens, _) = valve_events(cyl, false);
    let duration = 40.0 + 160.0 * load.clamp(0.0, 1.0);
    let into = wrap720(crank - (opens + 10.0 - duration));
    if into >= duration {
        return 0.0;
    }
    (into / 5.0).min((duration - into) / 5.0).min(1.0)
}

/// Crank degrees the exhaust pulse takes to run the length of its header primary.
pub const EXHAUST_TRAVEL: f32 = 220.0;

/// How far down its header a cylinder's exhaust pulse has run (0 to 1), or -1 when none is in the pipe.
pub fn exhaust_pulse(cyl: usize, crank: f32) -> f32 {
    let d = wrap720(crank - valve_events(cyl, true).0);
    if d < EXHAUST_TRAVEL {
        d / EXHAUST_TRAVEL
    } else {
        -1.0
    }
}

pub struct Throw {
    /// Pin centre (x, y).
    pub pin: [f32; 2],
    /// Distance from the crank axis to the piston pin, along the bore.
    pub piston: f32,
    /// Rotation about z that turns +y onto the rod, from big end to small end (radians, three.js sense).
    pub rod_angle: f32,
}

/// Slider-crank kinematics for one cylinder.
pub fn throw(cyl: usize, crank: f32) -> Throw {
    let pin_angle = (pin_phase(cyl) + crank).to_radians();
    let pin = [CRANK_RADIUS * pin_angle.sin(), CRANK_RADIUS * pin_angle.cos()];
    let bank = bank_angle(cyl).to_radians();
    let off_axis = pin_angle - bank;
    let across = CRANK_RADIUS * off_axis.sin();
    let piston = CRANK_RADIUS * off_axis.cos() + (ROD_LENGTH * ROD_LENGTH - across * across).sqrt();
    let small = [piston * bank.sin(), piston * bank.cos()];
    let rod_angle = -(small[0] - pin[0]).atan2(small[1] - pin[1]);
    Throw { pin, piston, rod_angle }
}

/// Floats per kinematics frame: crank and cam rotation, then (piston, pin x, pin y, rod angle) per cylinder,
/// then (intake lift, exhaust lift) per cylinder, then per cylinder: glow, spark, injection, exhaust pulse.
pub const KIN_LEN: usize = 2 + CYLINDERS * 4 + CYLINDERS * 2 + CYLINDERS * 4;

/// The frame for a crank angle. `load` (0 to 1) sets how long the injectors spray; `rpm` sets the spark advance.
pub fn kinematics(crank: f32, load: f32, rpm: f32, out: &mut [f32; KIN_LEN]) {
    out[0] = -crank.to_radians(); // clockwise from the front is negative about +z
    out[1] = -(crank / 2.0).to_radians(); // cams turn once per cycle, the same way
    for i in 0..CYLINDERS {
        let cyl = i + 1;
        let t = throw(cyl, crank);
        out[2 + i * 4..6 + i * 4].copy_from_slice(&[t.piston, t.pin[0], t.pin[1], t.rod_angle]);
        out[34 + i * 2] = valve_lift(crank, valve_centre(cyl, false));
        out[35 + i * 2] = valve_lift(crank, valve_centre(cyl, true));
        out[50 + i] = glow(cyl, crank);
        out[58 + i] = spark(cyl, crank, rpm);
        out[66 + i] = injection(cyl, crank, load);
        out[74 + i] = exhaust_pulse(cyl, crank);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TDC: f32 = CRANK_RADIUS + ROD_LENGTH;

    #[test]
    fn fires_every_90_degrees_alternating_banks() {
        let mut angles: Vec<f32> = (1..=8).map(fire_angle).collect();
        angles.sort_by(f32::total_cmp);
        assert_eq!(angles, (0..8).map(|k| k as f32 * 90.0).collect::<Vec<_>>());
        for pair in FIRING_ORDER.windows(2) {
            assert_ne!(bank(pair[0]), bank(pair[1]), "{pair:?}");
        }
    }

    #[test]
    fn crank_is_flat() {
        assert_eq!(pin_phase(1), pin_phase(4));
        assert_eq!(pin_phase(2), pin_phase(3));
        assert_eq!(pin_phase(2) - pin_phase(1), 180.0);
        for k in 1..=4 {
            assert_eq!(pin_phase(k), pin_phase(k + 4), "pin {k} carries {k} and {}", k + 4);
        }
    }

    #[test]
    fn each_piston_is_at_top_dead_centre_when_it_fires() {
        for cyl in 1..=8 {
            let fire = fire_angle(cyl);
            assert!((throw(cyl, fire).piston - TDC).abs() < 1e-6, "cylinder {cyl}");
            assert!((throw(cyl, fire + 360.0).piston - TDC).abs() < 1e-6, "cylinder {cyl} at overlap");
            assert!((throw(cyl, fire + 180.0).piston - (ROD_LENGTH - CRANK_RADIUS)).abs() < 1e-6, "cylinder {cyl} at BDC");
            for step in 1..72 {
                assert!(throw(cyl, fire + step as f32 * 10.0).piston <= TDC + 1e-6);
            }
        }
    }

    #[test]
    fn rods_join_pins_to_pistons() {
        for cyl in 1..=8 {
            for step in 0..72 {
                let t = throw(cyl, step as f32 * 10.0);
                let (s, c) = bank_angle(cyl).to_radians().sin_cos();
                let rod = [t.piston * s - t.pin[0], t.piston * c - t.pin[1]];
                assert!(((rod[0] * rod[0] + rod[1] * rod[1]).sqrt() - ROD_LENGTH).abs() < 1e-5);
                // three.js: rotation.z = a turns +y into (-sin a, cos a)
                let along = [-t.rod_angle.sin() * ROD_LENGTH, t.rod_angle.cos() * ROD_LENGTH];
                assert!((along[0] - rod[0]).abs() < 1e-5 && (along[1] - rod[1]).abs() < 1e-5);
            }
        }
    }

    #[test]
    fn valves_are_shut_for_compression_and_power_and_overlap_at_the_other_tdc() {
        for cyl in 1..=8 {
            let fire = fire_angle(cyl);
            for d in [-100.0, -40.0, 0.0, 40.0, 100.0] {
                assert_eq!(valve_lift(fire + d, valve_centre(cyl, false)), 0.0);
                assert_eq!(valve_lift(fire + d, valve_centre(cyl, true)), 0.0);
            }
            assert!(valve_lift(fire + 360.0, valve_centre(cyl, false)) > 0.0);
            assert!(valve_lift(fire + 360.0, valve_centre(cyl, true)) > 0.0);
            assert_eq!(valve_lift(valve_centre(cyl, true), valve_centre(cyl, true)), VALVE_LIFT);
            let (opens, closes) = valve_events(cyl, true);
            assert!((delta720(opens, fire) - 115.0).abs() < 1e-3, "exhaust opens 65° before bottom dead centre");
            assert!((delta720(closes, fire + 360.0) - 35.0).abs() < 1e-3);
        }
    }

    #[test]
    fn sparks_before_firing_and_earlier_at_high_rpm() {
        for cyl in 1..=8 {
            let fire = fire_angle(cyl);
            assert_eq!(spark(cyl, fire - spark_advance(1500.0), 1500.0), 1.0);
            assert_eq!(spark(cyl, fire + 5.0, 1500.0), 0.0);
            assert!(spark(cyl, fire - 27.0, 8000.0) > 0.5, "lit 27° early at 8,000 rpm");
            assert_eq!(spark(cyl, fire - 27.0, 1500.0), 0.0, "not yet at idle");
        }
        assert!(spark_advance(8000.0) > spark_advance(1500.0));
    }

    #[test]
    fn injects_against_the_shut_intake_valve_for_longer_under_load() {
        let open_for = |cyl: usize, load: f32| (0..720).filter(|&a| injection(cyl, a as f32, load) > 0.0).count();
        for cyl in 1..=8 {
            assert!(open_for(cyl, 1.0) > 2 * open_for(cyl, 0.0));
            let (opens, _) = valve_events(cyl, false);
            assert!(injection(cyl, opens - 20.0, 0.0) > 0.0, "sprays before the valve opens");
            assert_eq!(injection(cyl, opens + 30.0, 1.0), 0.0, "and stops once it is open");
            assert_eq!(injection(cyl, fire_angle(cyl) + 40.0, 1.0), 0.0, "never in the power stroke");
        }
    }

    #[test]
    fn sends_each_exhaust_pulse_down_its_header_after_the_valve_opens() {
        for cyl in 1..=8 {
            let (opens, _) = valve_events(cyl, true);
            assert_eq!(exhaust_pulse(cyl, opens - 1.0), -1.0);
            assert!((exhaust_pulse(cyl, opens + EXHAUST_TRAVEL / 2.0) - 0.5).abs() < 1e-4);
        }
    }

    #[test]
    fn kinematics_frame_matches_the_parts() {
        let mut out = [0.0; KIN_LEN];
        kinematics(90.0, 0.0, 1500.0, &mut out);
        assert!((out[0] + 90f32.to_radians()).abs() < 1e-6);
        assert!((out[1] + 45f32.to_radians()).abs() < 1e-6);
        let eight = 2 + 7 * 4;
        assert!((out[eight] - TDC).abs() < 1e-6, "cylinder 8 fires at 90°");
        assert!(out[50 + 7] > 0.99 && out[50] < 0.25, "cylinder 8 just fired; cylinder 1 is fading");
    }
}
