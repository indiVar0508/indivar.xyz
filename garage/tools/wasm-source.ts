// The hash of everything p60.wasm is built from, so a test can tell when the committed binary is out of date.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const CRATE = resolve(import.meta.dirname, '../crates/p60');
export const HASH_FILE = join(CRATE, 'wasm-source.sha256');

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]));

export function wasmSourceHash(): string {
  const hash = createHash('sha256');
  for (const file of [join(CRATE, 'Cargo.toml'), join(CRATE, 'Cargo.lock'), ...files(join(CRATE, 'src')).sort()]) {
    hash.update(relative(CRATE, file)).update('\0').update(readFileSync(file)).update('\0');
  }
  return hash.digest('hex');
}
