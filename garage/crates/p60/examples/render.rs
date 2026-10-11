//! Renders a test drive to a 16-bit stereo WAV for listening and measurement:
//! start and idle, three blips, a run to the limiter, the overrun back to idle, then switch-off.
//! Usage: cargo run --release --example render -- out.wav
use p60::synth::{Synth, MAX_FRAMES};
use std::io::Write;

const RATE: u32 = 48_000;

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| "p60.wav".into());
    let mut synth = Synth::new(RATE as f32, 1);
    let mut samples: Vec<i16> = Vec::new();
    let mut left: Vec<f32> = Vec::new();
    let script: &[(f32, f32)] = &[(0.0, 0.0), (4.0, 1.0), (4.25, 0.0), (5.5, 1.0), (5.75, 0.0), (7.0, 1.0), (7.3, 0.0), (8.5, 1.0), (11.0, 0.0), (15.0, -1.0)];
    let total = 18.0;
    let block = 128;
    let mut t = 0.0f32;
    let mut stats = (0.0f32, 0.0f32, 0usize);
    synth.start();
    while t < total {
        for &(at, pedal) in script {
            if at > t - block as f32 / RATE as f32 && at <= t {
                if pedal < 0.0 { synth.engine.stop() } else { synth.engine.set_pedal(pedal) }
            }
        }
        synth.render(block);
        for n in 0..block {
            let (l, r) = (synth.out[n], synth.out[MAX_FRAMES + n]);
            left.push(l);
            samples.push((l * 32767.0) as i16);
            samples.push((r * 32767.0) as i16);
            stats.0 += l * l;
            stats.1 = stats.1.max(l.abs());
            stats.2 += 1;
        }
        t += block as f32 / RATE as f32;
        if stats.2 >= (RATE / 4) as usize && std::env::args().any(|a| a == "--levels") {
            println!("{t:5.2}s {:6.0} rpm  status {:?}  rms {:.3}  peak {:.3}", synth.engine.rpm, synth.engine.status, (stats.0 / stats.2 as f32).sqrt(), stats.1);
            stats = (0.0, 0.0, 0);
        }
    }
    analyze(&left, RATE as f32, &[(0.1, "cranking"), (3.5, "idle"), (9.4, "limiter"), (11.05, "overrun"), (5.78, "blip")]);
    let data_len = (samples.len() * 2) as u32;
    let mut f = std::fs::File::create(&path).unwrap();
    f.write_all(b"RIFF").unwrap();
    f.write_all(&(36 + data_len).to_le_bytes()).unwrap();
    f.write_all(b"WAVEfmt ").unwrap();
    f.write_all(&16u32.to_le_bytes()).unwrap();
    f.write_all(&1u16.to_le_bytes()).unwrap();
    f.write_all(&2u16.to_le_bytes()).unwrap();
    f.write_all(&RATE.to_le_bytes()).unwrap();
    f.write_all(&(RATE * 4).to_le_bytes()).unwrap();
    f.write_all(&4u16.to_le_bytes()).unwrap();
    f.write_all(&16u16.to_le_bytes()).unwrap();
    f.write_all(b"data").unwrap();
    f.write_all(&data_len.to_le_bytes()).unwrap();
    for s in samples {
        f.write_all(&s.to_le_bytes()).unwrap();
    }
    eprintln!("wrote {path}");
}

/// In-place radix-2 FFT of (re, im).
fn fft(re: &mut [f64], im: &mut [f64]) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2.0 * std::f64::consts::PI / len as f64;
        for start in (0..n).step_by(len) {
            for k in 0..len / 2 {
                let (s, c) = (ang * k as f64).sin_cos();
                let (a, b) = (start + k, start + k + len / 2);
                let (tr, ti) = (re[b] * c - im[b] * s, re[b] * s + im[b] * c);
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
        len <<= 1;
    }
}

/// Prints each segment's level, spectral centroid, strongest peaks and share of energy per band.
pub fn analyze(left: &[f32], rate: f32, segments: &[(f32, &str)]) {
    const N: usize = 16384;
    let bands = [(20.0, 80.0), (80.0, 200.0), (200.0, 500.0), (500.0, 1000.0), (1000.0, 2000.0), (2000.0, 4000.0), (4000.0, 8000.0), (8000.0, 20000.0)];
    for &(at, name) in segments {
        let start = (at * rate) as usize;
        let seg = &left[start..start + N];
        let mut re: Vec<f64> = seg.iter().enumerate().map(|(i, &v)| v as f64 * (0.5 - 0.5 * (std::f64::consts::TAU * i as f64 / N as f64).cos())).collect();
        let mut im = vec![0.0; N];
        fft(&mut re, &mut im);
        let power: Vec<f64> = (0..N / 2).map(|k| re[k] * re[k] + im[k] * im[k]).collect();
        let freq = |k: usize| k as f64 * rate as f64 / N as f64;
        let total: f64 = power.iter().sum();
        let centroid: f64 = power.iter().enumerate().map(|(k, p)| freq(k) * p).sum::<f64>() / total;
        let mut order: Vec<usize> = (1..N / 2).collect();
        order.sort_by(|&a, &b| power[b].total_cmp(&power[a]));
        let peaks: Vec<String> = order.iter().take(6).map(|&k| format!("{:.0}", freq(k))).collect();
        let rms = (seg.iter().map(|v| (v * v) as f64).sum::<f64>() / N as f64).sqrt();
        let shares: Vec<String> = bands.iter().map(|&(lo, hi)| {
            let e: f64 = (0..N / 2).filter(|&k| freq(k) >= lo && freq(k) < hi).map(|k| power[k]).sum();
            format!("{lo:.0}-{hi:.0}:{:.1}%", 100.0 * e / total)
        }).collect();
        println!("{name:9} rms {rms:.3} centroid {centroid:5.0} Hz peaks {}\n          {}", peaks.join(","), shares.join(" "));
    }
}
