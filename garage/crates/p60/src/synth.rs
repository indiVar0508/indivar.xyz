//! A physically informed flat-plane V8, synthesized sample by sample.
//!
//! Each cylinder fires in turn. Its combustion sizes the blowdown pulse that leaves when its exhaust valve opens,
//! and each bank's pulses run down that bank's own pipes: short comb-filter waveguides for the primaries and the
//! tailpipe. Because a flat-plane crank alternates banks, each bank hears evenly spaced pulses, like a four-cylinder,
//! which is where the wail comes from. Intake suction rings the airbox and pulls rush through the restrictors; the
//! valvetrain ticks; the block rings; the starter whines and chugs on each compression; unburned fuel pops in the
//! exhaust on the overrun and at the limiter.

use crate::engine::{Engine, Status, LIMIT_RPM};
use crate::timing::{bank, fire_angle, valve_events, CYLINDERS};
use core::f32::consts::TAU;

pub const MAX_FRAMES: usize = 1024;
const DELAY: usize = 2048;

/// Crank degrees a blowdown pulse lasts, and where it peaks within that.
const BLOWDOWN_WIDTH: f32 = 160.0;
const BLOWDOWN_PEAK: f32 = 0.08;
/// The valve opening sets a floor on how fast the gas leaves, so at low rpm a pulse lasts at most this long.
const BLOWDOWN_SECONDS: f32 = 0.006;
const SUCTION_WIDTH: f32 = 200.0;
/// Hot exhaust gas, m/s.
const EXHAUST_SOUND_SPEED: f32 = 480.0;

const EXHAUST_GAIN: f32 = 2.4;
const INTAKE_GAIN: f32 = 0.5;
const OUTPUT_GAIN: f32 = 1.1;

struct Rng(u32);

impl Rng {
    fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
    /// Uniform in [0, 1).
    fn unit(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / (1u32 << 24) as f32
    }
    /// Uniform in [-1, 1).
    fn noise(&mut self) -> f32 {
        self.unit() * 2.0 - 1.0
    }
    /// Roughly normal, unit variance.
    fn gauss(&mut self) -> f32 {
        self.noise() + self.noise() + self.noise()
    }
}

#[derive(Clone, Copy, Default)]
struct Pulse {
    phase: f32,
    amp: f32,
}

/// A delay-line resonator: what a pipe does to a pulse that reflects back and forth along it.
struct Pipe {
    buf: [f32; DELAY],
    at: usize,
    delay: usize,
    feedback: f32,
    damp: f32,
    lowpass: f32,
}

impl Pipe {
    fn new(sample_rate: f32, metres: f32, feedback: f32, damping_hz: f32) -> Self {
        let delay = ((2.0 * metres / EXHAUST_SOUND_SPEED) * sample_rate).round().clamp(1.0, (DELAY - 1) as f32) as usize;
        Self { buf: [0.0; DELAY], at: 0, delay, feedback, damp: one_pole(damping_hz, sample_rate), lowpass: 0.0 }
    }
    fn tick(&mut self, x: f32) -> f32 {
        let back = self.buf[(self.at + DELAY - self.delay) % DELAY];
        self.lowpass += (back - self.lowpass) * self.damp;
        let y = x + self.feedback * self.lowpass;
        self.buf[self.at] = y;
        self.at = (self.at + 1) % DELAY;
        y
    }
}

fn one_pole(cutoff: f32, sample_rate: f32) -> f32 {
    1.0 - (-TAU * cutoff / sample_rate).exp()
}

#[derive(Clone, Copy)]
struct Biquad {
    b: [f32; 3],
    a: [f32; 2],
    z: [f32; 2],
}

impl Biquad {
    /// Band-pass with 0 dB at the centre.
    fn bandpass(freq: f32, q: f32, sample_rate: f32) -> Self {
        let w = TAU * freq / sample_rate;
        let alpha = w.sin() / (2.0 * q);
        let a0 = 1.0 + alpha;
        Self { b: [alpha / a0, 0.0, -alpha / a0], a: [-2.0 * w.cos() / a0, (1.0 - alpha) / a0], z: [0.0; 2] }
    }
    fn tick(&mut self, x: f32) -> f32 {
        let y = self.b[0] * x + self.z[0];
        self.z[0] = self.b[1] * x - self.a[0] * y + self.z[1];
        self.z[1] = self.b[2] * x - self.a[1] * y;
        y
    }
}

/// Did the crank pass `event` going from `from` to `to` (with `to` possibly wrapped past 720)?
fn crossed(from: f32, to: f32, event: f32) -> bool {
    if to >= from {
        from < event && event <= to
    } else {
        event > from || event <= to
    }
}

/// A blowdown pulse's shape over its width: a sharp rise, then a long decay.
fn blowdown(x: f32) -> f32 {
    let u = x / BLOWDOWN_PEAK;
    u * (1.0 - u).exp()
}

struct Events {
    fire: f32,
    exhaust_opens: f32,
    exhaust_closes: f32,
    intake_opens: f32,
    intake_closes: f32,
}

pub struct Synth {
    dt: f32,
    pub engine: Engine,
    rng: Rng,
    events: [Events; CYLINDERS],
    /// Each cylinder's own small difference in how hard it burns.
    bias: [f32; CYLINDERS],
    combustion: [f32; CYLINDERS],
    blowdown: [Pulse; CYLINDERS],
    suction: [Pulse; CYLINDERS],
    pops: [Pulse; 2],
    primaries: [Pipe; 2],
    tailpipes: [Pipe; 2],
    muffle: [f32; 2],
    muffle_coeff: f32,
    radiated: [f32; 2],
    airbox: Biquad,
    rush: Biquad,
    tick_tone: Biquad,
    ring: [Biquad; 2],
    pop_tone: Biquad,
    starter_tone: Biquad,
    tick: f32,
    tick_decay: f32,
    /// Combustion's knock on the block this sample.
    kick: f32,
    pop_decay: f32,
    starter: f32,
    starter_phase: f32,
    dc_in: [f32; 2],
    dc_out: [f32; 2],
    level: f32,
    /// Left channel in [0, MAX_FRAMES), right in [MAX_FRAMES, 2 * MAX_FRAMES).
    pub out: [f32; 2 * MAX_FRAMES],
}

impl Synth {
    pub fn new(sample_rate: f32, seed: u32) -> Self {
        let mut rng = Rng(seed.max(1));
        let events = core::array::from_fn(|i| {
            let cyl = i + 1;
            let (exhaust_opens, exhaust_closes) = valve_events(cyl, true);
            let (intake_opens, intake_closes) = valve_events(cyl, false);
            Events { fire: fire_angle(cyl), exhaust_opens, exhaust_closes, intake_opens, intake_closes }
        });
        let bias = core::array::from_fn(|_| 1.0 + 0.06 * rng.noise());
        Self {
            dt: 1.0 / sample_rate,
            engine: Engine::new(),
            rng,
            events,
            bias,
            combustion: [0.0; CYLINDERS],
            blowdown: [Pulse::default(); CYLINDERS],
            suction: [Pulse::default(); CYLINDERS],
            pops: [Pulse::default(); 2],
            // Illustrative lengths: the banks' pipes differ a little, as real ones do.
            primaries: [Pipe::new(sample_rate, 0.74, -0.35, 3200.0), Pipe::new(sample_rate, 0.79, -0.35, 3200.0)],
            tailpipes: [Pipe::new(sample_rate, 2.0, -0.55, 2400.0), Pipe::new(sample_rate, 2.15, -0.55, 2400.0)],
            muffle: [0.0; 2],
            muffle_coeff: one_pole(3200.0, sample_rate),
            radiated: [0.0; 2],
            airbox: Biquad::bandpass(210.0, 2.2, sample_rate),
            rush: Biquad::bandpass(1100.0, 0.7, sample_rate),
            tick_tone: Biquad::bandpass(5200.0, 3.0, sample_rate),
            ring: [Biquad::bandpass(1150.0, 14.0, sample_rate), Biquad::bandpass(2430.0, 18.0, sample_rate)],
            pop_tone: Biquad::bandpass(900.0, 0.8, sample_rate),
            starter_tone: Biquad::bandpass(2800.0, 2.0, sample_rate),
            tick: 0.0,
            kick: 0.0,
            tick_decay: (-1.0 / (0.0009 * sample_rate)).exp(),
            pop_decay: (-1.0 / (0.014 * sample_rate)).exp(),
            starter: 0.0,
            starter_phase: 0.0,
            dc_in: [0.0; 2],
            dc_out: [0.0; 2],
            level: 0.0,
            out: [0.0; 2 * MAX_FRAMES],
        }
    }

    pub fn start(&mut self) {
        let catch_after = 0.55 + 0.35 * self.rng.unit();
        self.engine.start(catch_after);
    }

    pub fn render(&mut self, frames: usize) {
        let frames = frames.min(MAX_FRAMES);
        if self.engine.status == Status::Off && self.level < 1e-4 {
            self.level = 0.0;
            self.out[..frames].fill(0.0);
            self.out[MAX_FRAMES..MAX_FRAMES + frames].fill(0.0);
            return;
        }
        for n in 0..frames {
            let (l, r) = self.sample();
            self.out[n] = l;
            self.out[MAX_FRAMES + n] = r;
        }
    }

    fn sample(&mut self) -> (f32, f32) {
        let from = self.engine.angle;
        self.engine.step(self.dt);
        let to = self.engine.angle;
        let moved = (to - from).rem_euclid(720.0);

        if moved > 0.0 {
            for i in 0..CYLINDERS {
                let e = &self.events[i];
                let (fire, ex_open, ex_close, in_open, in_close) = (e.fire, e.exhaust_opens, e.exhaust_closes, e.intake_opens, e.intake_closes);
                if crossed(from, to, fire) {
                    self.fire(i);
                }
                if crossed(from, to, ex_open) {
                    self.blowdown[i] = Pulse { phase: 0.0, amp: 0.05 + self.combustion[i] };
                    self.maybe_pop(i);
                }
                if crossed(from, to, in_open) {
                    self.suction[i] = Pulse { phase: 0.0, amp: 0.15 + 0.85 * self.engine.effective.sqrt() };
                }
                if crossed(from, to, ex_close) || crossed(from, to, in_close) {
                    self.tick = 0.012 + 0.01 * self.rng.unit();
                }
            }
        }

        // Exhaust: each bank's blowdown pulses, plus any pops, through its pipes.
        let mut banks = [0.0f32; 2];
        let blowdown_step = moved.max(BLOWDOWN_WIDTH * self.dt / BLOWDOWN_SECONDS);
        for i in 0..CYLINDERS {
            let p = &mut self.blowdown[i];
            if p.amp > 0.0 {
                banks[bank(i + 1)] += p.amp * blowdown(p.phase / BLOWDOWN_WIDTH);
                p.phase += blowdown_step;
                if p.phase >= BLOWDOWN_WIDTH {
                    p.amp = 0.0;
                }
            }
        }
        for (b, pop) in self.pops.iter_mut().enumerate() {
            if pop.amp > 1e-4 {
                let crack = self.pop_tone.tick(self.rng.noise()) * 3.0;
                let thump = (TAU * 75.0 * pop.phase).sin() * (-pop.phase / 0.035).exp();
                banks[b] += pop.amp * (crack + 0.6 * thump);
                pop.amp *= self.pop_decay;
                pop.phase += self.dt;
            }
        }
        let mut exhaust = [0.0f32; 2];
        for b in 0..2 {
            let y = self.tailpipes[b].tick(self.primaries[b].tick(banks[b]));
            self.muffle[b] += (y - self.muffle[b]) * self.muffle_coeff;
            // Sound radiated from the pipe's end follows the change in flow, which tilts the pulses toward the treble.
            exhaust[b] = (self.muffle[b] - 0.55 * self.radiated[b]) * EXHAUST_GAIN;
            self.radiated[b] = self.muffle[b];
        }

        // Intake: suction rings the airbox and drags rush through the restrictors.
        let mut suction = 0.0f32;
        for p in self.suction.iter_mut() {
            if p.amp > 0.0 {
                let s = (core::f32::consts::PI * p.phase / SUCTION_WIDTH).sin();
                suction -= p.amp * s * s;
                p.phase += moved;
                if p.phase >= SUCTION_WIDTH {
                    p.amp = 0.0;
                }
            }
        }
        let flow = (self.engine.rpm / LIMIT_RPM).min(1.2) * self.engine.effective.powf(0.7);
        let rush = self.rush.tick(self.rng.noise() * flow * (0.5 + 0.9 * -suction));
        let intake = (self.airbox.tick(suction) * 2.5 + rush * 0.25) * INTAKE_GAIN;

        // Valvetrain ticks and block ring.
        let click = self.tick_tone.tick(self.rng.noise() * self.tick);
        self.tick *= self.tick_decay;
        let ring = self.ring[0].tick(self.kick * 0.5) + self.ring[1].tick(self.kick * 0.3);
        self.kick = 0.0;

        // Starter: a geared whine whose load swells on each compression.
        let cranking = self.engine.status == Status::Cranking;
        self.starter += ((if cranking { 1.0 } else { 0.0 }) - self.starter) * (self.dt / 0.04).min(1.0);
        let mut starter = 0.0;
        if self.starter > 1e-3 {
            self.starter_phase = (self.starter_phase + self.engine.rpm.max(120.0) * 2.2 * self.dt).fract();
            let ph = TAU * self.starter_phase;
            let whine = ph.sin() + 0.5 * (2.0 * ph).sin() + 0.3 * (3.0 * ph).sin();
            let load = 1.0 - 0.5 * (4.0 * self.engine.angle.to_radians()).sin().max(0.0);
            starter = self.starter * (0.04 * whine * load + 0.03 * self.starter_tone.tick(self.rng.noise()));
        }

        let common = intake + click + ring * 0.06 + starter;
        let left = exhaust[0] * 0.65 + exhaust[1] * 0.35 + common;
        let right = exhaust[0] * 0.35 + exhaust[1] * 0.65 + common;

        let audible = self.engine.status != Status::Off || self.engine.rpm > 0.0;
        self.level += ((if audible { 1.0 } else { 0.0 }) - self.level) * (self.dt / 0.05).min(1.0);
        let gain = OUTPUT_GAIN * self.level;
        (self.finish(0, left) * gain, self.finish(1, right) * gain)
    }

    /// Soft saturation, then a DC blocker.
    fn finish(&mut self, channel: usize, x: f32) -> f32 {
        let y = (2.0 * x).tanh() / 2.0;
        let out = y - self.dc_in[channel] + 0.995 * self.dc_out[channel];
        self.dc_in[channel] = y;
        self.dc_out[channel] = out;
        out.clamp(-1.0, 1.0)
    }

    fn fire(&mut self, i: usize) {
        let e = &self.engine;
        if e.status != Status::Running || e.cut || (e.effective < 0.02 && e.rpm > 2200.0) {
            // No spark (the limiter) or no fuel (cut off on the overrun): the cylinder only pumps.
            self.combustion[i] = 0.0;
            return;
        }
        let idle = e.idleness();
        let load = 0.12 + 0.88 * e.effective.powf(0.75);
        let mut burn = load * self.bias[i] * (1.0 + (0.05 + 0.22 * idle) * self.rng.gauss());
        let catching = e.elapsed < 0.35;
        if self.rng.unit() < if catching { 0.3 } else { 0.012 * idle } {
            burn *= 0.2;
        }
        let burn = burn.max(0.0);
        self.combustion[i] = burn;
        self.kick = burn;
    }

    fn maybe_pop(&mut self, i: usize) {
        let e = &self.engine;
        if e.status != Status::Running || self.combustion[i] > 0.0 {
            return;
        }
        let chance = if e.cut {
            0.35
        } else if e.overrun >= 0.0 && e.overrun < 1.6 && e.rpm > 2200.0 {
            0.16 * (e.rpm / 6000.0).min(1.0)
        } else {
            0.0
        };
        if self.rng.unit() < chance {
            let b = bank(i + 1);
            self.pops[b] = Pulse { phase: 0.0, amp: 0.5 + 0.6 * self.rng.unit() };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: f32 = 48_000.0;

    fn render_seconds(synth: &mut Synth, seconds: f32, left: &mut Vec<f32>) {
        for _ in 0..(seconds * RATE / 128.0) as usize {
            synth.render(128);
            left.extend_from_slice(&synth.out[..128]);
        }
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
    }

    /// Power at one frequency (Goertzel).
    fn power(x: &[f32], freq: f32) -> f32 {
        let k = TAU * freq / RATE;
        let (mut s1, mut s2) = (0.0f64, 0.0f64);
        for &v in x {
            let s = v as f64 + 2.0 * (k as f64).cos() * s1 - s2;
            s2 = s1;
            s1 = s;
        }
        ((s1 * s1 + s2 * s2 - 2.0 * (k as f64).cos() * s1 * s2) / x.len() as f64) as f32
    }

    #[test]
    fn silent_until_started() {
        let mut synth = Synth::new(RATE, 7);
        synth.render(512);
        assert!(synth.out.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn stays_finite_and_below_full_scale_through_a_start_rev_and_stop() {
        let mut synth = Synth::new(RATE, 7);
        let mut out = Vec::new();
        synth.start();
        render_seconds(&mut synth, 4.0, &mut out);
        synth.engine.set_pedal(1.0);
        render_seconds(&mut synth, 2.0, &mut out);
        synth.engine.set_pedal(0.0);
        render_seconds(&mut synth, 2.0, &mut out);
        synth.engine.stop();
        render_seconds(&mut synth, 2.5, &mut out);
        assert!(out.iter().all(|v| v.is_finite() && v.abs() < 1.0));
        assert_eq!(synth.engine.status, Status::Off);
        assert!(rms(&out[out.len() - 4800..]) < 1e-3, "falls silent once stopped");
    }

    #[test]
    fn revving_is_louder_than_idling() {
        let mut synth = Synth::new(RATE, 3);
        let mut idle = Vec::new();
        synth.start();
        render_seconds(&mut synth, 4.0, &mut idle);
        let idle = idle[idle.len() - 24_000..].to_vec();
        let mut revving = Vec::new();
        synth.engine.set_pedal(1.0);
        render_seconds(&mut synth, 1.5, &mut revving);
        let revving = revving[revving.len() - 24_000..].to_vec();
        assert!(rms(&idle) > 0.01, "idle is audible: {}", rms(&idle));
        assert!(rms(&revving) > 1.5 * rms(&idle), "{} vs {}", rms(&revving), rms(&idle));
    }

    #[test]
    fn steady_running_is_tonal_at_the_firing_frequency() {
        let mut synth = Synth::new(RATE, 5);
        let mut out = Vec::new();
        synth.start();
        render_seconds(&mut synth, 3.0, &mut out);
        synth.engine.set_pedal(0.3);
        render_seconds(&mut synth, 6.0, &mut out);
        let rpm = synth.engine.rpm;
        out.clear();
        render_seconds(&mut synth, 1.0, &mut out);
        assert!((synth.engine.rpm - rpm).abs() < 100.0, "steady: {rpm} → {}", synth.engine.rpm);
        let order = rpm / 60.0;
        let firing = power(&out, 4.0 * order);
        let between = power(&out, 4.25 * order);
        assert!(firing > 10.0 * between, "firing {firing} vs {between} at {rpm} rpm");
    }
}
