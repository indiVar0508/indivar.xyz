// Fails when the garage's JavaScript exceeds the gzip budget (spec §7).
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 450;
const dir = resolve(import.meta.dirname, '../dist/assets');
const sizes = readdirSync(dir)
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, kb: gzipSync(readFileSync(join(dir, file))).length / 1024 }));
const total = sizes.reduce((sum, entry) => sum + entry.kb, 0);
for (const { file, kb } of sizes) console.log(`${file}: ${kb.toFixed(0)} KB gzip`);
if (total > BUDGET_KB) {
  console.error(`JavaScript is ${total.toFixed(0)} KB gzip; the budget is ${BUDGET_KB} KB.`);
  process.exit(1);
}
console.log(`JavaScript total: ${total.toFixed(0)} KB gzip (budget ${BUDGET_KB} KB).`);
