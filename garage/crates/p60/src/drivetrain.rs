//! What the P60B40 drives on the rolling road: an automatic clutch, the straight-cut six-speed gearbox, the final
//! drive, and the rear wheels, which carry the car's inertia and road load.
//!
//! BMW's 2001 release gives a triple-disc carbon clutch, a straight-cut six-speed manual gearbox, a viscous
//! limited-slip differential and a 1,120 kg minimum weight. No source gives the ratios, the final drive or the tyres,
//! so the tooth counts, the tyre radius, the road load and the clutch below are illustrative.

use crate::engine::{LIMIT_RPM, NM_PER_RPM_S, PEAK_TORQUE};
use core::f32::consts::PI;

pub const GEARS: usize = 6;
/// The input shaft's gear and the layshaft gear it drives: the constant-mesh pair every gear goes through.
pub const CONSTANT_MESH: (u32, u32) = (23, 31);
/// Each gear's layshaft and output-shaft teeth, 1st to 6th. Every pair adds up to 58, so all share one centre distance.
pub const GEAR_TEETH: [(u32, u32); GEARS] = [(21, 37), (25, 33), (28, 30), (30, 28), (32, 26), (34, 24)];
/// The differential's pinion and crown wheel.
pub const FINAL_DRIVE: (u32, u32) = (13, 50);
/// Rolling radius of the rear tyres (m): the car model's rear wheel centres sit 0.322 m up.
pub const TYRE_RADIUS: f32 = 0.322;
/// Seconds the clutch stays open through a gear change.
pub const SHIFT_SECONDS: f32 = 0.12;

/// rad/s per rpm.
const RPM: f32 = 2.0 * PI / 60.0;
/// The engine's own inertia (kg·m²), from how fast engine.rs revs it free at its quoted peak torque.
const ENGINE_INERTIA: f32 = NM_PER_RPM_S / RPM;
/// The 1,120 kg car as the rollers present it at the rear wheels, plus the wheels and driveline (kg·m²).
const WHEEL_INERTIA: f32 = 1120.0 * TYRE_RADIUS * TYRE_RADIUS + 3.0;
/// Road load the rollers apply: rolling resistance (N) and aerodynamic drag (N per (m/s)²).
const ROLLING: f32 = 165.0;
const DRAG: f32 = 0.48;
/// How much of the clutch's torque reaches the wheels through the gears.
pub const EFFICIENCY: f32 = 0.9;
/// What the clutch can pass fully engaged (N·m), and the engine speeds over which it bites.
const CLUTCH_CAPACITY: f32 = 1.5 * PEAK_TORQUE;
const BITE_RPM: f32 = 1200.0;
const FULL_BITE_RPM: f32 = 2700.0;

/// The gearbox's own reduction in a gear: the constant-mesh pair, then the gear's own pair.
pub fn gearbox_ratio(gear: usize) -> f32 {
    let (lay, out) = GEAR_TEETH[gear - 1];
    (CONSTANT_MESH.1 as f32 / CONSTANT_MESH.0 as f32) * (out as f32 / lay as f32)
}

/// From the crank to the rear wheels in a gear.
pub fn overall_ratio(gear: usize) -> f32 {
    gearbox_ratio(gear) * FINAL_DRIVE.1 as f32 / FINAL_DRIVE.0 as f32
}

/// Road speed (km/h) at an engine speed in a gear, with the clutch shut.
pub fn speed_at(gear: usize, rpm: f32) -> f32 {
    rpm * RPM / overall_ratio(gear) * TYRE_RADIUS * 3.6
}

#[derive(Default)]
pub struct Drivetrain {
    /// 0 is neutral; 1 to 6 are the gears.
    pub gear: usize,
    /// The rear wheels' speed (rad/s), and the rollers'.
    pub wheel: f32,
    /// Torque through the clutch (N·m); positive drives the car, negative is engine braking.
    pub clutch: f32,
    pub(crate) locked: bool,
    shift: f32,
    upshift: bool,
}

impl Drivetrain {
    pub fn speed_kmh(&self) -> f32 {
        self.wheel * TYRE_RADIUS * 3.6
    }

    /// The engine speed that suits the road speed in a gear.
    pub fn road_rpm(&self, gear: usize) -> f32 {
        self.wheel * overall_ratio(gear) / RPM
    }

    /// Changes up a gear (from neutral into 1st). Refused above 6th, mid-change, or if it would over-rev the engine.
    pub fn shift_up(&mut self) -> bool {
        self.gear < GEARS && self.change(self.gear + 1, true)
    }

    /// Changes down a gear (from 1st into neutral). Refused mid-change, or if it would over-rev the engine.
    pub fn shift_down(&mut self) -> bool {
        self.gear > 0 && self.change(self.gear - 1, false)
    }

    fn change(&mut self, gear: usize, up: bool) -> bool {
        if self.shift > 0.0 || (gear > 0 && self.road_rpm(gear) > LIMIT_RPM) {
            return false;
        }
        self.gear = gear;
        self.shift = SHIFT_SECONDS;
        self.upshift = up;
        self.locked = false;
        true
    }

    /// An upshift cuts the spark while the clutch is open, as a flat-shift does.
    pub fn cutting(&self) -> bool {
        self.shift > 0.0 && self.upshift
    }

    /// A downshift blips the throttle toward the revs the lower gear will need.
    pub fn blip(&self, rpm: f32) -> f32 {
        if self.shift > 0.0 && !self.upshift && self.gear > 0 {
            ((self.road_rpm(self.gear) - rpm) / 1500.0).clamp(0.0, 1.0)
        } else {
            0.0
        }
    }

    /// How far the automatic clutch is engaged: open through a change and below 1,200 rpm, fully shut by 2,700 rpm.
    fn engagement(&self, rpm: f32) -> f32 {
        if self.shift > 0.0 || self.gear == 0 {
            0.0
        } else {
            ((rpm - BITE_RPM) / (FULL_BITE_RPM - BITE_RPM)).clamp(0.0, 1.0)
        }
    }

    /// The rollers' load at the rear wheels (N·m), while they turn.
    fn road_load(&self) -> f32 {
        if self.wheel <= 0.0 {
            return 0.0;
        }
        let v = self.wheel * TYRE_RADIUS;
        (ROLLING + DRAG * v * v) * TYRE_RADIUS
    }

    /// The wheels roll on against the road load alone.
    pub fn coast(&mut self, dt: f32) {
        self.shift = (self.shift - dt).max(0.0);
        self.clutch = 0.0;
        self.locked = false;
        self.wheel = (self.wheel - self.road_load() / WHEEL_INERTIA * dt).max(0.0);
    }

    /// Steps the engine and the wheels together. `net` is the engine's torque less its losses, as rpm/s of free
    /// revving; `running` says the engine is firing (otherwise the clutch stays open). Returns the new engine speed.
    pub fn step(&mut self, rpm: f32, net: f32, running: bool, dt: f32) -> f32 {
        let capacity = if running { CLUTCH_CAPACITY * self.engagement(rpm) } else { 0.0 };
        if capacity <= 0.0 {
            self.coast(dt);
            return (rpm + net * dt).max(0.0);
        }
        self.shift = (self.shift - dt).max(0.0);
        let torque = net * NM_PER_RPM_S;
        let load = self.road_load();
        let g = overall_ratio(self.gear);
        let reflected = WHEEL_INERTIA / (g * g * EFFICIENCY);
        let engine = rpm * RPM;
        if self.locked {
            let alpha = (torque - load / (g * EFFICIENCY)) / (ENGINE_INERTIA + reflected);
            let through = torque - ENGINE_INERTIA * alpha;
            if through.abs() <= capacity {
                self.clutch = through;
                let w = (engine + alpha * dt).max(0.0);
                self.wheel = w / g;
                return w / RPM;
            }
            self.locked = false;
        }
        // Slipping: the clutch passes all it can from the faster side to the slower one.
        let slip = engine - self.wheel * g;
        let through = capacity * slip.signum();
        let engine = (engine + (torque - through) / ENGINE_INERTIA * dt).max(0.0);
        self.wheel = (self.wheel + (through * g * EFFICIENCY - load) / WHEEL_INERTIA * dt).max(0.0);
        self.clutch = through;
        if slip == 0.0 || (engine - self.wheel * g).signum() != slip.signum() {
            // The two sides met this step: lock them at the speed that keeps their momentum.
            let w = (ENGINE_INERTIA * engine + reflected * self.wheel * g) / (ENGINE_INERTIA + reflected);
            self.wheel = w / g;
            self.locked = true;
            return w / RPM;
        }
        engine / RPM
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn six_close_ratios_from_about_115_to_about_285_km_h_at_the_limiter() {
        for gear in 2..=GEARS {
            assert!(overall_ratio(gear) < overall_ratio(gear - 1));
        }
        let first = speed_at(1, LIMIT_RPM);
        let sixth = speed_at(GEARS, LIMIT_RPM);
        assert!((100.0..125.0).contains(&first), "1st: {first} km/h");
        assert!((270.0..300.0).contains(&sixth), "6th: {sixth} km/h");
    }

    #[test]
    fn every_gear_pair_shares_one_centre_distance() {
        assert!(GEAR_TEETH.iter().all(|(lay, out)| lay + out == 58));
    }

    #[test]
    fn shifts_through_neutral_and_the_gears_but_never_into_an_over_rev() {
        let mut drive = Drivetrain::default();
        assert!(!drive.shift_down(), "nothing below neutral");
        for gear in 1..=GEARS {
            drive.shift = 0.0;
            assert!(drive.shift_up());
            assert_eq!(drive.gear, gear);
        }
        drive.shift = 0.0;
        assert!(!drive.shift_up(), "nothing above 6th");
        drive.wheel = 8000.0 * RPM / overall_ratio(3);
        drive.gear = 3;
        assert!(!drive.shift_down(), "2nd would need {} rpm", drive.road_rpm(2));
        assert_eq!(drive.gear, 3);
        drive.wheel = 5000.0 * RPM / overall_ratio(3);
        assert!(drive.shift_down());
        assert!(!drive.shift_down(), "one change at a time");
    }
}
