//! Engine speed: throttle, starter, idle control, the rev limiter, and the losses that slow it down.
//! Rates are in rpm per second. The numbers are tuned to feel like a light race V8, not taken from a source.

use crate::timing::wrap720;

/// Illustrative: race engines idle high. No source gives the P60B40's idle.
pub const IDLE_RPM: f32 = 1500.0;
/// Illustrative: peak power is quoted at 7,500 rpm, but no source gives the limiter.
pub const LIMIT_RPM: f32 = 8500.0;
const LIMIT_RESUME: f32 = LIMIT_RPM - 250.0;
const CRANKING_RPM: f32 = 230.0;
/// Torque at full throttle, as rpm/s of free-revving acceleration before losses.
const TORQUE_GAIN: f32 = 23_700.0;
const FRICTION: f32 = 900.0;
const VISCOUS: f32 = 0.45;
const PUMPING: f32 = 0.3;
const IDLE_GAIN: f32 = 0.0004;
const FLARE_RPM: f32 = 1300.0;

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

    /// Stops dead, for when sound is switched off.
    pub fn reset(&mut self) {
        *self = Self { angle: self.angle, ..Self::new() };
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
            }
            Status::Cranking => {
                self.effective = 0.0;
                self.rpm += (CRANKING_RPM - self.rpm) * (dt / 0.12).min(1.0);
                // Each compression stroke slows the starter: four per turn.
                speed = self.rpm * (1.0 + 0.35 * (4.0 * self.angle.to_radians()).sin());
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
                self.effective = self.throttle.max(idle);
                if self.rpm > LIMIT_RPM {
                    self.cut = true;
                } else if self.rpm < LIMIT_RESUME {
                    self.cut = false;
                }
                let drive = if self.cut { 0.0 } else { TORQUE_GAIN * torque(self.rpm) * self.effective };
                self.rpm = (self.rpm + (drive - losses(self.rpm, self.effective)) * dt).max(0.0);
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
                self.rpm = (self.rpm - losses(self.rpm, 0.0) * dt).max(0.0);
                speed = self.rpm;
                if self.rpm < 40.0 {
                    self.status = Status::Off;
                    self.rpm = 0.0;
                    self.elapsed = 0.0;
                }
            }
        }
        self.angle = wrap720(self.angle + speed * 6.0 * dt);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
