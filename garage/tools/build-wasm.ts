// Builds public/wasm/p60.wasm from the Rust crate in crates/p60 (the engine's timing, kinematics and sound), and
// records the hash of its sources so `npm test` notices a stale binary.
// Needs Rust with the wasm32-unknown-unknown target: rustup target add wasm32-unknown-unknown
// Usage: npm run build:wasm
import { execFileSync } from 'node:child_process';
import { copyFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CRATE, HASH_FILE, wasmSourceHash } from './wasm-source.ts';

const output = resolve(import.meta.dirname, '../public/wasm/p60.wasm');
execFileSync('cargo', ['test', '--release', '--quiet'], { cwd: CRATE, stdio: 'inherit' });
execFileSync('cargo', ['build', '--release', '--lib', '--target', 'wasm32-unknown-unknown'], { cwd: CRATE, stdio: 'inherit' });
copyFileSync(join(CRATE, 'target/wasm32-unknown-unknown/release/p60.wasm'), output);
writeFileSync(HASH_FILE, `${wasmSourceHash()}\n`);
console.log(`p60.wasm: ${(statSync(output).size / 1024).toFixed(1)} KB`);
