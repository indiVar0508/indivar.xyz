//! Engine speed: throttle, starter, idle control, the rev limiter, and the losses that slow it down, with the
//! drivetrain it turns on the rolling road. Rates are in rpm per second. The numbers are tuned to feel like a light
//! race V8, not taken from a source.

use crate::drivetrain::Drivetrain;
use crate::timing::wrap720;

/// Illustrative: race engines idle high. No source gives the P60B40's idle.
pub const IDLE_RPM: f32 = 1500.0;
/// Illustrative: peak power is quoted at 7,500 rpm, but no source gives the limiter.
pub const LIMIT_RPM: f32 = 8500.0;
const LIMIT_RESUME: f32 = LIMIT_RPM - 250.0;
const CRANKING_RPM: f32 = 230.0;
/// Torque at full throttle, as rpm/s of free-revving acceleration before losses.
const TORQUE_GAIN: f32 = 23_700.0;
/// BMW's 2001 release quotes about 480 N·m at about 5,500 rpm: the peak of `torque`.
pub const PEAK_TORQUE: f32 = 480.0;
/// N·m per rpm/s of free revving, which ties the engine's rates to the drivetrain's torques.
pub const NM_PER_RPM_S: f32 = PEAK_TORQUE / TORQUE_GAIN;
const FRICTION: f32 = 900.0;
const VISCOUS: f32 = 0.45;
const PUMPING: f32 = 0.3;
const IDLE_GAIN: f32 = 0.0004;
const FLARE_RPM: f32 = 1300.0;
/// Game turbo kit: extra torque at full boost, and how fast boost builds and falls (seconds).
const BOOST_TORQUE: f32 = 0.4;
const SPOOL_UP: f32 = 0.5;
const SPOOL_DOWN: f32 = 0.3;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Status {
    Off = 0,
    Cranking = 1,
    Running = 2,
    Stopping = 3,
}

/// Normalised torque curve, peaking at 5,500 rpm (where the 480 N·m is quoted) and falling away with the restrictors.
pub fn torque(rpm: f32) -> f32 {
    let x = (rpm - 5500.0) / 2600.0;
    0.62 + 0.38 * (-x * x).exp()
}

fn losses(rpm: f32, throttle: f32) -> f32 {
    if rpm <= 0.0 {
        return 0.0;
    }
    FRICTION + VISCOUS * rpm + PUMPING * rpm * (1.0 - throttle)
}

pub struct Engine {
    pub status: Status,
    pub rpm: f32,
    /// Crank angle in the 720° cycle.
    pub angle: f32,
    /// The pedal, smoothed like a throttle body opening.
    pub throttle: f32,
    /// What the engine actually gets: the pedal or the idle controller, whichever is more.
    pub effective: f32,
    /// The limiter is cutting ignition.
    pub cut: bool,
    /// Seconds in the current status.
    pub elapsed: f32,
    /// Seconds since the throttle snapped shut from high rpm, while it stays shut; negative when not on the overrun.
    pub overrun: f32,
    /// The game turbo kit is fitted. The real P60B40 is naturally aspirated.
    pub turbo: bool,
    /// Turbo boost, 0 to 1.
    pub boost: f32,
    /// Set when the blow-off valve opens, to the boost it dumps; the synthesizer takes it and clears it.
    pub blowoff: f32,
    /// The clutch, gearbox and rear wheels on the rolling road.
    pub drive: Drivetrain,
    blowoff_armed: bool,
    pedal: f32,
    catch_at: f32,
    flare: f32,
    idle_throttle: f32,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine {
    pub fn new() -> Self {
        // The throttle that exactly balances the losses at idle.
        let idle_throttle = (FRICTION + (VISCOUS + PUMPING) * IDLE_RPM) / (TORQUE_GAIN * torque(IDLE_RPM) + PUMPING * IDLE_RPM);
        Self {
            status: Status::Off,
            rpm: 0.0,
            angle: 0.0,
            throttle: 0.0,
            effective: 0.0,
            cut: false,
            elapsed: 0.0,
            overrun: -1.0,
            turbo: false,
            boost: 0.0,
            blowoff: 0.0,
            drive: Drivetrain::default(),
            blowoff_armed: false,
            pedal: 0.0,
            catch_at: 0.7,
            flare: 0.0,
            idle_throttle,
        }
    }

    /// Engages the starter. `catch_after` is how long it cranks before the engine fires.
    pub fn start(&mut self, catch_after: f32) {
        if matches!(self.status, Status::Off | Status::Stopping) {
            self.status = Status::Cranking;
            self.elapsed = 0.0;
            self.catch_at = catch_after;
        }
    }

    /// Cuts ignition and fuel; the engine spins down.
    pub fn stop(&mut self) {
        if matches!(self.status, Status::Cranking | Status::Running) {
            self.status = Status::Stopping;
            self.elapsed = 0.0;
        }
    }

    /// Stops dead, with the rollers and in neutral, for when sound is switched off.
    pub fn reset(&mut self) {
        *self = Self { angle: self.angle, turbo: self.turbo, ..Self::new() };
    }

    pub fn set_pedal(&mut self, pedal: f32) {
        self.pedal = pedal.clamp(0.0, 1.0);
    }

    /// 1 at idle, falling to 0 by 4,000 rpm: how lumpy combustion is.
    pub fn idleness(&self) -> f32 {
        (1.0 - (self.rpm - IDLE_RPM) / 2500.0).clamp(0.0, 1.0)
    }

    pub fn step(&mut self, dt: f32) {
        let tau = if self.pedal > self.throttle { 0.035 } else { 0.07 };
        self.throttle += (self.pedal - self.throttle) * (dt / tau).min(1.0);
        self.elapsed += dt;
        let speed;
        match self.status {
            Status::Off => {
                self.rpm = 0.0;
                self.effective = 0.0;
                speed = 0.0;
                self.drive.coast(dt, true);
            }
            Status::Cranking => {
                self.effective = 0.0;
                self.rpm += (CRANKING_RPM - self.rpm) * (dt / 0.12).min(1.0);
                // Each compression stroke slows the starter: four per turn.
                speed = self.rpm * (1.0 + 0.35 * (4.0 * self.angle.to_radians()).sin());
                self.drive.coast(dt, true);
                if self.elapsed >= self.catch_at {
                    self.status = Status::Running;
                    self.elapsed = 0.0;
                    self.flare = 1.0;
                }
            }
            Status::Running => {
                self.flare *= (-dt / 1.1).exp();
                let target = IDLE_RPM + FLARE_RPM * self.flare;
                let idle = (self.idle_throttle + IDLE_GAIN * (target - self.rpm)).clamp(0.0, 0.6);
                self.effective = self.throttle.max(idle).max(self.drive.blip(self.rpm));
                if self.rpm > LIMIT_RPM {
                    self.cut = true;
                } else if self.rpm < LIMIT_RESUME {
                    self.cut = false;
                }
                let boosted = 1.0 + BOOST_TORQUE * self.boost;
                let drive = if self.cut || self.drive.cutting() { 0.0 } else { TORQUE_GAIN * torque(self.rpm) * self.effective * boosted };
                self.rpm = self.drive.step(self.rpm, drive - losses(self.rpm, self.effective), true, dt);
                // Each firing kicks the crank a little: four per turn, most noticeable at idle.
                speed = self.rpm * (1.0 + 0.015 * self.idleness() * (4.0 * self.angle.to_radians()).sin());
                if self.throttle < 0.05 {
                    if self.overrun < 0.0 && self.rpm > 3500.0 {
                        self.overrun = 0.0;
                    } else if self.overrun >= 0.0 {
                        self.overrun += dt;
                    }
                } else {
                    self.overrun = -1.0;
                }
            }
            Status::Stopping => {
                self.effective = 0.0;
                self.cut = false;
                self.rpm = self.drive.step(self.rpm, -losses(self.rpm, 0.0), false, dt);
                speed = self.rpm;
                if self.rpm < 40.0 {
                    self.status = Status::Off;
                    self.rpm = 0.0;
                    self.elapsed = 0.0;
                }
            }
        }
        self.spool(dt);
        self.angle = wrap720(self.angle + speed * 6.0 * dt);
    }

    /// Boost follows exhaust flow, with lag. Snapping the throttle shut under boost opens the blow-off valve.
    fn spool(&mut self, dt: f32) {
        // Exhaust keeps flowing through the turbine while the limiter cuts the spark.
        let flow = if self.turbo && self.status == Status::Running {
            ((self.rpm / LIMIT_RPM).powf(1.3) * self.effective * 1.6).min(1.0)
        } else {
            0.0
        };
        let tau = if flow > self.boost { SPOOL_UP } else { SPOOL_DOWN };
        self.boost += (flow - self.boost) * (dt / tau).min(1.0);
        if self.pedal > 0.5 {
            self.blowoff_armed = true;
        } else if self.pedal < 0.1 && self.blowoff_armed && self.boost > 0.25 {
            self.blowoff_armed = false;
            self.blowoff = self.boost;
            self.boost *= 0.4;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::drivetrain::{overall_ratio, speed_at};

    const DT: f32 = 1.0 / 1000.0;

    fn run(engine: &mut Engine, seconds: f32) -> (f32, f32) {
        let (mut low, mut high) = (f32::MAX, f32::MIN);
        for _ in 0..(seconds / DT) as usize {
            engine.step(DT);
            low = low.min(engine.rpm);
            high = high.max(engine.rpm);
        }
        (low, high)
    }

    fn idling() -> Engine {
        let mut engine = Engine::new();
        engine.start(0.7);
        run(&mut engine, 5.0);
        engine
    }

    #[test]
    fn cranks_catches_flares_and_settles_to_idle() {
        let mut engine = Engine::new();
        engine.start(0.7);
        run(&mut engine, 0.5);
        assert_eq!(engine.status, Status::Cranking);
        assert!((engine.rpm - CRANKING_RPM).abs() < 30.0);
        let (_, flare) = run(&mut engine, 1.5);
        assert_eq!(engine.status, Status::Running);
        assert!(flare > 2200.0 && flare < 3200.0, "flare {flare}");
        run(&mut engine, 3.0);
        assert!((engine.rpm - IDLE_RPM).abs() < 60.0, "idle {}", engine.rpm);
    }

    #[test]
    fn revs_to_the_limiter_in_well_under_a_second_and_bounces_off_it() {
        let mut engine = idling();
        engine.set_pedal(1.0);
        let mut seconds = 0.0;
        while engine.rpm < 8000.0 {
            engine.step(DT);
            seconds += DT;
            assert!(seconds < 1.0, "too slow: {} rpm after 1 s", engine.rpm);
        }
        assert!(seconds > 0.3, "too fast: {seconds} s");
        run(&mut engine, 0.3);
        let (low, high) = run(&mut engine, 2.0);
        assert!(high < LIMIT_RPM + 100.0 && low > LIMIT_RPM - 600.0, "{low}..{high}");
    }

    #[test]
    fn falls_back_to_idle_without_stalling_and_marks_the_overrun() {
        let mut engine = idling();
        engine.set_pedal(1.0);
        run(&mut engine, 1.0);
        engine.set_pedal(0.0);
        run(&mut engine, 0.3);
        assert!(engine.overrun > 0.0);
        let (low, _) = run(&mut engine, 3.5);
        assert!(low > 1000.0, "dipped to {low}");
        assert!((engine.rpm - IDLE_RPM).abs() < 60.0, "settled at {}", engine.rpm);
        assert!(engine.overrun < 0.0 || engine.rpm < 3500.0);
    }

    #[test]
    fn the_game_turbo_lags_then_boosts_and_blows_off_when_the_throttle_snaps_shut() {
        let mut engine = idling();
        engine.turbo = true;
        engine.set_pedal(1.0);
        run(&mut engine, 0.15);
        assert!(engine.boost < 0.4, "lag: {}", engine.boost);
        run(&mut engine, 1.5);
        assert!(engine.boost > 0.7, "boost: {}", engine.boost);
        engine.set_pedal(0.0);
        run(&mut engine, 0.01);
        assert!(engine.blowoff > 0.7, "blow-off: {}", engine.blowoff);
        assert!(engine.boost < 0.4);
    }

    #[test]
    fn the_turbo_revs_harder_and_the_real_engine_never_boosts() {
        let to_8000 = |turbo: bool| {
            let mut engine = idling();
            engine.turbo = turbo;
            run(&mut engine, 0.5); // a moment to spool at idle, which it can't
            engine.set_pedal(1.0);
            let mut seconds = 0.0;
            while engine.rpm < 8000.0 {
                engine.step(DT);
                seconds += DT;
                if !turbo {
                    assert_eq!(engine.boost, 0.0);
                }
            }
            seconds
        };
        assert!(to_8000(true) < to_8000(false));
    }

    /// Seconds for the engine to climb from `from` to `to` rpm at full throttle.
    fn climb(engine: &mut Engine, from: f32, to: f32) -> f32 {
        engine.set_pedal(1.0);
        while engine.rpm < from {
            engine.step(DT);
        }
        let mut seconds = 0.0;
        while engine.rpm < to {
            engine.step(DT);
            seconds += DT;
            assert!(seconds < 60.0, "stuck at {} rpm", engine.rpm);
        }
        seconds
    }

    /// Idling, then in `gear` and rolling at the road speed that suits `rpm`, with the clutch shut.
    fn rolling(gear: usize, rpm: f32) -> Engine {
        let mut engine = idling();
        engine.drive.gear = gear;
        engine.drive.wheel = rpm * core::f32::consts::PI / 30.0 / overall_ratio(gear);
        engine.drive.locked = true;
        engine.rpm = rpm;
        engine
    }

    #[test]
    fn in_neutral_the_wheels_stay_still_and_it_revs_freely() {
        let mut engine = idling();
        engine.set_pedal(1.0);
        run(&mut engine, 1.0);
        assert!(engine.rpm > 7500.0);
        assert_eq!(engine.drive.wheel, 0.0);
    }

    #[test]
    fn pulls_away_in_first_without_stalling_and_revs_far_slower_than_in_neutral() {
        let free = climb(&mut idling(), 3000.0, 8000.0);
        let mut engine = idling();
        assert!(engine.drive.shift_up());
        engine.set_pedal(1.0);
        let (low, _) = run(&mut engine, 0.5);
        assert!(low > 1000.0, "bogged to {low} rpm");
        let first = climb(&mut engine, 3000.0, 8000.0);
        assert!(first > 4.0 * free, "1st {first} s vs neutral {free} s");
        let top = speed_at(1, engine.rpm);
        assert!((engine.drive.speed_kmh() - top).abs() < 4.0, "{} km/h at {} rpm", engine.drive.speed_kmh(), engine.rpm);
    }

    #[test]
    fn a_higher_gear_revs_more_slowly() {
        let second = climb(&mut rolling(2, 4000.0), 4000.0, 6000.0);
        let fourth = climb(&mut rolling(4, 4000.0), 4000.0, 6000.0);
        assert!(fourth > 1.5 * second, "4th {fourth} s vs 2nd {second} s");
    }

    #[test]
    fn an_upshift_drops_the_revs_to_suit_the_road_speed() {
        let mut engine = rolling(2, 7000.0);
        engine.set_pedal(1.0);
        run(&mut engine, 0.05);
        assert!(engine.drive.shift_up());
        run(&mut engine, 0.4);
        let suits = engine.drive.road_rpm(3);
        assert!((engine.rpm - suits).abs() < 0.03 * suits, "{} rpm, road says {suits}", engine.rpm);
        assert!(engine.rpm < 7000.0 * overall_ratio(3) / overall_ratio(2) + 600.0);
    }

    #[test]
    fn a_downshift_blips_up_to_the_lower_gear_but_one_that_would_over_rev_is_refused() {
        let mut engine = rolling(3, 8000.0);
        assert!(!engine.drive.shift_down());
        assert_eq!(engine.drive.gear, 3);
        let mut engine = rolling(3, 4500.0);
        assert!(engine.drive.shift_down());
        run(&mut engine, 0.4);
        let suits = engine.drive.road_rpm(2);
        assert!(suits > 5000.0 && (engine.rpm - suits).abs() < 0.03 * suits, "{} rpm, road says {suits}", engine.rpm);
    }

    #[test]
    fn lifting_off_in_gear_slows_the_car_more_than_coasting_in_neutral() {
        let mut braking = rolling(3, 7000.0);
        let mut coasting = rolling(3, 7000.0);
        coasting.drive.gear = 0;
        let start = braking.drive.speed_kmh();
        run(&mut braking, 2.0);
        run(&mut coasting, 2.0);
        assert!(braking.drive.speed_kmh() < coasting.drive.speed_kmh() - 3.0, "{} vs {} from {start}", braking.drive.speed_kmh(), coasting.drive.speed_kmh());
        assert!(braking.drive.clutch < 0.0, "engine braking");
    }

    #[test]
    fn coasting_in_neutral_rolls_on_but_the_rollers_brake_to_a_stop_once_the_engine_stops() {
        let mut coasting = rolling(4, 5000.0);
        coasting.drive.gear = 0;
        let start = coasting.drive.wheel;
        run(&mut coasting, 3.0);
        assert!(coasting.drive.wheel > 0.8 * start, "coasts on: {} of {start}", coasting.drive.wheel);
        let mut engine = rolling(4, 5000.0);
        engine.stop();
        run(&mut engine, 3.0);
        assert_eq!(engine.status, Status::Off);
        assert!(engine.drive.wheel < 0.6 * start, "braking: {} of {start}", engine.drive.wheel);
        run(&mut engine, 8.0);
        assert_eq!(engine.drive.wheel, 0.0);
        engine.reset();
        assert_eq!((engine.drive.gear, engine.drive.wheel), (0, 0.0));
    }

    /// The engine and gearbox's mount torque (N·m) after `seconds` at full throttle, rolling in `gear` at `rpm`.
    fn pulling(gear: usize, rpm: f32, seconds: f32) -> Engine {
        let mut engine = rolling(gear, rpm);
        engine.set_pedal(1.0);
        run(&mut engine, seconds);
        engine
    }

    #[test]
    fn the_mounts_carry_the_torque_the_gearbox_sends_on_so_low_gears_lean_hardest() {
        // Revving in neutral, the mounts carry only what spins up the crank: the engine's own torque.
        let mut free = idling();
        free.set_pedal(1.0);
        while free.rpm < 5000.0 {
            free.step(DT);
        }
        let neutral = free.drive.mount;
        assert!(neutral > 250.0 && neutral < PEAK_TORQUE, "neutral {neutral} N·m");
        // In gear the gearbox multiplies it on its way to the propshaft, and its case takes the reaction.
        let first = pulling(1, 5000.0, 0.1).drive.mount;
        let sixth = pulling(6, 5000.0, 0.1).drive.mount;
        assert!(first > 2.0 * neutral, "1st {first} N·m vs neutral {neutral}");
        assert!((sixth - neutral).abs() < 0.2 * neutral, "6th {sixth} N·m vs neutral {neutral}");
    }

    #[test]
    fn an_upshift_unloads_the_mounts_until_the_next_gear_takes_up_the_drive() {
        let mut engine = pulling(2, 7000.0, 0.1);
        let second = engine.drive.mount;
        assert!(engine.drive.shift_up());
        let mut least = f32::MAX;
        for _ in 0..(0.1 / DT) as usize {
            engine.step(DT);
            least = least.min(engine.drive.mount);
        }
        assert!(least < 0.2 * second, "during the change {least} N·m vs {second} in 2nd");
        run(&mut engine, 0.4);
        // 3rd multiplies less, but the change drops the revs back toward the torque peak, so it can carry about as much.
        let third = engine.drive.mount;
        assert!(third > 0.6 * second, "3rd {third} N·m vs 2nd {second}");
    }

    #[test]
    fn engine_braking_pulls_the_mounts_the_other_way_and_a_stopped_engine_rests_on_them() {
        let mut engine = rolling(3, 7000.0);
        run(&mut engine, 0.5);
        assert!(engine.drive.mount < -50.0, "overrun {} N·m", engine.drive.mount);
        engine.stop();
        run(&mut engine, 3.0);
        assert_eq!(engine.status, Status::Off);
        assert_eq!(engine.drive.mount, 0.0);
    }

    #[test]
    fn stops_and_resets() {
        let mut engine = idling();
        engine.stop();
        run(&mut engine, 2.0);
        assert_eq!(engine.status, Status::Off);
        assert_eq!(engine.rpm, 0.0);
        let mut engine = idling();
        engine.reset();
        assert_eq!((engine.status, engine.rpm), (Status::Off, 0.0));
    }
}
