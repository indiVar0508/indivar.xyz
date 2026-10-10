import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const BASIS_FILES = ['basis_transcoder.js', 'basis_transcoder.wasm'] as const;
const basisDir = fileURLToPath(new URL('../node_modules/three/examples/jsm/libs/basis/', import.meta.url));

// Injects the canonical URL, and ships three's Basis (KTX2) transcoder at a fixed path, `basis/`,
// because KTX2Loader expects both files side by side under their original names.
export function garagePlugin({ canonical }: { canonical: string }): Plugin {
  return {
    name: 'garage',
    transformIndexHtml: (html) => html.replace('__CANONICAL__', canonical),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        const file = BASIS_FILES.find((name) => path.endsWith(`/basis/${name}`));
        if (!file) return next();
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(readFileSync(basisDir + file));
      });
    },
    generateBundle() {
      for (const file of BASIS_FILES) {
        this.emitFile({ type: 'asset', fileName: `basis/${file}`, source: readFileSync(basisDir + file) });
      }
    },
  };
}
