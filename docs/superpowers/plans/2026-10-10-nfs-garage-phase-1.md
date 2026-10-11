# NFS Most Wanted Garage, Phase 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `indivar.xyz/garage/`, a realistic 3D garage where visitors orbit the BMW M3 GTR (E46) from *Need for Speed: Most Wanted*, click hotspots, pop the hood, and read sourced facts about its P60B40 V8.

**Architecture:** A Vite + React Three Fiber app in `garage/`, ignored by Jekyll, built in the same GitHub Actions run and copied into `_site/garage/`. The Sketchfab model is normalized once in headless Blender and compressed with glTF-Transform (KTX2 textures and meshopt geometry, both decoded in the browser by WebAssembly). The garage, the engine, and the audio are generated in code. A small zustand store holds the view state machine. Pure modules (content, view reducer, shots, geometry, audio schedules) carry the unit tests; the visuals are checked with screenshots.

**Tech Stack:** React 19.3, three 0.186, @react-three/fiber 9.8, @react-three/drei 10.7, @react-three/postprocessing 3.2 (postprocessing 6.39), zustand 5, TypeScript 6, Vite 8, Vitest 5, Playwright 1.64, glTF-Transform 4.5, meshoptimizer 1.3, KTX-Software 4.4.2, Blender 5.2, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-10-nfs-garage-design.md`

## Global Constraints

- Node ≥ 24 locally and in CI. Tools in `garage/tools/*.ts` run directly with `node` (built-in type stripping), so they use only erasable TypeScript and import local modules with explicit `.ts` extensions.
- The app is served at `/garage/` and must also work under a preview baseurl (`/preview/garage/`): Vite `base: './'`; every runtime URL is relative (`import.meta.env.BASE_URL`).
- No runtime requests to third-party hosts: fonts come from `@fontsource`, the Basis transcoder ships in `dist/basis/`, the meshopt decoder is bundled, there is no HDRI, and Draco is off.
- Model budget: `public/models/m3-gtr.glb` ≤ 12 MB, ≤ 150,000 triangles, every texture KTX2.
- JavaScript budget: ≤ 450 KB gzip for `dist/assets/*.js`.
- Exactly one `<h1>`, and it is static in `garage/index.html`. React never renders an `<h1>`.
- Disclaimer text, verbatim: "Unofficial, non-commercial fan project. Not affiliated with or endorsed by Electronic Arts or BMW."
- Credit text, verbatim: This work is based on "BMW M3 E46 GTR" (https://sketchfab.com/3d-models/bmw-m3-e46-gtr-7a0e538dd533481da79a6dcc0fc05213) by Flamestroke (https://sketchfab.com/Flamestroke) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- Every `verified` fact has a source. `game-lore` facts live in the "In the game" tab and cite a game source. `illustrative` facts may have no source.
- No EA audio, logos, fonts, or UI art. All music is synthesized and original.
- Copy: plain sentences, no exclamation marks, sentence case except the uppercase HUD styling done in CSS.
- Car space: meters, +Y up, car faces +Z, car's left is +X, tyres touch y = 0.

## Review Focus

These five conditions are implied by the spec, but no unit test touches them. Each one has a test in the task that owns it.

1. **Phone screens (390 × 844):** the info panel must leave the top half of the screen for the car, and every control stays reachable. Test: Task 12, "phone layout keeps the car visible".
2. **No WebGL 2:** the visitor sees an explanation and a link home, not a blank page. Test: Task 12, "falls back without WebGL 2".
3. **An unplayable file for "Play my own track":** a visible message, the controls still work, and no unhandled rejection. Code: Task 11. Test: Task 12, "rejects a file it can't play".
4. **`prefers-reduced-motion`:** no idle camera drift, and the hood opens without animation. Code: Tasks 6 and 8. Test: Task 12, "respects reduced motion".
5. **Deploying under a subpath:** the model, the Basis transcoder, and the JavaScript all load from `/preview/garage/`. Test: Task 12, "runs under the preview baseurl".

---

### Task 1: Scaffold the garage app inside the site

**Files:**
- Modify: `_config.yml` (the `exclude:` list)
- Modify: `.gitignore`
- Create: `garage/package.json`, `garage/tsconfig.json`, `garage/vite.config.ts`, `garage/index.html`
- Create: `garage/build/siteUrl.ts`, `garage/build/siteUrl.test.ts`, `garage/build/garagePlugin.ts`
- Create: `garage/public/favicon.svg`
- Create: `garage/src/main.tsx`, `garage/src/App.tsx`, `garage/src/qa.ts`, `garage/src/webgl.ts`, `garage/src/ui/Fallback.tsx`, `garage/src/ui/base.css`

**Interfaces:**
- Produces: `garageCanonical(configYaml: string, baseOverride?: string): string`; `readYamlScalar(yaml: string, key: string): string | undefined`; `garagePlugin({ canonical }): Plugin`; `QA: boolean`; `FORCED_QUALITY: string | null`; `supportsWebGL2(): boolean`; a static `index.html` containing `__CANONICAL__`, `<main id="main">`, one `<h1>`, `<div id="app">`, and the credits footer.

- [ ] **Step 1: Keep Jekyll away from the garage before any `npm install`**

In `_config.yml`, add `garage` and `scripts` to `exclude`:

```yaml
exclude:
  - Gemfile
  - Gemfile.lock
  - README.md
  - docs
  - garage
  - scripts
  - test_site.rb
  - vendor
  - posts
```

Append to `.gitignore`:

```gitignore
garage/node_modules/
garage/dist/
garage/assets-src/
garage/tools/bin/
garage/test-results/
garage/playwright-report/
```

A running `jekyll serve` doesn't reload `_config.yml`. Ask the owner to restart it now; otherwise it copies `garage/node_modules` into `_site`.

- [ ] **Step 2: Create `garage/package.json`**

```json
{
  "name": "indivar-garage",
  "private": true,
  "version": "0.1.0",
  "description": "Unofficial fan garage for the BMW M3 GTR (E46) from Need for Speed: Most Wanted (2005), served at indivar.xyz/garage/.",
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@fontsource/pt-mono": "^5.3.0",
    "@fontsource/saira-condensed": "^5.3.0",
    "@react-three/drei": "^10.7.9",
    "@react-three/fiber": "^9.8.1",
    "@react-three/postprocessing": "^3.2.0",
    "postprocessing": "^6.39.5",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "three": "^0.186.1",
    "zustand": "^5.0.15"
  },
  "devDependencies": {
    "@types/node": "^24.19.2",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@types/three": "^0.186.0",
    "@vitejs/plugin-react": "^6.1.2",
    "typescript": "^6.0.3",
    "vite": "^8.3.4",
    "vitest": "^5.0.3"
  }
}
```

Run: `cd garage && npm install`
Expected: `package-lock.json` created, no peer-dependency errors.

- [ ] **Step 3: Create `garage/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "build", "tools", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Write the failing test for the canonical URL**

`garage/build/siteUrl.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { garageCanonical, readYamlScalar } from './siteUrl.ts';

const realConfig = readFileSync(new URL('../../_config.yml', import.meta.url), 'utf8');

describe('garageCanonical', () => {
  it('uses the site url and baseurl from _config.yml', () => {
    expect(garageCanonical(realConfig)).toBe('https://indivar.xyz/garage/');
  });

  it('lets a preview build override the baseurl', () => {
    expect(garageCanonical(realConfig, '/preview')).toBe('https://indivar.xyz/preview/garage/');
  });

  it('ignores quotes, trailing slashes and comments', () => {
    const yaml = 'title: x\nurl: "https://example.com/"\nbaseurl: \'/repo/\' # project site\n';
    expect(garageCanonical(yaml)).toBe('https://example.com/repo/garage/');
  });

  it('does not read baseurl when asked for url', () => {
    expect(readYamlScalar('baseurl: "/b"\n', 'url')).toBeUndefined();
  });

  it('fails loudly without a url', () => {
    expect(() => garageCanonical('title: x\n')).toThrow('_config.yml has no url');
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `cd garage && npx vitest run build/siteUrl.test.ts`
Expected: FAIL, cannot resolve `./siteUrl.ts`.

- [ ] **Step 6: Implement `garage/build/siteUrl.ts`**

```ts
// Reads `url` and `baseurl` from the Jekyll config so the garage's canonical link matches the site's.

export function readYamlScalar(yaml: string, key: string): string | undefined {
  const match = yaml.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!match) return undefined;
  const value = match[1].replace(/\s+#.*$/, '').trim();
  return value.replace(/^(['"])(.*)\1$/, '$2');
}

export function garageCanonical(configYaml: string, baseOverride?: string): string {
  const url = readYamlScalar(configYaml, 'url');
  if (!url) throw new Error('_config.yml has no url');
  const base = (baseOverride ?? readYamlScalar(configYaml, 'baseurl') ?? '').replace(/\/+$/, '');
  return `${url.replace(/\/+$/, '')}${base}/garage/`;
}
```

- [ ] **Step 7: Run it to see it pass**

Run: `cd garage && npx vitest run build/siteUrl.test.ts`
Expected: 5 passed.

- [ ] **Step 8: Create the Vite plugin, config and HTML shell**

`garage/build/garagePlugin.ts`:

```ts
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
```

`garage/vite.config.ts`:

```ts
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { garagePlugin } from './build/garagePlugin.ts';
import { garageCanonical } from './build/siteUrl.ts';

const siteConfig = readFileSync(new URL('../_config.yml', import.meta.url), 'utf8');
const canonical = garageCanonical(siteConfig, process.env.SITE_BASEURL || undefined);

export default defineConfig({
  base: './',
  plugins: [react(), garagePlugin({ canonical })],
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'build/**/*.test.ts'] },
});
```

`garage/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Most Wanted Garage · Indivar Mishra</title>
    <meta name="description" content="An unofficial fan garage for the BMW M3 GTR (E46) from Need for Speed: Most Wanted. Orbit the car, pop the hood, and explore its P60B40 V8.">
    <link rel="canonical" href="__CANONICAL__">
    <meta name="theme-color" content="#07090c">
    <meta name="color-scheme" content="dark">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main" tabindex="-1">
      <header class="masthead">
        <p class="eyebrow">Most Wanted garage</p>
        <h1>BMW M3 GTR <span>E46</span></h1>
      </header>
      <div id="app"></div>
      <noscript><p class="fallback">This garage needs JavaScript and WebGL 2. <a href="../">Back to indivar.xyz</a></p></noscript>
    </main>
    <footer class="credits">
      <details>
        <summary>Fan project · Credits</summary>
        <p>Unofficial, non-commercial fan project. Not affiliated with or endorsed by Electronic Arts or BMW.</p>
        <p>This work is based on "<a href="https://sketchfab.com/3d-models/bmw-m3-e46-gtr-7a0e538dd533481da79a6dcc0fc05213">BMW M3 E46 GTR</a>" by <a href="https://sketchfab.com/Flamestroke">Flamestroke</a>, licensed under <a href="http://creativecommons.org/licenses/by/4.0/">CC-BY-4.0</a>. Changes: rescaled, regrouped, hood hinge added, materials adjusted, compressed.</p>
        <p>The garage, engine, sound and interface are original to this project.</p>
      </details>
      <a class="home-link" href="../">← indivar.xyz</a>
    </footer>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`garage/public/favicon.svg` (an original tachometer mark):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0b1220"/><path d="M6 21a10 10 0 1 1 20 0" fill="none" stroke="#c9ced6" stroke-width="2.5" stroke-linecap="round"/><path d="M16 21l6-7" stroke="#3d7bff" stroke-width="2.5" stroke-linecap="round"/><circle cx="16" cy="21" r="2" fill="#3d7bff"/></svg>
```

- [ ] **Step 9: Create the entry point and a placeholder scene**

`garage/src/qa.ts`:

```ts
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

/** `?qa` turns on test hooks: a readable canvas, `window.garage`, and `window.garageCamera`. */
export const QA = params.has('qa');

/** `?quality=high|low` pins the render quality (used by screenshots and tests). */
export const FORCED_QUALITY = params.get('quality');
```

`garage/src/webgl.ts`:

```ts
export function supportsWebGL2(): boolean {
  try {
    return typeof WebGL2RenderingContext !== 'undefined' && document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
```

`garage/src/ui/Fallback.tsx`:

```tsx
export function Fallback() {
  return (
    <div className="fallback" role="alert">
      <p>This garage needs WebGL 2, which this browser or device doesn’t provide.</p>
      <p><a href="../">Back to indivar.xyz</a></p>
    </div>
  );
}
```

`garage/src/App.tsx` (placeholder until Task 6):

```tsx
import { Canvas } from '@react-three/fiber';

export function App() {
  return (
    <div className="stage">
      <Canvas camera={{ position: [3, 2, 4], fov: 40 }}>
        <color attach="background" args={['#07090c']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 2]} intensity={2} />
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#3d7bff" />
        </mesh>
      </Canvas>
    </div>
  );
}
```

`garage/src/main.tsx`:

```tsx
import '@fontsource/saira-condensed/500.css';
import '@fontsource/saira-condensed/700.css';
import '@fontsource/pt-mono/400.css';
import './ui/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Fallback } from './ui/Fallback';
import { supportsWebGL2 } from './webgl';

const root = createRoot(document.getElementById('app')!);
root.render(<StrictMode>{supportsWebGL2() ? <App /> : <Fallback />}</StrictMode>);
```

`garage/src/ui/base.css`:

```css
:root {
  --ink: #e8ecf2;
  --muted: #8d97a6;
  --panel: rgba(9, 13, 19, 0.76);
  --line: rgba(201, 206, 214, 0.2);
  --blue: #3d7bff;
  --navy: #1c3f94;
  --silver: #c9ced6;
  --amber: #ffb35c;
  --font: 'Saira Condensed', 'Arial Narrow', sans-serif;
  --mono: 'PT Mono', ui-monospace, monospace;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #07090c; color: var(--ink); font: 16px/1.5 var(--font); -webkit-font-smoothing: antialiased; }
body { overflow: hidden; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.skip-link { position: fixed; top: -100px; left: 16px; z-index: 50; padding: 8px 14px; background: var(--ink); color: #07090c; }
.skip-link:focus { top: 12px; }
#main { position: fixed; inset: 0; outline: none; }
#app, .stage { position: absolute; inset: 0; }
.masthead { position: absolute; z-index: 10; top: max(16px, env(safe-area-inset-top)); left: 16px; pointer-events: none; transform: skewX(-8deg); transform-origin: left; }
.masthead h1 { margin: 0; font-size: clamp(28px, 4vw, 44px); font-weight: 700; line-height: 1; letter-spacing: 0.02em; text-transform: uppercase; text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6); }
.masthead h1 span { color: var(--blue); }
.eyebrow { margin: 0 0 4px; font: 12px/1.4 var(--mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--silver); }
.credits { position: fixed; z-index: 15; right: 16px; bottom: max(12px, env(safe-area-inset-bottom)); display: flex; gap: 14px; align-items: flex-end; max-width: min(560px, calc(100% - 32px)); font: 11px/1.45 var(--mono); color: var(--muted); text-align: right; }
.credits summary { cursor: pointer; list-style: none; }
.credits summary::-webkit-details-marker { display: none; }
.credits details[open] { padding: 10px 12px; background: var(--panel); text-align: left; }
.credits p { margin: 6px 0 0; }
.credits a { color: var(--silver); }
.fallback { position: absolute; inset: 0; display: grid; place-content: center; gap: 8px; padding: 24px; font-size: 18px; text-align: center; }
```

- [ ] **Step 10: Build and check the output**

Run: `cd garage && npm run build && grep -o 'href="https://indivar.xyz/garage/"' dist/index.html && ls dist/basis && grep -c '<h1' dist/index.html`
Expected: the canonical prints once, `basis_transcoder.js basis_transcoder.wasm` is listed, and the H1 count is `1`.

Run: `cd garage && npm run dev`, then open `http://localhost:5173/`.
Expected: a blue cube, the masthead, and the credits link. Stop the server.

- [ ] **Step 11: Commit**

```bash
git add _config.yml .gitignore garage/package.json garage/package-lock.json garage/tsconfig.json garage/vite.config.ts garage/index.html garage/build garage/public/favicon.svg garage/src
git commit -m "Scaffold the garage app inside the site"
```

---

### Task 2: Build the site and garage together

**Files:**
- Create: `scripts/build-site.sh`
- Modify: `test_site.rb:13` (the required-pages list)
- Modify: `.github/workflows/pages.yml` (the build job)
- Modify: `_includes/project-row.html:4`
- Modify: `_data/projects.yml` (new second entry)
- Modify: `README.md` (new "Garage" section)

**Interfaces:**
- Consumes: `npm run build` in `garage/` (Task 1), which honors `SITE_BASEURL`.
- Produces: `scripts/build-site.sh [destination] [baseurl]`, which later tasks and CI call.

- [ ] **Step 1: Make the checker demand the garage page (failing check)**

In `test_site.rb`, change the required-pages line to:

```ruby
%w[index.html work/index.html blog/index.html about/index.html blog/hello-world/index.html 404.html garage/index.html].each do |page|
```

Run: `bundle exec jekyll build && ruby test_site.rb`
Expected: FAIL with `Missing page: garage/index.html`.

- [ ] **Step 2: Create `scripts/build-site.sh`**

```bash
#!/usr/bin/env bash
# Builds the Jekyll site and the garage app into one output folder, then checks every page and link.
# Usage: scripts/build-site.sh [destination] [baseurl]   (defaults: _site and the baseurl in _config.yml)
set -euo pipefail
cd "$(dirname "$0")/.."

dest="${1:-_site}"
base="${2:-}"

SITE_BASEURL="$base" npm --prefix garage run build

jekyll_args=(build --destination "$dest")
if [[ -n "$base" ]]; then jekyll_args+=(--baseurl "$base"); fi
bundle exec jekyll "${jekyll_args[@]}"

rm -rf "$dest/garage"
cp -R garage/dist "$dest/garage"

if [[ -n "$base" ]]; then ruby test_site.rb "$dest" "$base"; else ruby test_site.rb "$dest"; fi
```

Run: `chmod +x scripts/build-site.sh && scripts/build-site.sh`
Expected: `Passed: 7 pages, local links, …`. Seven pages: the six existing ones plus the garage.

If Vite left `href="/favicon.svg"` unrewritten, the checker reports a broken link. In that case, change the icon link in `garage/index.html` to `href="./favicon.svg"` and rerun.

- [ ] **Step 3: Check the subpath build**

Run: `scripts/build-site.sh /tmp/indivar-preview /preview && grep -o 'href="https://indivar.xyz/preview/garage/"' /tmp/indivar-preview/garage/index.html`
Expected: `Passed: … (baseurl: "/preview")`, and the canonical prints once.

- [ ] **Step 4: Link the garage from the portfolio**

In `_includes/project-row.html`, replace `<h3><a href="{{ include.project.url }}">` with:

```liquid
<h3><a href="{% if include.project.url contains '://' %}{{ include.project.url }}{% else %}{{ include.project.url | relative_url }}{% endif %}">
```

In `_data/projects.yml`, insert after the first entry (uv Workspace Versioning):

```yaml
- name: Most Wanted Garage
  category: 3D & web
  description: "The BMW M3 GTR from Need for Speed: Most Wanted in a moody 3D garage. Pop the hood and explore its P60B40 V8, right in the browser."
  tags: [Three.js, React Three Fiber, WebAssembly]
  url: /garage/
  featured: true
```

Run: `scripts/build-site.sh && grep -c 'href="/garage/"' _site/index.html _site/work/index.html`
Expected: the checker passes, and each page links to `/garage/` once.

Run: `scripts/build-site.sh /tmp/indivar-preview /preview`
Expected: passes. The project link resolves to `/preview/garage/`.

- [ ] **Step 5: Build and check the garage in CI**

Replace the `build` job's steps in `.github/workflows/pages.yml` with:

```yaml
    steps:
      - uses: actions/checkout@v6
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.3'
          bundler-cache: true
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: garage/package-lock.json
      - name: Install garage dependencies
        run: npm ci
        working-directory: garage
      - name: Test garage
        run: npm test
        working-directory: garage
      - name: Build site and garage, then check pages and links
        run: scripts/build-site.sh
        env:
          JEKYLL_ENV: production
      - uses: actions/upload-pages-artifact@v4
        with:
          path: _site
```

- [ ] **Step 6: Document it**

Add this section to `README.md` before "## Deploy to GitHub Pages", and a table row `| Garage app (3D M3 GTR) | garage/ |` to "Configure your site":

````markdown
## Garage

`garage/` is a separate Vite app served at `/garage/`: an unofficial 3D garage for the BMW M3 GTR (E46) from *Need for Speed: Most Wanted*. Jekyll ignores the folder. `scripts/build-site.sh` builds both, copies the garage into `_site/garage/`, and runs the page checks.

```sh
cd garage
npm install
npm run dev        # http://localhost:5173/
npm test           # unit tests
```

Check the combined site with `scripts/build-site.sh`, or `scripts/build-site.sh /tmp/indivar-preview /preview` for a subpath.

The car model is credited in the garage footer and in `garage/CREDITS.md`: This work is based on "BMW M3 E46 GTR" (https://sketchfab.com/3d-models/bmw-m3-e46-gtr-7a0e538dd533481da79a6dcc0fc05213) by Flamestroke (https://sketchfab.com/Flamestroke) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
````

- [ ] **Step 7: Commit**

```bash
git add scripts/build-site.sh test_site.rb .github/workflows/pages.yml _includes/project-row.html _data/projects.yml README.md
git commit -m "Build the garage with the site and feature it in the portfolio"
```

---

### Task 3: Car and engine content with sourced facts

**Files:**
- Create: `garage/src/content/types.ts`, `sources.ts`, `car.ts`, `engine.ts`, `validate.ts`, `loaderFacts.ts`
- Test: `garage/src/content/content.test.ts`

**Interfaces:**
- Produces: `Badge`, `Source`, `Fact`, `Topic<Id>`; `SOURCES`; `CAR_TOPIC_IDS`, `CarTopicId`, `CAR_TOPICS: Record<CarTopicId, Topic<CarTopicId>>`; `ENGINE_TOPIC_IDS`, `EngineTopicId`, `ENGINE_TOPICS: Record<EngineTopicId, Topic<EngineTopicId>>`, `ENGINE_OVERVIEW: Topic<'overview'>`; `validateTopics(topics: readonly Topic[]): string[]`; `loaderFacts(): string[]`.

- [ ] **Step 1: Write the types and the failing tests**

`garage/src/content/types.ts`:

```ts
export type Badge = 'verified' | 'illustrative' | 'game-lore';
export type Source = { label: string; url: string };
export type Fact = { text: string; badge: Badge; sources: Source[] };
export type Topic<Id extends string = string> = {
  id: Id;
  title: string;
  /** One line, shown on the hotspot and in the loader. */
  summary: string;
  real: Fact[];
  game: Fact[];
};
```

`garage/src/content/content.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CAR_TOPIC_IDS, CAR_TOPICS } from './car';
import { ENGINE_OVERVIEW, ENGINE_TOPIC_IDS, ENGINE_TOPICS } from './engine';
import { loaderFacts } from './loaderFacts';
import type { Topic } from './types';
import { validateTopics } from './validate';

const all: Topic[] = [...Object.values(CAR_TOPICS), ...Object.values(ENGINE_TOPICS), ENGINE_OVERVIEW];

describe('content', () => {
  it('passes validation', () => {
    expect(validateTopics(all)).toEqual([]);
  });

  it('keys every topic by its own id', () => {
    for (const id of CAR_TOPIC_IDS) expect(CAR_TOPICS[id].id).toBe(id);
    for (const id of ENGINE_TOPIC_IDS) expect(ENGINE_TOPICS[id].id).toBe(id);
  });

  it('never claims the real engine has forced induction', () => {
    const real = all.flatMap((t) => t.real).map((f) => f.text.toLowerCase());
    expect(real.filter((text) => /turbo|supercharg/.test(text) && !/no turbo|naturally aspirated/.test(text))).toEqual([]);
  });

  it('feeds only verified facts to the loader', () => {
    const verified = new Set(all.flatMap((t) => t.real).filter((f) => f.badge === 'verified').map((f) => f.text));
    expect(loaderFacts().length).toBeGreaterThan(8);
    for (const text of loaderFacts()) expect(verified.has(text)).toBe(true);
  });
});

describe('validateTopics', () => {
  it('flags facts that break the badge rules', () => {
    const bad: Topic = {
      id: 'bad',
      title: 'Bad',
      summary: 'x',
      real: [
        { text: 'x', badge: 'verified', sources: [] },
        { text: 'y', badge: 'game-lore', sources: [{ label: 'a', url: 'http://a' }] },
      ],
      game: [{ text: 'z', badge: 'verified', sources: [{ label: 'a', url: 'https://a' }] }],
    };
    expect(validateTopics([bad])).toEqual([
      'bad.real[0]: verified fact needs a source',
      'bad.real[1]: game-lore belongs in the game tab',
      'bad.real[1]: source must be https (http://a)',
      'bad.game[0]: game tab facts must be game-lore',
    ]);
  });

  it('flags duplicate ids, blank text and empty topics', () => {
    const empty: Topic = { id: 'e', title: ' ', summary: 's', real: [], game: [] };
    expect(validateTopics([empty, { ...empty, title: 'E' }])).toEqual([
      'e: empty title or summary',
      'e: no facts',
      'duplicate topic id: e',
      'e: no facts',
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd garage && npx vitest run src/content`
Expected: FAIL, cannot resolve `./car`.

- [ ] **Step 3: Write the sources, facts and validator**

`garage/src/content/sources.ts`:

```ts
import type { Source } from './types';

export const SOURCES = {
  p60: { label: 'Wikipedia: BMW P60B40', url: 'https://en.wikipedia.org/wiki/BMW_P60B40' },
  m3: { label: 'Wikipedia: BMW M3, E46 motorsport', url: 'https://en.wikipedia.org/wiki/BMW_M3' },
  bmwClassic: { label: 'BMW Group Classic: M3 GTR (E46)', url: 'https://www.bmwgroup-classic.com/en/models/bmw-classics/product-description-page.ad-900-1.bmw-m3-gtr-e46.html' },
  encycarpedia: { label: 'Encycarpedia: M3 GTR Strassenversion', url: 'https://www.encycarpedia.com/bmw/01-m3-gtr-e46-strassenversion-coupe' },
  nfsCar: { label: 'NFS Wiki: BMW M3 GTR (E46)', url: 'https://nfs.fandom.com/wiki/BMW_M3_GTR_(E46)' },
  nfsPerformance: { label: 'NFS Wiki: Most Wanted performance parts', url: 'https://nfs.fandom.com/wiki/Need_for_Speed:_Most_Wanted_(2005)/Performance_Parts' },
  nfsMw: { label: 'Wikipedia: Need for Speed: Most Wanted (2005)', url: 'https://en.wikipedia.org/wiki/Need_for_Speed:_Most_Wanted_(2005_video_game)' },
} as const satisfies Record<string, Source>;
```

`garage/src/content/car.ts`:

```ts
import { SOURCES as S } from './sources';
import type { Topic } from './types';

export const CAR_TOPIC_IDS = ['hood', 'front-aero', 'rear-wing', 'wheels', 'history', 'livery'] as const;
export type CarTopicId = (typeof CAR_TOPIC_IDS)[number];

export const CAR_TOPICS: Record<CarTopicId, Topic<CarTopicId>> = {
  hood: {
    id: 'hood',
    title: 'Vented hood',
    summary: 'Pop the hood to explore the P60B40 V8.',
    real: [
      { text: 'The road-going M3 GTR got an engine hood with extra ventilation openings.', badge: 'verified', sources: [S.bmwClassic] },
      { text: 'Vents let hot air escape a tightly packed engine bay, which helps cooling and cuts lift over the hood.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  'front-aero': {
    id: 'front-aero',
    title: 'Extended aprons',
    summary: 'Deeper front and rear aprons than a standard M3.',
    real: [
      { text: 'BMW extended the front and rear aprons of the M3 GTR road car.', badge: 'verified', sources: [S.bmwClassic] },
      { text: 'A low front splitter limits the air rushing under the car, which cuts front-end lift at speed.', badge: 'illustrative', sources: [] },
    ],
    game: [
      { text: 'Fans note the game car lacks the air intake and tow hook below the real car’s passenger-side headlight.', badge: 'game-lore', sources: [S.nfsCar] },
    ],
  },
  'rear-wing': {
    id: 'rear-wing',
    title: 'Rear wing',
    summary: 'The large rear wing of the GTR road car.',
    real: [
      { text: 'A large rear wing is one of the visible differences between the M3 GTR road car and a standard M3.', badge: 'verified', sources: [S.bmwClassic] },
      { text: 'A wing trades a little drag for downforce, pressing the rear tyres into the road in fast corners.', badge: 'illustrative', sources: [] },
    ],
    game: [
      { text: 'The game car has LED tail lights, which BMW only introduced to the E46 range in April 2003.', badge: 'game-lore', sources: [S.nfsCar] },
    ],
  },
  wheels: {
    id: 'wheels',
    title: 'Wheels and brakes',
    summary: 'Race wheels over big discs and red calipers.',
    real: [
      { text: 'Large wheels leave room for big brake discs and calipers, which need space and airflow to shed heat.', badge: 'illustrative', sources: [] },
    ],
    game: [
      { text: 'On the box art the car wears ADR M Sport wheels, not the BBS Motorsport RE594 and RE595 wheels fans associate with the race car.', badge: 'game-lore', sources: [S.nfsCar] },
    ],
  },
  history: {
    id: 'history',
    title: 'Racing history',
    summary: 'ALMS GT winner in 2001; Nürburgring 24 Hours winner in 2004 and 2005.',
    real: [
      { text: 'Introduced in February 2001 with a 330 kW (443 hp) version of the 3,997 cc P60 V8.', badge: 'verified', sources: [S.m3] },
      { text: 'Won the 2001 American Le Mans Series GT category, driven by Jörg Müller.', badge: 'verified', sources: [S.m3] },
      { text: 'Rivals argued it was a prototype. BMW offered 10 road cars to meet the 2001 rules, and withdrew the car when 2002 rules demanded 100 cars and 1,000 engines.', badge: 'verified', sources: [S.m3, S.p60] },
      { text: 'Schnitzer Motorsport brought it back for the Nürburgring 24 Hours in 2003, and it won the race in 2004 and 2005.', badge: 'verified', sources: [S.m3] },
    ],
    game: [
      { text: 'It is the car on the cover of Need for Speed: Most Wanted (2005).', badge: 'game-lore', sources: [S.nfsMw] },
      { text: 'An unused vinyl in the game resembles the 2004 Schnitzer livery that won the Nürburgring 24 Hours.', badge: 'game-lore', sources: [S.nfsCar] },
    ],
  },
  livery: {
    id: 'livery',
    title: 'Hero livery',
    summary: 'Your car, until Razor takes it.',
    real: [],
    game: [
      { text: 'It is your car at the start of the career, until it is sabotaged. You win it back by beating Blacklist #1, Clarence “Razor” Callahan.', badge: 'game-lore', sources: [S.nfsCar] },
      { text: 'The blue-and-silver hero livery was concepted by Gabriel Frizzera of EA Black Box’s concept team.', badge: 'game-lore', sources: [S.nfsCar] },
      { text: 'In the game it has strong handling, acceleration and top speed, but only a mediocre nitrous boost.', badge: 'game-lore', sources: [S.nfsCar] },
    ],
  },
};
```

`garage/src/content/engine.ts`:

```ts
import { SOURCES as S } from './sources';
import type { Topic } from './types';

export const ENGINE_TOPIC_IDS = ['layout', 'heads', 'crank', 'restrictors', 'dry-sump', 'fuel', 'headers', 'game-turbo'] as const;
export type EngineTopicId = (typeof ENGINE_TOPIC_IDS)[number];

export const ENGINE_OVERVIEW: Topic<'overview'> = {
  id: 'overview',
  title: 'P60B40 V8',
  summary: 'BMW Motorsport’s 4.0-litre race V8.',
  real: [
    { text: 'A naturally aspirated 4.0-litre V8 built by BMW M for sports-car racing from 2001 to 2005.', badge: 'verified', sources: [S.p60] },
    { text: 'About 444 bhp at 7,500 rpm in race trim with air restrictors; the 10 road cars were rated at 380 hp.', badge: 'verified', sources: [S.p60, S.bmwClassic] },
  ],
  game: [],
};

export const ENGINE_TOPICS: Record<EngineTopicId, Topic<EngineTopicId>> = {
  layout: {
    id: 'layout',
    title: '90° V8 layout',
    summary: '3,997 cc from eight 94 mm cylinders.',
    real: [
      { text: 'A naturally aspirated 90° V8, mounted lengthways at the front and driving the rear wheels.', badge: 'verified', sources: [S.p60] },
      { text: 'Bore 94 mm and stroke 72 mm give 3,997 cc.', badge: 'verified', sources: [S.p60] },
      { text: 'The bore is wider than the stroke is long (oversquare). A short stroke keeps piston speeds down, which lets an engine rev higher.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  heads: {
    id: 'heads',
    title: 'Cylinder heads',
    summary: 'Twin cams per bank, four valves per cylinder.',
    real: [
      { text: 'Double overhead camshafts on each bank, with four valves per cylinder.', badge: 'verified', sources: [S.p60] },
      { text: 'The block and cylinder heads are aluminium.', badge: 'verified', sources: [S.p60] },
      { text: 'Compression ratio is listed as 12.0:1; another spec sheet gives 11:1.', badge: 'verified', sources: [S.p60, S.encycarpedia] },
    ],
    game: [],
  },
  crank: {
    id: 'crank',
    title: 'Flat-plane crankshaft',
    summary: 'Firing order 1-8-3-6-4-5-2-7.',
    real: [
      { text: 'A flat-plane crankshaft running in five main bearings.', badge: 'verified', sources: [S.p60] },
      { text: 'Firing order 1-8-3-6-4-5-2-7.', badge: 'verified', sources: [S.p60] },
      { text: 'With BMW’s usual numbering (1–4 on one bank, 5–8 on the other) that order alternates banks, so each bank’s exhaust pulses are evenly spaced. That gives flat-plane V8s a high wail instead of a cross-plane burble.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  restrictors: {
    id: 'restrictors',
    title: 'Air restrictors',
    summary: 'Two 30.4 mm inlets cap its power for racing.',
    real: [
      { text: 'Race rules fitted two 30.4 mm air restrictors; with them it made about 444 bhp at 7,500 rpm.', badge: 'verified', sources: [S.p60] },
      { text: 'Without restrictors, estimates run to 650–700 bhp.', badge: 'verified', sources: [S.p60] },
      { text: 'The 10 road cars were rated at 380 hp at 7,000 rpm.', badge: 'verified', sources: [S.bmwClassic] },
      { text: 'A restrictor limits how much air an engine can breathe at high rpm, which lets rule makers balance very different cars.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  'dry-sump': {
    id: 'dry-sump',
    title: 'Dry sump',
    summary: 'Oil lives in a separate tank.',
    real: [
      { text: 'Dry-sump lubrication; the engine is water-cooled.', badge: 'verified', sources: [S.p60] },
      { text: 'Scavenge pumps move oil to a separate tank, so the engine can sit lower and won’t starve of oil in hard corners. The tank and line positions shown are illustrative.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  fuel: {
    id: 'fuel',
    title: 'Fuel injection',
    summary: 'Multi-port injection.',
    real: [
      { text: 'Multi-port fuel injection.', badge: 'verified', sources: [S.p60] },
      { text: 'In a multi-port system each cylinder has its own injector, spraying into its intake port.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  headers: {
    id: 'headers',
    title: 'Exhaust headers',
    summary: 'Shown for illustration.',
    real: [
      { text: 'Tuned headers use pipe length to help pull spent gas out of each cylinder. No source we found shows the P60B40’s exact header layout, so this one is illustrative.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  'game-turbo': {
    id: 'game-turbo',
    title: 'Turbo? Only in the game',
    summary: 'The real engine is naturally aspirated.',
    real: [
      { text: 'The real P60B40 is naturally aspirated: no turbocharger or supercharger.', badge: 'verified', sources: [S.p60] },
    ],
    game: [
      { text: 'Most Wanted lets you upgrade the engine, transmission, suspension, nitrous, tyres, brakes, and a turbocharger or supercharger, in Race, Pro, Super Pro and Ultimate packages.', badge: 'game-lore', sources: [S.nfsPerformance] },
    ],
  },
};
```

`garage/src/content/validate.ts`:

```ts
import type { Topic } from './types';

/** Returns every rule violation in the content; an empty array means it is publishable. */
export function validateTopics(topics: readonly Topic[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const topic of topics) {
    if (seen.has(topic.id)) errors.push(`duplicate topic id: ${topic.id}`);
    seen.add(topic.id);
    if (!topic.title.trim() || !topic.summary.trim()) errors.push(`${topic.id}: empty title or summary`);
    if (topic.real.length + topic.game.length === 0) errors.push(`${topic.id}: no facts`);
    for (const [tab, facts] of [['real', topic.real], ['game', topic.game]] as const) {
      facts.forEach((fact, index) => {
        const where = `${topic.id}.${tab}[${index}]`;
        if (!fact.text.trim()) errors.push(`${where}: empty text`);
        if (fact.badge !== 'illustrative' && fact.sources.length === 0) errors.push(`${where}: ${fact.badge} fact needs a source`);
        if (tab === 'game' && fact.badge !== 'game-lore') errors.push(`${where}: game tab facts must be game-lore`);
        if (tab === 'real' && fact.badge === 'game-lore') errors.push(`${where}: game-lore belongs in the game tab`);
        for (const source of fact.sources) {
          if (!source.url.startsWith('https://')) errors.push(`${where}: source must be https (${source.url})`);
        }
      });
    }
  }
  return errors;
}
```

`garage/src/content/loaderFacts.ts`:

```ts
import { CAR_TOPICS } from './car';
import { ENGINE_OVERVIEW, ENGINE_TOPICS } from './engine';

/** Verified facts shown while the garage loads. */
export function loaderFacts(): string[] {
  return [ENGINE_OVERVIEW, ...Object.values(CAR_TOPICS), ...Object.values(ENGINE_TOPICS)]
    .flatMap((topic) => topic.real)
    .filter((fact) => fact.badge === 'verified')
    .map((fact) => fact.text);
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd garage && npx vitest run src/content`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add garage/src/content
git commit -m "Add sourced car and engine content for the garage"
```

---

### Task 4: Foundations: math, randomness, view state, quality, store

**Files:**
- Create: `garage/src/math.ts`, `garage/src/random.ts`, `garage/src/state/view.ts`, `garage/src/state/quality.ts`, `garage/src/state/store.ts`
- Test: `garage/src/math.test.ts`, `garage/src/state/view.test.ts`, `garage/src/state/quality.test.ts`, `garage/src/state/store.test.ts`

**Interfaces:**
- Consumes: `CarTopicId`, `EngineTopicId` (Task 3); `QA`, `FORCED_QUALITY` (Task 1).
- Produces:
  - `Vec3 = [number, number, number]`; `add`, `sub`, `scale`, `dot`, `length`, `normalize`, `clamp`, `smoothstep`; `mulberry32(seed): () => number`.
  - `View`, `ViewAction`, `SHOWROOM`, `reduceView(view, action): View`, `isHoodOpen(view): boolean`.
  - `Quality`, `DeviceHints`, `initialQuality(hints)`, `readDeviceHints()`, `FrameWindow`, `trackFrame(window, dt)`.
  - `useGarage` with state `{ view, quality, qualityLocked, reducedMotion, ready, soundOn, ownTrack, trackError }` and actions `{ dispatch, setQuality, setReady, setSound, setOwnTrack, setTrackError }`.

- [ ] **Step 1: Write the failing tests**

`garage/src/math.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { add, clamp, dot, length, normalize, scale, smoothstep, sub } from './math';
import { mulberry32 } from './random';

describe('math', () => {
  it('does vector arithmetic', () => {
    expect(add([1, 2, 3], [1, 1, 1])).toEqual([2, 3, 4]);
    expect(sub([1, 2, 3], [1, 1, 1])).toEqual([0, 1, 2]);
    expect(scale([1, 2, 3], 2)).toEqual([2, 4, 6]);
    expect(dot([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(length([3, 4, 0])).toBe(5);
    expect(normalize([0, 0, 2])).toEqual([0, 0, 1]);
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('clamps and smooths', () => {
    expect(clamp(2, 0, 1)).toBe(1);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it('makes repeatable random numbers in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});
```

`garage/src/state/view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isHoodOpen, reduceView, SHOWROOM, type View } from './view';

const focus: View = { kind: 'focus', id: 'wheels' };
const bay: View = { kind: 'bay' };
const part: View = { kind: 'bay-part', id: 'crank' };

describe('reduceView', () => {
  it('opens the bay from the hood hotspot and focuses other car hotspots', () => {
    expect(reduceView(SHOWROOM, { type: 'select-car', id: 'hood' })).toEqual(bay);
    expect(reduceView(SHOWROOM, { type: 'select-car', id: 'wheels' })).toEqual(focus);
    expect(reduceView(part, { type: 'select-car', id: 'history' })).toEqual({ kind: 'focus', id: 'history' });
  });

  it('selects engine parts from anywhere', () => {
    expect(reduceView(bay, { type: 'select-part', id: 'crank' })).toEqual(part);
    expect(reduceView(SHOWROOM, { type: 'select-part', id: 'fuel' })).toEqual({ kind: 'bay-part', id: 'fuel' });
  });

  it('goes back one level at a time', () => {
    expect(reduceView(part, { type: 'back' })).toEqual(bay);
    expect(reduceView(bay, { type: 'back' })).toBe(SHOWROOM);
    expect(reduceView(focus, { type: 'back' })).toBe(SHOWROOM);
    expect(reduceView(SHOWROOM, { type: 'back' })).toBe(SHOWROOM);
  });

  it('closes the hood only when it is open', () => {
    expect(reduceView(part, { type: 'close-hood' })).toBe(SHOWROOM);
    expect(reduceView(focus, { type: 'close-hood' })).toBe(focus);
  });

  it('knows when the hood is open', () => {
    expect([SHOWROOM, focus, bay, part].map(isHoodOpen)).toEqual([false, false, true, true]);
  });
});
```

`garage/src/state/quality.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FRAME_BUDGET_MS, initialQuality, trackFrame, type FrameWindow } from './quality';

describe('initialQuality', () => {
  it('starts phones and small screens on low', () => {
    expect(initialQuality({ coarsePointer: false, shortSide: 900, reducedData: false })).toBe('high');
    expect(initialQuality({ coarsePointer: true, shortSide: 900, reducedData: false })).toBe('low');
    expect(initialQuality({ coarsePointer: false, shortSide: 600, reducedData: false })).toBe('low');
    expect(initialQuality({ coarsePointer: false, shortSide: 900, reducedData: true })).toBe('low');
  });
});

describe('trackFrame', () => {
  const run = (dt: number, frames: number) => {
    let window: FrameWindow = { elapsed: 0, frames: 0 };
    let over = false;
    for (let i = 0; i < frames; i++) {
      const result = trackFrame(window, dt);
      window = result.window;
      over ||= result.overBudget;
    }
    return over;
  };

  it('stays quiet at 60 fps and flags a sustained slow window', () => {
    expect(run(1 / 60, 240)).toBe(false);
    expect(run((FRAME_BUDGET_MS + 5) / 1000, 120)).toBe(true);
  });

  it('ignores the huge frame after a hidden tab', () => {
    expect(trackFrame({ elapsed: 0, frames: 0 }, 5)).toEqual({ window: { elapsed: 0, frames: 0 }, overBudget: false });
  });
});
```

`garage/src/state/store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useGarage } from './store';
import { SHOWROOM } from './view';

describe('useGarage', () => {
  beforeEach(() => useGarage.setState({ view: SHOWROOM, quality: 'high', ready: false, soundOn: false, ownTrack: null, trackError: null }));

  it('routes view actions through the reducer', () => {
    useGarage.getState().dispatch({ type: 'select-car', id: 'hood' });
    expect(useGarage.getState().view).toEqual({ kind: 'bay' });
  });

  it('does not notify when going back from the showroom', () => {
    let calls = 0;
    const unsubscribe = useGarage.subscribe(() => calls++);
    useGarage.getState().dispatch({ type: 'back' });
    unsubscribe();
    expect(calls).toBe(0);
  });

  it('stores settings', () => {
    const s = useGarage.getState();
    s.setQuality('low');
    s.setSound(true);
    s.setOwnTrack('song.mp3');
    s.setReady();
    expect(useGarage.getState()).toMatchObject({ quality: 'low', soundOn: true, ownTrack: 'song.mp3', ready: true });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd garage && npx vitest run src/math.test.ts src/state`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`garage/src/math.ts`:

```ts
export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l === 0 ? [0, 0, 0] : scale(a, 1 / l);
};
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
```

`garage/src/random.ts`:

```ts
/** Small deterministic PRNG, so the garage and its sound are the same on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`garage/src/state/view.ts`:

```ts
import type { CarTopicId } from '../content/car';
import type { EngineTopicId } from '../content/engine';

export type View =
  | { kind: 'showroom' }
  | { kind: 'focus'; id: Exclude<CarTopicId, 'hood'> }
  | { kind: 'bay' }
  | { kind: 'bay-part'; id: EngineTopicId };

export type ViewAction =
  | { type: 'select-car'; id: CarTopicId }
  | { type: 'select-part'; id: EngineTopicId }
  | { type: 'back' }
  | { type: 'close-hood' };

export const SHOWROOM: View = { kind: 'showroom' };

export const isHoodOpen = (view: View): boolean => view.kind === 'bay' || view.kind === 'bay-part';

export function reduceView(view: View, action: ViewAction): View {
  switch (action.type) {
    case 'select-car':
      return action.id === 'hood' ? { kind: 'bay' } : { kind: 'focus', id: action.id };
    case 'select-part':
      return { kind: 'bay-part', id: action.id };
    case 'back':
      return view.kind === 'bay-part' ? { kind: 'bay' } : SHOWROOM;
    case 'close-hood':
      return isHoodOpen(view) ? SHOWROOM : view;
  }
}
```

`garage/src/state/quality.ts`:

```ts
export type Quality = 'high' | 'low';
export type DeviceHints = { coarsePointer: boolean; shortSide: number; reducedData: boolean };
export type FrameWindow = { elapsed: number; frames: number };

export const FRAME_WINDOW_SECONDS = 2;
export const FRAME_BUDGET_MS = 28;
const STALL_SECONDS = 0.25;

export function initialQuality(hints: DeviceHints): Quality {
  return hints.coarsePointer || hints.shortSide < 700 || hints.reducedData ? 'low' : 'high';
}

export function readDeviceHints(): DeviceHints {
  const media = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;
  return {
    coarsePointer: media('(pointer: coarse)'),
    shortSide: Math.min(innerWidth, innerHeight),
    reducedData: media('(prefers-reduced-data: reduce)'),
  };
}

/** Adds one frame. When a window closes, reports whether its average frame time broke the budget. */
export function trackFrame(window: FrameWindow, dt: number): { window: FrameWindow; overBudget: boolean } {
  if (dt > STALL_SECONDS) return { window, overBudget: false };
  const elapsed = window.elapsed + dt;
  const frames = window.frames + 1;
  if (elapsed < FRAME_WINDOW_SECONDS) return { window: { elapsed, frames }, overBudget: false };
  return { window: { elapsed: 0, frames: 0 }, overBudget: (elapsed / frames) * 1000 > FRAME_BUDGET_MS };
}
```

`garage/src/state/store.ts`:

```ts
import { create } from 'zustand';
import { FORCED_QUALITY } from '../qa';
import { initialQuality, readDeviceHints, type Quality } from './quality';
import { reduceView, SHOWROOM, type View, type ViewAction } from './view';

export type GarageStore = {
  view: View;
  quality: Quality;
  /** True when `?quality=` pinned the tier, so the frame monitor must leave it alone. */
  qualityLocked: boolean;
  reducedMotion: boolean;
  ready: boolean;
  soundOn: boolean;
  ownTrack: string | null;
  trackError: string | null;
  dispatch: (action: ViewAction) => void;
  setQuality: (quality: Quality) => void;
  setReady: () => void;
  setSound: (on: boolean) => void;
  setOwnTrack: (name: string | null) => void;
  setTrackError: (message: string | null) => void;
};

const inBrowser = typeof window !== 'undefined';
const forced: Quality | null = FORCED_QUALITY === 'high' || FORCED_QUALITY === 'low' ? FORCED_QUALITY : null;

export const useGarage = create<GarageStore>()((set) => ({
  view: SHOWROOM,
  quality: forced ?? (inBrowser ? initialQuality(readDeviceHints()) : 'high'),
  qualityLocked: forced !== null,
  reducedMotion: inBrowser && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  ready: false,
  soundOn: false,
  ownTrack: null,
  trackError: null,
  dispatch: (action) =>
    set((state) => {
      const view = reduceView(state.view, action);
      return view === state.view ? state : { view };
    }),
  setQuality: (quality) => set({ quality }),
  setReady: () => set({ ready: true }),
  setSound: (soundOn) => set({ soundOn }),
  setOwnTrack: (ownTrack) => set({ ownTrack }),
  setTrackError: (trackError) => set({ trackError }),
}));
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd garage && npx vitest run`
Expected: all pass (siteUrl 5, content 6, math 3, view 5, quality 3, store 3).

- [ ] **Step 5: Commit**

```bash
git add garage/src/math.ts garage/src/math.test.ts garage/src/random.ts garage/src/state
git commit -m "Add the garage view state machine, quality tiers and store"
```

---

### Task 5: Car asset pipeline and asset contract

**Files:**
- Create: `garage/src/car/manifest.ts`, `garage/src/car/manifest.test.ts`
- Create: `garage/tools/install-ktx.sh`, `garage/tools/car-map.json`, `garage/tools/blender/prepare_car.py`, `garage/tools/prepare-car.ts`, `garage/tools/check-assets.ts`
- Create: `garage/public/models/m3-gtr.glb` (generated), `garage/CREDITS.md`
- Modify: `garage/package.json` (scripts and dev dependencies), `.github/workflows/pages.yml` (the "Test garage" step)

**Interfaces:**
- Consumes: the raw download `garage/assets-src/will.zip` (already present, untracked).
- Produces: `REQUIRED_NODES`, `RequiredNode`, `ASSET_BUDGET`, `missingNodes(names)`, `AssetFacts`, `assetErrors(facts): string[]`. Also a glb that meets the contract: nodes `Body`, `Hood` (origin on the hinge), `Glass`, `Marker_Wheel_FL|FR|RL|RR`, `Marker_EngineBay`, with paint meshes carrying `extras.role = "paint"`. Also `garage/assets-src/prepare-report.json`, holding the hinge, wheel centers, engine bay, and bounds in car space; Task 8 reads it.

- [ ] **Step 1: Write the failing contract test**

`garage/src/car/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assetErrors, missingNodes, REQUIRED_NODES, type AssetFacts } from './manifest';

const good: AssetFacts = { nodeNames: [...REQUIRED_NODES, 'Paint_Shell'], bytes: 9_000_000, triangles: 117_000, textureMimeTypes: ['image/ktx2'], paintMeshes: 8 };

describe('car asset contract', () => {
  it('lists missing nodes in contract order', () => {
    expect(missingNodes(['Body', 'Marker_EngineBay'])).toEqual(['Hood', 'Glass', 'Marker_Wheel_FL', 'Marker_Wheel_FR', 'Marker_Wheel_RL', 'Marker_Wheel_RR']);
  });

  it('accepts a model inside the budgets', () => {
    expect(assetErrors(good)).toEqual([]);
  });

  it('explains every violation', () => {
    expect(assetErrors({ nodeNames: ['Body'], bytes: 13 * 1048576, triangles: 200_000, textureMimeTypes: ['image/jpeg', 'image/ktx2'], paintMeshes: 0 })).toEqual([
      'missing node: Hood',
      'missing node: Glass',
      'missing node: Marker_Wheel_FL',
      'missing node: Marker_Wheel_FR',
      'missing node: Marker_Wheel_RL',
      'missing node: Marker_Wheel_RR',
      'missing node: Marker_EngineBay',
      'file is 13.0 MB; budget is 12 MB',
      '200000 triangles; budget is 150000',
      '1 texture(s) are not KTX2',
      'no meshes tagged role=paint',
    ]);
  });
});
```

Run: `cd garage && npx vitest run src/car/manifest.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement `garage/src/car/manifest.ts`**

It must stay free of imports, because `tools/check-assets.ts` loads it directly in Node.

```ts
// The car asset contract (spec §4.2). Shared by the runtime and tools/check-assets.ts.

export const REQUIRED_NODES = ['Body', 'Hood', 'Glass', 'Marker_Wheel_FL', 'Marker_Wheel_FR', 'Marker_Wheel_RL', 'Marker_Wheel_RR', 'Marker_EngineBay'] as const;
export type RequiredNode = (typeof REQUIRED_NODES)[number];

export const ASSET_BUDGET = { maxBytes: 12 * 1024 * 1024, maxTriangles: 150_000 } as const;

export function missingNodes(names: Iterable<string>): RequiredNode[] {
  const have = new Set(names);
  return REQUIRED_NODES.filter((name) => !have.has(name));
}

export type AssetFacts = { nodeNames: string[]; bytes: number; triangles: number; textureMimeTypes: string[]; paintMeshes: number };

export function assetErrors(facts: AssetFacts): string[] {
  const errors = missingNodes(facts.nodeNames).map((name) => `missing node: ${name}`);
  if (facts.bytes > ASSET_BUDGET.maxBytes) errors.push(`file is ${(facts.bytes / 1048576).toFixed(1)} MB; budget is 12 MB`);
  if (facts.triangles > ASSET_BUDGET.maxTriangles) errors.push(`${facts.triangles} triangles; budget is ${ASSET_BUDGET.maxTriangles}`);
  const notKtx = facts.textureMimeTypes.filter((type) => type !== 'image/ktx2').length;
  if (notKtx > 0) errors.push(`${notKtx} texture(s) are not KTX2`);
  if (facts.paintMeshes === 0) errors.push('no meshes tagged role=paint');
  return errors;
}
```

Run: `cd garage && npx vitest run src/car/manifest.test.ts`
Expected: 3 passed.

- [ ] **Step 3: Add the tools' dependencies and scripts**

Run: `cd garage && npm install -D @gltf-transform/cli@^4.5.1 @gltf-transform/core@^4.5.1 @gltf-transform/extensions@^4.5.1 meshoptimizer@^1.3.0`

In `garage/package.json`, set `scripts` to:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run && node tools/check-assets.ts",
  "check:assets": "node tools/check-assets.ts",
  "prepare:car": "node tools/prepare-car.ts"
}
```

- [ ] **Step 4: Install KTX-Software into `tools/bin`**

`garage/tools/install-ktx.sh`:

```bash
#!/usr/bin/env bash
# Installs the KTX-Software CLI into tools/bin/ktx/. Needed only to re-process the car model.
set -euo pipefail
version=4.4.2
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/bin/ktx"
name="KTX-Software-$version-Linux-x86_64"
url="https://github.com/KhronosGroup/KTX-Software/releases/download/v$version/$name.tar.bz2"

if [[ -x "$dest/bin/ktx" ]]; then echo "ktx already installed: $("$dest/bin/ktx" --version)"; exit 0; fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/ktx.tar.bz2" "$url"
curl -fsSL -o "$tmp/ktx.tar.bz2.sha1" "$url.sha1"
expected="$(cut -d' ' -f1 < "$tmp/ktx.tar.bz2.sha1")"
actual="$(sha1sum "$tmp/ktx.tar.bz2" | cut -d' ' -f1)"
if [[ "$expected" != "$actual" ]]; then echo "KTX-Software checksum mismatch" >&2; exit 1; fi

mkdir -p "$tmp/x" "$dest"
tar -xjf "$tmp/ktx.tar.bz2" -C "$tmp/x"
top="$(find "$tmp/x" -mindepth 1 -maxdepth 1 -type d | head -1)"
cp -R "$top"/. "$dest"/
"$dest/bin/ktx" --version
```

Run: `chmod +x garage/tools/install-ktx.sh && garage/tools/install-ktx.sh`
Expected: prints `ktx version: v4.4.2`. If `bin/ktx` can't find `libktx.so`, run `ls garage/tools/bin/ktx/lib`. The orchestrator in Step 6 already adds that folder to `LD_LIBRARY_PATH`.

- [ ] **Step 5: Unpack the download and write the Blender normalizer**

Run: `cd garage && mkdir -p assets-src/model && unzip -oq assets-src/will.zip -d assets-src/model && ls assets-src/model`
Expected: `license.txt  scene.bin  scene.gltf  textures`

`garage/tools/car-map.json`:

```json
{
  "lengthMeters": 4.49,
  "sourcePrefix": "polySurface2732_",
  "hood": ["blinn8", "aw", "sd", "lambert15"],
  "glass": "wind",
  "tyres": "tyre",
  "paint": ["blinn3", "blinn8", "blinn9", "blinn10", "blinn12", "blinn13", "blinn14", "blinn18"],
  "rename": {
    "blinn8": "Hood_Panel",
    "aw": "Hood_Louvres",
    "sd": "Hood_LouvreBacks",
    "lambert15": "Hood_Scoop",
    "wind": "Glass",
    "tyre": "Tyres",
    "blinn1": "Rims",
    "breka": "BrakeDiscs",
    "1 car paint.005": "Calipers",
    "blinn3": "Paint_Trunk",
    "blinn9": "Paint_Nose",
    "blinn10": "Paint_Doors",
    "blinn12": "Paint_Silver",
    "blinn13": "Paint_Flares",
    "blinn14": "Paint_Shell",
    "blinn18": "Paint_Skirts",
    "lambert6": "Interior",
    "lambert7": "RearWing",
    "lambert10": "Grille"
  }
}
```

`garage/tools/blender/prepare_car.py`:

```python
"""Normalizes the Sketchfab M3 GTR into the garage's car contract (spec section 4.2).

Run through `npm run prepare:car`, or directly:
blender -b --factory-startup --python tools/blender/prepare_car.py -- <scene.gltf> <out.glb> <car-map.json> <report.json>
"""
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector


def cli_args():
    argv = sys.argv[sys.argv.index("--") + 1:]
    return argv[0], argv[1], argv[2], argv[3]


def key_of(name, prefix):
    key = name[len(prefix):] if name.startswith(prefix) else name
    return key[:-2] if key.endswith("_0") else key


def bake(objects, matrix=None):
    """Bakes each object's world transform (optionally pre-multiplied by `matrix`) into its mesh data."""
    for obj in objects:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = matrix @ world if matrix is not None else world
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def bounds(objects):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for obj in objects:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            lo = Vector(map(min, lo, point))
            hi = Vector(map(max, hi, point))
    return lo, hi


def to_car_space(v):
    """Blender (Z up, car facing -Y) to glTF car space (Y up, car facing +Z)."""
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def empty(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = Matrix.Translation(location)
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def main():
    src, out, map_path, report_path = cli_args()
    with open(map_path) as handle:
        cfg = json.load(handle)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    # 1. Bake the Sketchfab/FBX hierarchy into the meshes and drop the empties.
    bake(meshes)
    for obj in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
        bpy.data.objects.remove(obj, do_unlink=True)

    by_key = {key_of(o.name, cfg["sourcePrefix"]): o for o in meshes}
    needed = cfg["hood"] + cfg["paint"] + [cfg["glass"], cfg["tyres"]]
    missing = [key for key in needed if key not in by_key]
    if missing:
        raise SystemExit(f"source model is missing meshes: {missing}")

    # 2. Face the car down -Y (glTF +Z), scale to real length, centre on the shell, tyres on the ground.
    bake(meshes, Matrix.Rotation(math.pi, 4, "Z"))
    lo, hi = bounds(meshes)
    factor = cfg["lengthMeters"] / (hi.y - lo.y)
    shell_lo, shell_hi = bounds([by_key[k] for k in cfg["paint"]])
    tyre_lo, _ = bounds([by_key[cfg["tyres"]]])
    offset = Vector((-(shell_lo.x + shell_hi.x) / 2, -(lo.y + hi.y) / 2, -tyre_lo.z))
    bake(meshes, Matrix.Scale(factor, 4) @ Matrix.Translation(offset))

    # 3. Names and roles.
    for key, obj in by_key.items():
        if key in cfg["rename"]:
            obj.name = cfg["rename"][key]
        if key in cfg["paint"]:
            obj["role"] = "paint"

    # 4. Measurements, taken before any parenting.
    panel = by_key[cfg["hood"][0]]
    panel_lo, panel_hi = bounds([panel])
    panel_points = [v.co for v in panel.data.vertices]
    hinge_y = panel_hi.y  # the hood's rear edge; the car faces -Y
    hinge_z = max(p.z for p in panel_points if p.y > hinge_y - 0.02)
    hinge = Vector((0.0, hinge_y, hinge_z))

    tyre_points = [v.co for v in by_key[cfg["tyres"]].data.vertices]
    wheels = {}
    # Car's left is +X in both Blender and glTF; the front is -Y in Blender.
    for label, side, end in (("FL", 1, -1), ("FR", -1, -1), ("RL", 1, 1), ("RR", -1, 1)):
        pts = [p for p in tyre_points if p.x * side > 0 and p.y * end > 0]
        wheels[label] = Vector((
            (min(p.x for p in pts) + max(p.x for p in pts)) / 2,
            (min(p.y for p in pts) + max(p.y for p in pts)) / 2,
            (min(p.z for p in pts) + max(p.z for p in pts)) / 2,
        ))
    engine_bay = Vector((0.0, (panel_lo.y + panel_hi.y) / 2, wheels["FL"].z))
    final_lo, final_hi = bounds(meshes)

    # 5. Hierarchy: Hood pivots on the hinge; everything else sits under Body; markers at the root.
    hood = empty("Hood", hinge)
    body = empty("Body", Vector((0.0, 0.0, 0.0)))
    bpy.context.view_layer.update()  # make the new empties' world matrices current before parenting
    hood_meshes = {by_key[k].name for k in cfg["hood"]}
    for obj in meshes:
        parent = hood if obj.name in hood_meshes else body
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    for label, centre in wheels.items():
        empty(f"Marker_Wheel_{label}", centre)
    empty("Marker_EngineBay", engine_bay)

    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_extras=True,
        export_yup=True,
        export_apply=False,
        export_cameras=False,
        export_lights=False,
        export_image_format="AUTO",
    )

    triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    report = {
        "scale": round(factor, 4),
        "boundsMin": to_car_space(Vector((final_lo.x, final_hi.y, final_lo.z))),
        "boundsMax": to_car_space(Vector((final_hi.x, final_lo.y, final_hi.z))),
        "hinge": to_car_space(hinge),
        "hoodLength": round(panel_hi.y - panel_lo.y, 4),
        "hoodHalfWidth": round((panel_hi.x - panel_lo.x) / 2, 4),
        "wheels": {k: to_car_space(v) for k, v in wheels.items()},
        "engineBay": to_car_space(engine_bay),
        "triangles": triangles,
    }
    with open(report_path, "w") as handle:
        json.dump(report, handle, indent=2)
    print("PREPARE_REPORT", json.dumps(report))


main()
```

- [ ] **Step 6: Write the orchestrator and the asset check**

`garage/tools/prepare-car.ts`:

```ts
// Turns the raw Sketchfab download into public/models/m3-gtr.glb:
// Blender normalization, then KTX2 (Basis ETC1S) textures and meshopt geometry via glTF-Transform.
// Usage: npm run prepare:car [-- path/to/scene.gltf]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const input = resolve(process.argv[2] ?? join(root, 'assets-src/model/scene.gltf'));
const ktxDir = join(root, 'tools/bin/ktx');
const output = join(root, 'public/models/m3-gtr.glb');
const report = join(root, 'assets-src/prepare-report.json');

if (!existsSync(input)) throw new Error(`Missing ${input}. Unzip the Sketchfab download into assets-src/model/ first.`);
if (!existsSync(join(ktxDir, 'bin/ktx'))) throw new Error('Missing KTX-Software. Run tools/install-ktx.sh first.');

const env = {
  ...process.env,
  PATH: `${join(ktxDir, 'bin')}:${process.env.PATH ?? ''}`,
  LD_LIBRARY_PATH: `${join(ktxDir, 'lib')}:${process.env.LD_LIBRARY_PATH ?? ''}`,
};
const run = (command: string, args: string[]) => execFileSync(command, args, { stdio: 'inherit', env });
const gltfTransform = (...args: string[]) => run(join(root, 'node_modules/.bin/gltf-transform'), args);

const work = mkdtempSync(join(tmpdir(), 'garage-car-'));
const step = (name: string) => join(work, name);
try {
  run('blender', ['-b', '--factory-startup', '--python', join(root, 'tools/blender/prepare_car.py'), '--', input, step('1-normalized.glb'), join(root, 'tools/car-map.json'), report]);
  gltfTransform('etc1s', step('1-normalized.glb'), step('2-ktx2.glb'), '--quality', '255');
  gltfTransform('meshopt', step('2-ktx2.glb'), output, '--level', 'medium');
} finally {
  rmSync(work, { recursive: true, force: true });
}
run('node', [join(root, 'tools/check-assets.ts')]);
```

`garage/tools/check-assets.ts`:

```ts
// Validates public/models/m3-gtr.glb against the car asset contract (spec §4.2) and its budgets.
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { assetErrors } from '../src/car/manifest.ts';

const file = resolve(import.meta.dirname, '../public/models/m3-gtr.glb');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const root = (await io.read(file)).getRoot();

const triangles = root
  .listMeshes()
  .flatMap((mesh) => mesh.listPrimitives())
  .reduce((sum, primitive) => sum + (primitive.getIndices() ?? primitive.getAttribute('POSITION'))!.getCount() / 3, 0);
const bytes = statSync(file).size;
const textureMimeTypes = root.listTextures().map((texture) => texture.getMimeType());

const errors = assetErrors({
  nodeNames: root.listNodes().map((node) => node.getName()),
  bytes,
  triangles,
  textureMimeTypes,
  paintMeshes: root.listNodes().filter((node) => node.getExtras().role === 'paint').length,
});
if (errors.length > 0) {
  console.error(`m3-gtr.glb breaks the asset contract:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`m3-gtr.glb OK: ${(bytes / 1048576).toFixed(1)} MB, ${Math.round(triangles)} triangles, ${textureMimeTypes.length} KTX2 textures.`);
```

- [ ] **Step 7: Run the pipeline**

Run: `cd garage && npx gltf-transform etc1s --help | head -40`
Expected: the help lists `--quality`. If the flag is named differently in 4.5.1, update the `etc1s` call in `prepare-car.ts` to match.

Run: `cd garage && npm run prepare:car`
Expected: `PREPARE_REPORT {...}`, then `m3-gtr.glb OK: <12 MB, ~117000 triangles, 18 KTX2 textures`.

Sanity-check `assets-src/prepare-report.json` against the source inspection (2026-10-10). Expected values are about: length 4.49 m, so `boundsMin[2] ≈ -2.245` and `boundsMax[2] ≈ 2.245`; height ≈ 1.27–1.30; `hinge ≈ [0, 0.79, 0.84]`; `hoodLength ≈ 1.29`; front wheels at `z ≈ 1.45`; rear wheels at `z ≈ -1.21`; wheel centre `y ≈ 0.31–0.33`. If they differ by more than 5 cm, fix `prepare_car.py` before continuing.

If the size check fails, add `'--slots', 'baseColorTexture'` and resize the non-paint textures before `etc1s`: `gltfTransform('resize', step('1-normalized.glb'), step('1b-resized.glb'), '--width', '1024', '--height', '1024', '--pattern', '{lambert*,breka*,blinn1[17]*,blinn21*,material*}')`. Then feed `1b-resized.glb` to `etc1s`.

- [ ] **Step 8: Credit the model**

`garage/CREDITS.md`:

```markdown
# Credits

## BMW M3 E46 GTR model

This work is based on "BMW M3 E46 GTR" (https://sketchfab.com/3d-models/bmw-m3-e46-gtr-7a0e538dd533481da79a6dcc0fc05213) by Flamestroke (https://sketchfab.com/Flamestroke) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).

Changes made for this project (`npm run prepare:car`): rescaled to 4.49 m, re-centered, regrouped into body and hood, hood hinge pivot and wheel/engine-bay markers added, paint and glass materials replaced at runtime, textures converted to KTX2, and geometry compressed with meshopt.

## Everything else

The garage, the P60B40 engine and engine bay, the sound, and the interface are original to this project.

*Need for Speed* and *Most Wanted* are trademarks of Electronic Arts. BMW and M3 are trademarks of BMW AG. This unofficial, non-commercial fan project is not affiliated with or endorsed by either.
```

In `.github/workflows/pages.yml` nothing else changes: `npm test` now also runs the asset check.

- [ ] **Step 9: Run all tests, then commit**

Run: `cd garage && npm test`
Expected: all Vitest tests pass, then `m3-gtr.glb OK: …`.

```bash
git add garage/src/car/manifest.ts garage/src/car/manifest.test.ts garage/tools garage/public/models/m3-gtr.glb garage/CREDITS.md garage/package.json garage/package-lock.json
git commit -m "Process the CC-BY M3 GTR model into a compressed, validated glb"
```

---

### Task 6: Load the car, with paint, hood hinge and screenshots

**Files:**
- Create: `garage/src/car/paint.ts`, `garage/src/car/prepareCar.ts`, `garage/src/car/hood.ts`, `garage/src/car/loaders.ts`, `garage/src/car/Car.tsx`
- Create: `garage/src/scene/Scene.tsx`, `garage/src/scene/ReadySignal.tsx`, `garage/tools/shot.ts`
- Modify: `garage/src/App.tsx`, `garage/src/main.tsx`, `garage/package.json` (Playwright)
- Test: `garage/src/car/prepareCar.test.ts`, `garage/src/car/hood.test.ts`

**Interfaces:**
- Consumes: `missingNodes` (Task 5), `useGarage`, `isHoodOpen`, `Vec3`, `QA` (Task 4).
- Produces:
  - `PAINT`, `paintMaterial(source)`, `glassMaterial()`, `primerMaterial()`.
  - `CarAnchors = { wheelFL, wheelFR, wheelRL, wheelRR, engineBay: Vec3 }`.
  - `CarRig = { root: Object3D; hood: Object3D; anchors: CarAnchors; bounds: Box3 }`; `prepareCar(root): CarRig`, which is idempotent.
  - `HOOD_OPEN_DEG = 52`, `HOOD_SECONDS = 0.6`, `hoodAngle(progress)`, `stepHood(progress, open, dt, reducedMotion)`.
  - `getKtx2Loader(renderer)`; `<Car>{(rig) => ReactNode}</Car>`; `<ReadySignal />`.
  - `node tools/shot.ts <url> <outDir> [action ...]`, where an action is `car:<id>`, `part:<id>`, `back` or `close`.

- [ ] **Step 1: Write the failing tests**

`garage/src/car/hood.test.ts`:

```ts
import { Euler, MathUtils, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { HOOD_OPEN_DEG, HOOD_SECONDS, hoodAngle, stepHood } from './hood';

describe('hood', () => {
  it('lifts the front edge when opened (car faces +Z)', () => {
    const tip = new Vector3(0, 0, 1).applyEuler(new Euler(hoodAngle(1), 0, 0));
    expect(tip.y).toBeGreaterThan(0.7);
    expect(hoodAngle(1)).toBeCloseTo(-MathUtils.degToRad(HOOD_OPEN_DEG));
    expect(hoodAngle(0)).toBe(0);
  });

  it('eases monotonically', () => {
    const angles = Array.from({ length: 11 }, (_, i) => hoodAngle(i / 10));
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeLessThanOrEqual(angles[i - 1]!);
  });

  it('takes HOOD_SECONDS to open and close, instantly under reduced motion', () => {
    let p = 0;
    for (let t = 0; t < HOOD_SECONDS - 0.05; t += 1 / 60) p = stepHood(p, true, 1 / 60, false);
    expect(p).toBeLessThan(1);
    for (let i = 0; i < 10; i++) p = stepHood(p, true, 1 / 60, false);
    expect(p).toBe(1);
    expect(stepHood(1, false, 1 / 60, true)).toBe(0);
    expect(stepHood(0, true, 1 / 60, true)).toBe(1);
  });
});
```

`garage/src/car/prepareCar.test.ts`:

```ts
import { BackSide, BoxGeometry, DoubleSide, FrontSide, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { prepareCar } from './prepareCar';

function fakeCar(omit?: string): Group {
  const root = new Group();
  const add = <T extends Object3D>(parent: Object3D, name: string, object: T): T => {
    object.name = name;
    parent.add(object);
    return object;
  };
  const body = add(root, 'Body', new Object3D());
  const shell = add(body, 'Paint_Shell', new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: new Texture(), side: DoubleSide })));
  shell.userData.role = 'paint';
  add(body, 'Glass', new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  add(body, 'Grille', new Mesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: 0 })));
  const hood = add(root, 'Hood', new Object3D());
  hood.position.set(0, 0.79, 0.84);
  const panel = add(hood, 'Hood_Panel', new Mesh(new BoxGeometry(), new MeshStandardMaterial({ side: DoubleSide })));
  panel.userData.role = 'paint';
  const wheels: Record<string, [number, number, number]> = { FL: [0.8, 0.32, 1.45], FR: [-0.8, 0.32, 1.45], RL: [0.8, 0.32, -1.21], RR: [-0.8, 0.32, -1.21] };
  for (const [label, position] of Object.entries(wheels)) add(root, `Marker_Wheel_${label}`, new Object3D()).position.set(...position);
  add(root, 'Marker_EngineBay', new Object3D()).position.set(0, 0.32, 1.49);
  if (omit) root.getObjectByName(omit)!.removeFromParent();
  return root;
}

describe('prepareCar', () => {
  it('names every missing contract node', () => {
    expect(() => prepareCar(fakeCar('Marker_EngineBay'))).toThrow('missing nodes: Marker_EngineBay');
  });

  it('turns paint into clear-coated physical paint and keeps the livery texture', () => {
    const rig = prepareCar(fakeCar());
    const shell = rig.root.getObjectByName('Paint_Shell') as Mesh;
    expect(shell.material).toBeInstanceOf(MeshPhysicalMaterial);
    expect((shell.material as MeshPhysicalMaterial).clearcoat).toBe(1);
    expect((shell.material as MeshPhysicalMaterial).map).toBeInstanceOf(Texture);
  });

  it('keeps trim from rendering as a perfect mirror', () => {
    const rig = prepareCar(fakeCar());
    expect(((rig.root.getObjectByName('Grille') as Mesh).material as MeshStandardMaterial).roughness).toBeGreaterThanOrEqual(0.18);
  });

  it('gives the hood a primer underside and paints only its top', () => {
    const rig = prepareCar(fakeCar());
    const panel = rig.root.getObjectByName('Hood_Panel') as Mesh;
    expect((panel.material as MeshStandardMaterial).side).toBe(FrontSide);
    const undersides = panel.children.filter((c) => c.userData.underside);
    expect(undersides).toHaveLength(1);
    expect(((undersides[0] as Mesh).material as MeshStandardMaterial).side).toBe(BackSide);
  });

  it('reads anchors from the markers and is safe to call twice', () => {
    const root = fakeCar();
    const first = prepareCar(root);
    const second = prepareCar(root);
    expect(second).toBe(first);
    expect(first.anchors.engineBay).toEqual([0, 0.32, 1.49]);
    expect(first.anchors.wheelFL).toEqual([0.8, 0.32, 1.45]);
    expect(first.hood.name).toBe('Hood');
    expect((root.getObjectByName('Hood_Panel') as Mesh).children.filter((c) => c.userData.underside)).toHaveLength(1);
  });
});
```

Run: `cd garage && npx vitest run src/car`
Expected: FAIL, `./hood` and `./prepareCar` not found.

- [ ] **Step 2: Implement the hood, the paint and `prepareCar`**

`garage/src/car/hood.ts`:

```ts
import { MathUtils } from 'three';

export const HOOD_OPEN_DEG = 52;
export const HOOD_SECONDS = 0.6;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Rotation about the hinge's local X axis. Negative lifts the front edge (car faces +Z, Y up). */
export function hoodAngle(progress: number): number {
  return -MathUtils.degToRad(HOOD_OPEN_DEG) * easeInOutCubic(MathUtils.clamp(progress, 0, 1));
}

/** Advances the 0..1 opening progress toward the target state. */
export function stepHood(progress: number, open: boolean, dt: number, reducedMotion: boolean): number {
  if (reducedMotion) return open ? 1 : 0;
  const delta = dt / HOOD_SECONDS;
  return open ? Math.min(1, progress + delta) : Math.max(0, progress - delta);
}
```

`garage/src/car/paint.ts`:

```ts
import { BackSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';

/** Clear-coated metallic paint. The livery stays in the base-color texture. */
export const PAINT = { metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 } as const;

export function paintMaterial(source: Material): MeshPhysicalMaterial {
  const original = source as MeshStandardMaterial;
  return new MeshPhysicalMaterial({
    name: `${original.name}-paint`,
    map: original.map ?? null,
    color: original.color?.clone(),
    side: original.side,
    ...PAINT,
  });
}

export function glassMaterial(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    name: 'glass',
    color: '#05080c',
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.86,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.5,
  });
}

/** Matte primer for the inside of the hood, which the source model textures with the livery. */
export function primerMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ name: 'primer', color: '#17191c', roughness: 0.78, metalness: 0.15, side: BackSide });
}
```

`garage/src/car/prepareCar.ts`:

```ts
import { Box3, FrontSide, Mesh, MeshStandardMaterial, Vector3, type Material, type Object3D } from 'three';
import type { Vec3 } from '../math';
import { missingNodes } from './manifest';
import { glassMaterial, paintMaterial, primerMaterial } from './paint';

/** The source's Maya export leaves some trim at roughness 0, which renders as a perfect mirror. */
const MIN_TRIM_ROUGHNESS = 0.18;

export type CarAnchors = { wheelFL: Vec3; wheelFR: Vec3; wheelRL: Vec3; wheelRR: Vec3; engineBay: Vec3 };
export type CarRig = { root: Object3D; hood: Object3D; anchors: CarAnchors; bounds: Box3 };

/** Validates the car contract, upgrades materials, and returns the handles the scene needs. Mutates `root` once. */
export function prepareCar(root: Object3D): CarRig {
  if (root.userData.rig) return root.userData.rig as CarRig;

  const names: string[] = [];
  root.traverse((object) => names.push(object.name));
  const missing = missingNodes(names);
  if (missing.length > 0) throw new Error(`m3-gtr.glb is missing nodes: ${missing.join(', ')}`);

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const role = object.userData.role ?? object.parent?.userData.role;
    if (role === 'paint') object.material = paintMaterial(object.material as Material);
    else if (object.material instanceof MeshStandardMaterial) object.material.roughness = Math.max(object.material.roughness, MIN_TRIM_ROUGHNESS);
  });
  root.getObjectByName('Glass')!.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = glassMaterial();
    object.castShadow = false;
  });

  // The source model shows the livery on the hood's underside, so paint only the top and add primer below.
  const hood = root.getObjectByName('Hood')!;
  const primer = primerMaterial();
  const hoodMeshes: Mesh[] = [];
  hood.traverse((object) => {
    if (object instanceof Mesh) hoodMeshes.push(object);
  });
  for (const mesh of hoodMeshes) {
    (mesh.material as Material).side = FrontSide;
    const underside = new Mesh(mesh.geometry, primer);
    underside.userData.underside = true;
    underside.receiveShadow = true;
    mesh.add(underside);
  }

  root.updateMatrixWorld(true);
  const at = (name: string): Vec3 => root.worldToLocal(root.getObjectByName(name)!.getWorldPosition(new Vector3())).toArray();
  const rig: CarRig = {
    root,
    hood,
    anchors: {
      wheelFL: at('Marker_Wheel_FL'),
      wheelFR: at('Marker_Wheel_FR'),
      wheelRL: at('Marker_Wheel_RL'),
      wheelRR: at('Marker_Wheel_RR'),
      engineBay: at('Marker_EngineBay'),
    },
    bounds: new Box3().setFromObject(root),
  };
  root.userData.rig = rig;
  return rig;
}
```

Run: `cd garage && npx vitest run src/car`
Expected: all pass. If the anchors come back as `0.32000000000000006`, compare them with `toBeCloseTo` per component. Don't round them in the code.

- [ ] **Step 3: Load the car in the scene**

`garage/src/car/loaders.ts`:

```ts
import type { WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

let ktx2: KTX2Loader | undefined;

/** One KTX2 loader per page. Its Basis transcoder (WebAssembly) is served from `basis/` beside index.html. */
export function getKtx2Loader(renderer: WebGLRenderer): KTX2Loader {
  ktx2 ??= new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(renderer);
  return ktx2;
}
```

`garage/src/car/Car.tsx`:

```tsx
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { hoodAngle, stepHood } from './hood';
import { getKtx2Loader } from './loaders';
import { prepareCar, type CarRig } from './prepareCar';

export const CAR_URL = `${import.meta.env.BASE_URL}models/m3-gtr.glb`;

export function Car({ children }: { children?: (rig: CarRig) => ReactNode }) {
  const gl = useThree((state) => state.gl);
  const gltf = useLoader(GLTFLoader, CAR_URL, (loader) => {
    loader.setKTX2Loader(getKtx2Loader(gl));
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const rig = useMemo(() => prepareCar(gltf.scene), [gltf]);
  const progress = useRef(0);

  useFrame((_, dt) => {
    const { view, reducedMotion } = useGarage.getState();
    progress.current = stepHood(progress.current, isHoodOpen(view), dt, reducedMotion);
    rig.hood.rotation.x = hoodAngle(progress.current);
  });

  return (
    <>
      <primitive object={rig.root} />
      {children?.(rig)}
    </>
  );
}
```

`garage/src/scene/ReadySignal.tsx`:

```tsx
import { useEffect } from 'react';
import { useGarage } from '../state/store';

/** Mounted after everything suspends: tells the loader, the HUD, and tests that the garage is ready. */
export function ReadySignal() {
  useEffect(() => {
    useGarage.getState().setReady();
    document.body.dataset.ready = 'true';
  }, []);
  return null;
}
```

`garage/src/scene/Scene.tsx` (temporary lighting; Tasks 7 and 8 replace it):

```tsx
import { CameraControls, Environment, Lightformer } from '@react-three/drei';
import { Car } from '../car/Car';
import { ReadySignal } from './ReadySignal';

export function Scene() {
  return (
    <>
      <color attach="background" args={['#0b0e12']} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[4, 6, 3]} intensity={2.5} castShadow />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 1, 1]} />
      </Environment>
      <Car />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#2a2d31" />
      </mesh>
      <CameraControls makeDefault />
      <ReadySignal />
    </>
  );
}
```

`garage/src/App.tsx`:

```tsx
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { QA } from './qa';
import { Scene } from './scene/Scene';
import { useGarage } from './state/store';

export function App() {
  const quality = useGarage((state) => state.quality);
  return (
    <div className="stage">
      <Canvas
        shadows
        dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: QA }}
        camera={{ position: [5.4, 1.55, 5.2], fov: 35, near: 0.05, far: 60 }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
```

In `garage/src/main.tsx`, expose the store to tests. Add these lines before `createRoot`:

```tsx
import { QA } from './qa';
import { useGarage } from './state/store';

if (QA) Object.assign(window, { garage: useGarage });
```

- [ ] **Step 4: Add the screenshot tool**

Run: `cd garage && npm install -D @playwright/test@^1.64.0 && npx playwright install chromium`

`garage/tools/shot.ts`:

```ts
// Saves screenshots of a running garage for visual review.
// Usage: node tools/shot.ts [url] [outDir] [action ...]
// Actions run in order, one screenshot each: car:<id>, part:<id>, back, close.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [url = 'http://localhost:5173/?qa&quality=high', out = 'test-results/shots', ...actions] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (message) => message.type() === 'error' && console.error('console error:', message.text()));
page.on('pageerror', (error) => console.error('page error:', error.message));

await page.goto(url);
await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 180_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/0-showroom.png` });

for (const [index, action] of actions.entries()) {
  await page.evaluate((step) => {
    const store = (window as unknown as { garage: { getState(): { dispatch(a: unknown): void } } }).garage.getState();
    const [kind, id] = step.split(':');
    if (kind === 'car') store.dispatch({ type: 'select-car', id });
    else if (kind === 'part') store.dispatch({ type: 'select-part', id });
    else if (kind === 'back') store.dispatch({ type: 'back' });
    else store.dispatch({ type: 'close-hood' });
  }, action);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}/${index + 1}-${action.replace(':', '-')}.png` });
}
await browser.close();
```

- [ ] **Step 5: Look at the car**

Run (two terminals): `cd garage && npm run dev`, then `cd garage && node tools/shot.ts http://localhost:5173/?qa test-results/shots car:hood`
Expected: there are no console errors. Then read both PNGs and check:
- `0-showroom.png`: the car stands on the floor, the right way up, faces +Z, and the livery reads blue and silver.
- `1-car-hood.png`: the hood is open about 50° on its rear edge, its underside is dark primer, and its top still carries the livery.

If the hood's top shows primer instead, its normals point down. In that case, swap `FrontSide`/`BackSide` in `prepareCar.ts` and `primerMaterial()`, then update the hood test to match.

- [ ] **Step 6: Commit**

```bash
git add garage/src garage/tools/shot.ts garage/package.json garage/package-lock.json
git commit -m "Load the M3 GTR with clear-coat paint and an opening hood"
```

---

### Task 7: The garage: procedural textures, props, lighting, post-processing

**Files:**
- Create: `garage/src/scene/layout.ts`, `textures.ts`, `flicker.ts`, `props.tsx`, `Garage.tsx`, `Lighting.tsx`, `splitTone.ts`, `Effects.tsx`, `FrameMonitor.tsx`
- Modify: `garage/src/scene/Scene.tsx`, `garage/src/App.tsx`
- Test: `garage/src/scene/textures.test.ts`, `garage/src/scene/flicker.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `Vec3`, `useGarage`, `trackFrame` (Task 4); `<Car>`, `<ReadySignal>` (Task 6).
- Produces: `ROOM`, `TUBES`; `valueNoise`, `fbm`, `concreteMaps(size, seed)`, `streakMaps(size, seed)`, `dataTexture(...)`, `garageTextures()`; `flickerLevel(t, seed?)`; components `<Garage/>`, `<Lighting/>`, `<Effects/>`, `<FrameMonitor/>`; `SplitToneEffect`, `<SplitTone/>`.

- [ ] **Step 1: Write the failing tests**

`garage/src/scene/textures.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { concreteMaps, fbm, streakMaps } from './textures';
import { mulberry32 } from '../random';

const mean = (data: Uint8Array, channel = 0) => {
  let sum = 0;
  for (let i = channel; i < data.length; i += 4) sum += data[i]!;
  return sum / (data.length / 4) / 255;
};

describe('procedural textures', () => {
  it('fbm stays within 0..1 and is repeatable', () => {
    const a = fbm(64, mulberry32(3));
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    expect(fbm(64, mulberry32(3))).toEqual(a);
  });

  it('concrete is repeatable per seed and different across seeds', () => {
    expect(concreteMaps(64, 1).albedo).toEqual(concreteMaps(64, 1).albedo);
    expect(concreteMaps(64, 1).albedo).not.toEqual(concreteMaps(64, 2).albedo);
  });

  it('concrete looks like polished concrete with darker joints', () => {
    const { albedo, roughness, size } = concreteMaps(128, 1);
    expect(mean(albedo)).toBeGreaterThan(0.2);
    expect(mean(albedo)).toBeLessThan(0.55);
    expect(mean(roughness, 1)).toBeGreaterThan(0.4);
    expect(mean(roughness, 1)).toBeLessThan(0.95);
    const joint = albedo[(64 * size + 0) * 4]!;
    const slab = albedo[(64 * size + 64) * 4]!;
    expect(joint).toBeLessThan(slab + 1);
  });

  it('wall grime has the requested size', () => {
    expect(streakMaps(32, 4).albedo).toHaveLength(32 * 32 * 4);
  });
});
```

`garage/src/scene/flicker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { flickerLevel } from './flicker';

describe('flickerLevel', () => {
  const samples = Array.from({ length: 60 * 60 }, (_, i) => flickerLevel(i / 60));

  it('is mostly on, with real stutters', () => {
    const on = samples.filter((v) => v === 1).length / samples.length;
    expect(on).toBeGreaterThan(0.85);
    expect(samples.some((v) => v < 0.2)).toBe(true);
  });

  it('is repeatable and bounded', () => {
    expect(samples.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(flickerLevel(12.34)).toBe(flickerLevel(12.34));
  });
});
```

Run: `cd garage && npx vitest run src/scene`
Expected: FAIL, modules not found.

- [ ] **Step 2: Implement textures, flicker and layout**

`garage/src/scene/textures.ts`:

```ts
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, SRGBColorSpace } from 'three';
import { clamp } from '../math';
import { mulberry32 } from '../random';

/** Tileable value noise on a size×size grid with `cells` lattice cells per side. */
export function valueNoise(size: number, cells: number, rand: () => number): Float32Array {
  const lattice = Float32Array.from({ length: cells * cells }, rand);
  const at = (i: number, j: number) => lattice[(j % cells) * cells + (i % cells)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = smooth(fx - x0);
      const ty = smooth(fy - y0);
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      out[y * size + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}

/** Octaves of value noise, normalized to 0..1. */
export function fbm(size: number, rand: () => number, octaves = 5, baseCells = 4): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const layer = valueNoise(size, baseCells << octave, rand);
    for (let i = 0; i < out.length; i++) out[i] += layer[i]! * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const byte = (v: number) => Math.round(clamp(v, 0, 1) * 255);

/** Polished, oil-stained concrete. One tile is one floor slab; its left and bottom edges are the expansion joint. */
export function concreteMaps(size: number, seed: number): { size: number; albedo: Uint8Array; roughness: Uint8Array } {
  const rand = mulberry32(seed);
  const base = fbm(size, rand, 5, 4);
  const stains = fbm(size, rand, 3, 2);
  const albedo = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const joint = Math.max(2, Math.round(size / 256));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const edge = x < joint || y < joint;
      const stain = Math.max(0, stains[i]! - 0.55) * 2.2;
      const tone = 0.34 + base[i]! * 0.18 - stain * 0.16 - (edge ? 0.14 : 0);
      albedo.set([byte(tone), byte(tone), byte(tone * 1.03), 255], i * 4);
      const rough = byte(Math.max(0.05, 0.62 + base[i]! * 0.22 - stain * 0.38 + (edge ? 0.2 : 0)));
      roughness.set([rough, rough, rough, 255], i * 4); // three reads roughness from green
    }
  }
  return { size, albedo, roughness };
}

/** Grimy sheet metal with rust streaks running down from the top. */
export function streakMaps(size: number, seed: number): { size: number; albedo: Uint8Array } {
  const rand = mulberry32(seed);
  const base = fbm(size, rand, 4, 4);
  const column = Float32Array.from({ length: size }, rand);
  const albedo = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const streak = (column[x]! + column[(x + 1) % size]! + column[(x + size - 1) % size]!) / 3;
      const runoff = Math.max(0, streak - 0.6) * (y / size) * 1.8; // DataTexture row 0 is the bottom
      const v = 0.55 + base[i]! * 0.3 - runoff * 0.5;
      albedo.set([byte(v), byte(v * 0.95), byte(v * 0.88), 255], i * 4);
    }
  }
  return { size, albedo };
}

export function dataTexture(data: Uint8Array, size: number, srgb: boolean, repeat: [number, number]): DataTexture {
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function garageTextures() {
  const concrete = concreteMaps(512, 1);
  const grime = streakMaps(256, 3);
  const block = concreteMaps(256, 2);
  return {
    floor: dataTexture(concrete.albedo, 512, true, [6, 6]),
    floorRoughness: dataTexture(concrete.roughness, 512, false, [6, 6]),
    wall: dataTexture(grime.albedo, 256, true, [4, 1]),
    door: dataTexture(grime.albedo, 256, true, [1, 1]),
    backWall: dataTexture(block.albedo, 256, true, [5, 1.5]),
  };
}
```

`garage/src/scene/flicker.ts`:

```ts
import { mulberry32 } from '../random';

const PERIOD = 6;
const STUTTER = 1.1;
const BLINK = 0.07;

/** Brightness 0..1 for a failing fluorescent tube: mostly on, with one seeded stutter every few seconds. */
export function flickerLevel(t: number, seed = 7): number {
  const cycle = Math.floor(t / PERIOD);
  const start = mulberry32(seed * 9973 + cycle)() * (PERIOD - STUTTER - 0.1);
  const local = t - cycle * PERIOD - start;
  if (local < 0 || local > STUTTER) return 1;
  const blink = Math.floor(local / BLINK);
  return mulberry32(seed + cycle * 131 + blink)() < 0.45 ? 0.08 : 1;
}
```

`garage/src/scene/layout.ts`:

```ts
import type { Vec3 } from '../math';

/** Garage interior in car space (m). The car sits at the origin, facing +Z. */
export const ROOM = { halfWidth: 8.5, back: -7.5, front: 9.5, height: 4.4 } as const;

export const TUBES: { position: Vec3; flicker: boolean }[] = [
  { position: [0, 3.75, -1.3], flicker: false },
  { position: [0, 3.75, 1.3], flicker: false },
  { position: [-3.6, 3.75, 0.2], flicker: true },
  { position: [3.6, 3.75, -0.4], flicker: false },
];
```

Run: `cd garage && npx vitest run src/scene`
Expected: 6 passed.

- [ ] **Step 3: Build the props and the room**

`garage/src/scene/props.tsx`:

```tsx
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { DoubleSide, Matrix4, PlaneGeometry, type InstancedMesh, type MeshStandardMaterial, type RectAreaLight, type Texture } from 'three';
import type { Vec3 } from '../math';
import { flickerLevel } from './flicker';

type Placed = { position: Vec3; rotationY?: number };

const TUBE_GLOW = 7;
const TUBE_LIGHT = 14;
const frame = { color: '#2a2d31', metalness: 0.7, roughness: 0.5 } as const;

export function HangingTube({ position, flicker = false }: { position: Vec3; flicker?: boolean }) {
  const glow = useRef<MeshStandardMaterial>(null);
  const light = useRef<RectAreaLight>(null);
  useFrame(({ clock }) => {
    if (!flicker) return;
    const level = flickerLevel(clock.elapsedTime);
    if (glow.current) glow.current.emissiveIntensity = TUBE_GLOW * level;
    if (light.current) light.current.intensity = TUBE_LIGHT * level;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[1.7, 0.07, 0.18]} />
        <meshStandardMaterial color="#2c3036" roughness={0.5} metalness={0.8} />
      </mesh>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.022, 0.022, 1.55, 12]} />
        <meshStandardMaterial ref={glow} color="#111111" emissive="#e4ecff" emissiveIntensity={TUBE_GLOW} />
      </mesh>
      <rectAreaLight ref={light} args={['#e4ecff', TUBE_LIGHT, 1.55, 0.12]} position={[0, -0.03, 0]} rotation-x={-Math.PI / 2} />
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.42, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 0.65, 4]} />
          <meshStandardMaterial color="#1a1c1f" />
        </mesh>
      ))}
    </group>
  );
}

const TOOLS: [number, number, number, number][] = [
  [-0.8, 1.8, 0.04, 0.38], [-0.6, 1.75, 0.05, 0.3], [-0.4, 1.82, 0.03, 0.42], [-0.1, 1.7, 0.22, 0.04],
  [0.2, 1.85, 0.04, 0.34], [0.45, 1.6, 0.3, 0.05], [0.8, 1.78, 0.05, 0.36],
];

export function Workbench({ position, rotationY = 0 }: Placed) {
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.06, 0.75]} />
        <meshStandardMaterial color="#4a3b2c" roughness={0.85} />
      </mesh>
      {[[-1, -0.32], [1, -0.32], [-1, 0.32], [1, 0.32]].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x!, 0.45, z!]} castShadow>
          <boxGeometry args={[0.06, 0.9, 0.06]} />
          <meshStandardMaterial {...frame} />
        </mesh>
      ))}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[2.1, 0.03, 0.65]} />
        <meshStandardMaterial {...frame} />
      </mesh>
      <mesh position={[0, 1.65, -0.36]} receiveShadow>
        <boxGeometry args={[2.2, 1.2, 0.02]} />
        <meshStandardMaterial color="#6b5a43" roughness={0.9} />
      </mesh>
      {TOOLS.map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, -0.33]}>
          <boxGeometry args={[w, h, 0.02]} />
          <meshStandardMaterial color={i % 3 === 0 ? '#b2412f' : '#8e959c'} metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0.7, 1.02, 0.1]} castShadow>
        <boxGeometry args={[0.18, 0.18, 0.22]} />
        <meshStandardMaterial color="#2d5d9f" roughness={0.5} metalness={0.4} />
      </mesh>
      <RoundedBox args={[0.5, 0.22, 0.24]} radius={0.02} position={[-0.6, 1.04, 0.05]} castShadow>
        <meshStandardMaterial color="#b2412f" roughness={0.45} metalness={0.3} />
      </RoundedBox>
    </group>
  );
}

export function ToolChest({ position, rotationY = 0 }: Placed) {
  const casters = [-0.38, 0.38].flatMap((x) => [-0.18, 0.18].map((z) => [x, z] as const));
  return (
    <group position={position} rotation-y={rotationY}>
      <RoundedBox args={[0.9, 1.0, 0.5]} radius={0.02} position={[0, 0.58, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#a3221b" roughness={0.35} metalness={0.2} clearcoat={0.6} />
      </RoundedBox>
      {[0.2, 0.36, 0.52, 0.68, 0.84, 0.98].map((y) => (
        <mesh key={y} position={[0, y, 0.255]}>
          <boxGeometry args={[0.6, 0.015, 0.02]} />
          <meshStandardMaterial color="#c9ced6" metalness={1} roughness={0.25} />
        </mesh>
      ))}
      {casters.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.05, z]}>
          <cylinderGeometry args={[0.04, 0.04, 0.05, 12]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
      ))}
    </group>
  );
}

export function TireStack({ position, count = 4 }: { position: Vec3; count?: number }) {
  return (
    <group position={position}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[Math.sin(i * 1.7) * 0.03, 0.12 + i * 0.235, Math.cos(i * 2.3) * 0.03]} rotation-x={Math.PI / 2} castShadow receiveShadow>
          <torusGeometry args={[0.24, 0.115, 16, 40]} />
          <meshStandardMaterial color="#121314" roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}

export function OilDrum({ position, color = '#1f4f8a' }: { position: Vec3; color?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.29, 0.29, 0.88, 32]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.5} />
      </mesh>
      {[0.3, 0.58].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.292, 0.012, 8, 40]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

const SHELF_LEVELS = [0.15, 0.75, 1.35, 1.95];
const BOXES: [number, number, number, number, string][] = [
  [-0.6, 0, 0.5, 0.35, '#6d5638'], [0.1, 0, 0.4, 0.3, '#6d5638'], [0.6, 1, 0.35, 0.25, '#2f5d8a'],
  [-0.5, 1, 0.3, 0.42, '#8a2f2a'], [0.2, 2, 0.6, 0.3, '#6d5638'], [-0.55, 3, 0.4, 0.2, '#3e4a3a'],
];

export function Shelf({ position, rotationY = 0 }: Placed) {
  const posts = [-0.98, 0.98].flatMap((x) => [-0.23, 0.23].map((z) => [x, z] as const));
  return (
    <group position={position} rotation-y={rotationY}>
      {SHELF_LEVELS.map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[2, 0.04, 0.5]} />
          <meshStandardMaterial color="#3b4047" metalness={0.6} roughness={0.55} />
        </mesh>
      ))}
      {posts.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 1.05, z]}>
          <boxGeometry args={[0.04, 2.1, 0.04]} />
          <meshStandardMaterial {...frame} />
        </mesh>
      ))}
      {BOXES.map(([x, level, w, h, color], i) => (
        <mesh key={i} position={[x, SHELF_LEVELS[level]! + 0.02 + h / 2, 0]} castShadow>
          <boxGeometry args={[w, h, 0.36]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function RollerDoor({ position, map }: { position: Vec3; map: Texture }) {
  const slats = 30;
  const slat = 0.115;
  const width = 5;
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const matrix = new Matrix4();
    for (let i = 0; i < slats; i++) mesh.current!.setMatrixAt(i, matrix.makeTranslation(0, slat / 2 + i * slat, 0));
    mesh.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group position={position}>
      <instancedMesh ref={mesh} args={[undefined, undefined, slats]} receiveShadow>
        <boxGeometry args={[width, slat * 0.92, 0.04]} />
        <meshStandardMaterial color="#5f6670" map={map} roughness={0.6} metalness={0.6} />
      </instancedMesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 + 0.06), (slats * slat) / 2, 0]}>
          <boxGeometry args={[0.1, slats * slat, 0.1]} />
          <meshStandardMaterial {...frame} />
        </mesh>
      ))}
      <mesh position={[0, slats * slat + 0.18, 0.1]}>
        <boxGeometry args={[width + 0.3, 0.36, 0.36]} />
        <meshStandardMaterial {...frame} />
      </mesh>
    </group>
  );
}

function corrugated(width: number, height: number): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height, Math.round(width / 0.02), 1);
  const position = geometry.attributes.position!;
  for (let i = 0; i < position.count; i++) position.setZ(i, Math.sin((position.getX(i) / 0.076) * Math.PI * 2) * 0.012);
  geometry.computeVertexNormals();
  geometry.translate(0, height / 2, 0);
  return geometry;
}

export function CorrugatedWall({ width, height, position, rotationY = 0, map }: Placed & { width: number; height: number; map: Texture }) {
  const geometry = useMemo(() => corrugated(width, height), [width, height]);
  return (
    <mesh geometry={geometry} position={position} rotation-y={rotationY} receiveShadow>
      <meshStandardMaterial color="#7c838c" map={map} roughness={0.7} metalness={0.55} side={DoubleSide} />
    </mesh>
  );
}
```

`garage/src/scene/Garage.tsx`:

```tsx
import { MeshReflectorMaterial } from '@react-three/drei';
import { useMemo } from 'react';
import { useGarage } from '../state/store';
import { ROOM, TUBES } from './layout';
import { CorrugatedWall, HangingTube, OilDrum, RollerDoor, Shelf, TireStack, ToolChest, Workbench } from './props';
import { garageTextures } from './textures';

export function Garage() {
  const textures = useMemo(garageTextures, []);
  const high = useGarage((state) => state.quality) === 'high';
  const depth = ROOM.front - ROOM.back;
  const zMid = (ROOM.front + ROOM.back) / 2;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, zMid]} receiveShadow>
        <planeGeometry args={[ROOM.halfWidth * 2, depth]} />
        <MeshReflectorMaterial
          map={textures.floor}
          roughnessMap={textures.floorRoughness}
          roughness={1}
          metalness={0.2}
          blur={high ? [400, 120] : [0, 0]}
          resolution={high ? 1024 : 256}
          mixBlur={1}
          mixStrength={high ? 1.4 : 0.6}
          mixContrast={1}
          depthScale={1.2}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          mirror={0}
        />
      </mesh>
      <mesh position={[0, ROOM.height, zMid]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[ROOM.halfWidth * 2, depth]} />
        <meshStandardMaterial color="#0b0d10" roughness={1} />
      </mesh>
      {[-4, 0, 4].map((z) => (
        <mesh key={z} position={[0, ROOM.height - 0.15, z]}>
          <boxGeometry args={[ROOM.halfWidth * 2, 0.3, 0.16]} />
          <meshStandardMaterial color="#1c1f23" metalness={0.6} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, ROOM.height / 2, ROOM.back]} receiveShadow>
        <planeGeometry args={[ROOM.halfWidth * 2, ROOM.height]} />
        <meshStandardMaterial map={textures.backWall} color="#8a8e94" roughness={0.95} />
      </mesh>
      <mesh position={[0, ROOM.height / 2, ROOM.front]} rotation-y={Math.PI}>
        <planeGeometry args={[ROOM.halfWidth * 2, ROOM.height]} />
        <meshStandardMaterial map={textures.backWall} color="#6e7278" roughness={0.95} />
      </mesh>
      <CorrugatedWall width={depth} height={ROOM.height} position={[ROOM.halfWidth, 0, zMid]} rotationY={-Math.PI / 2} map={textures.wall} />
      <CorrugatedWall width={depth} height={ROOM.height} position={[-ROOM.halfWidth, 0, zMid]} rotationY={Math.PI / 2} map={textures.wall} />
      <RollerDoor position={[0, 0, ROOM.back + 0.06]} map={textures.door} />
      <Workbench position={[7.95, 0, -2.2]} rotationY={-Math.PI / 2} />
      <ToolChest position={[8.0, 0, 1.6]} rotationY={-Math.PI / 2} />
      <Shelf position={[-8.15, 0, -2.6]} rotationY={Math.PI / 2} />
      <TireStack position={[-7.6, 0, 1.2]} />
      <TireStack position={[-7.0, 0, 1.9]} count={3} />
      <OilDrum position={[-7.7, 0, 3.2]} />
      <OilDrum position={[-7.1, 0, 3.6]} color="#7a2a22" />
      {TUBES.map((tube) => (
        <HangingTube key={tube.position.join(',')} position={tube.position} flicker={tube.flicker} />
      ))}
    </group>
  );
}
```

- [ ] **Step 4: Lights, effects and the frame monitor**

`garage/src/scene/Lighting.tsx`:

```tsx
import { Environment, Lightformer } from '@react-three/drei';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { TUBES } from './layout';

RectAreaLightUniformsLib.init();

/** Warm amber key, cool teal rim, and strip lights in the environment so the paint shows long highlights. */
export function Lighting() {
  return (
    <>
      <hemisphereLight args={['#1d2836', '#0a0806', 0.35]} />
      <spotLight position={[3.5, 5.2, 3]} angle={0.62} penumbra={0.85} intensity={180} distance={18} decay={2} color="#ffb46b" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />
      <spotLight position={[-4.5, 4.5, -4]} angle={0.7} penumbra={1} intensity={90} distance={16} decay={2} color="#6fa8ff" />
      <Environment resolution={256} frames={1}>
        {TUBES.map((tube) => (
          <Lightformer key={tube.position.join(',')} form="rect" intensity={4} color="#e9f0ff" position={tube.position} rotation-x={Math.PI / 2} scale={[1.6, 0.12, 1]} />
        ))}
        <Lightformer form="rect" intensity={1.2} color="#ffb46b" position={[6, 2, 0]} rotation-y={-Math.PI / 2} scale={[6, 1.2, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#6fa8ff" position={[-6, 2, 0]} rotation-y={Math.PI / 2} scale={[6, 1.2, 1]} />
        <Lightformer form="ring" intensity={0.4} color="#ffffff" position={[0, 5, -6]} scale={3} />
      </Environment>
    </>
  );
}
```

`garage/src/scene/splitTone.ts`:

```ts
import { wrapEffect } from '@react-three/postprocessing';
import { BlendFunction, Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

const fragment = /* glsl */ `
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float strength;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float luma = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 tint = mix(shadowTint, highlightTint, smoothstep(0.08, 0.6, luma));
  outputColor = vec4(inputColor.rgb + (tint - 0.5) * strength, inputColor.a);
}`;

type SplitToneOptions = { strength?: number; shadowTint?: [number, number, number]; highlightTint?: [number, number, number] };

/** Teal shadows and amber highlights: the garage's color grade. */
export class SplitToneEffect extends Effect {
  constructor({ strength = 0.2, shadowTint = [0.38, 0.52, 0.56], highlightTint = [0.64, 0.53, 0.38] }: SplitToneOptions = {}) {
    super('SplitToneEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['shadowTint', new Uniform(new Vector3(...shadowTint))],
        ['highlightTint', new Uniform(new Vector3(...highlightTint))],
        ['strength', new Uniform(strength)],
      ]),
    });
  }
}

export const SplitTone = wrapEffect(SplitToneEffect);
```

`garage/src/scene/Effects.tsx`:

```tsx
import { Bloom, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useGarage } from '../state/store';
import { SplitTone } from './splitTone';

export function Effects() {
  const quality = useGarage((state) => state.quality);
  if (quality === 'low') {
    return (
      <EffectComposer key="low" multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={1} intensity={0.7} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <SplitTone strength={0.22} />
        <Vignette offset={0.22} darkness={0.72} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer key="high" multisampling={4}>
      <N8AO aoRadius={0.7} intensity={2.4} distanceFalloff={0.8} quality="medium" halfRes />
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.9} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SplitTone strength={0.22} />
      <Vignette offset={0.22} darkness={0.72} />
      <Noise opacity={0.035} premultiply />
    </EffectComposer>
  );
}
```

`garage/src/scene/FrameMonitor.tsx`:

```tsx
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { trackFrame, type FrameWindow } from '../state/quality';
import { useGarage } from '../state/store';

const WARMUP_SECONDS = 3;

/** Drops to low quality once frames stay slow; never switches back up. */
export function FrameMonitor() {
  const window = useRef<FrameWindow>({ elapsed: 0, frames: 0 });
  const warmup = useRef(WARMUP_SECONDS);
  useFrame((_, dt) => {
    const { quality, qualityLocked, setQuality } = useGarage.getState();
    if (quality === 'low' || qualityLocked) return;
    if (warmup.current > 0) {
      warmup.current -= dt;
      return;
    }
    const result = trackFrame(window.current, dt);
    window.current = result.window;
    if (result.overBudget) setQuality('low');
  });
  return null;
}
```

- [ ] **Step 5: Compose the scene**

Replace `garage/src/scene/Scene.tsx`:

```tsx
import { CameraControls, ContactShadows, Sparkles } from '@react-three/drei';
import { Car } from '../car/Car';
import { Effects } from './Effects';
import { FrameMonitor } from './FrameMonitor';
import { Garage } from './Garage';
import { Lighting } from './Lighting';
import { ReadySignal } from './ReadySignal';

export function Scene() {
  return (
    <>
      <color attach="background" args={['#05070a']} />
      <fog attach="fog" args={['#05070a', 10, 24]} />
      <Lighting />
      <Garage />
      <Car />
      <ContactShadows position={[0, 0.005, 0]} scale={9} resolution={1024} far={1.6} blur={2.4} opacity={0.8} frames={1} />
      <Sparkles count={70} scale={[12, 3.5, 12]} position={[0, 1.8, 0]} size={1.6} speed={0.12} opacity={0.22} color="#ffd9a6" />
      <CameraControls makeDefault />
      <Effects />
      <FrameMonitor />
      <ReadySignal />
    </>
  );
}
```

In `garage/src/App.tsx`, add `flat` to `<Canvas>` and change `antialias: true` to `antialias: false`. Tone mapping and anti-aliasing now come from the composer.

- [ ] **Step 6: Look at it and tune**

Run: `cd garage && npm run dev`, then `node tools/shot.ts "http://localhost:5173/?qa&quality=high" test-results/shots car:hood`
Read both PNGs. The bar to meet:
- Moody, not murky. The car is the brightest thing in the frame, and the strip highlights run along the body.
- The floor shows soft reflections of the car and the tubes.
- The teal-and-amber grade is visible but subtle.
- No black or blown-out surfaces.

Tune only these numbers: spot `intensity`, `TUBE_LIGHT`, the Lightformer `intensity`, `PAINT.roughness`, the `SplitTone` strength, and the `Vignette` darkness. Iterate until the bar is met. Then take `quality=low` shots and check that the scene still reads.

Run: `cd garage && npm test && npm run build`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add garage/src
git commit -m "Build the moody garage: concrete, props, strip lights, and color grade"
```

---

### Task 8: Camera rig and shots

**Files:**
- Create: `garage/src/car/shots.ts`, `garage/src/engine/anchors.ts`, `garage/src/scene/CameraRig.tsx`
- Modify: `garage/src/scene/Scene.tsx`
- Test: `garage/src/car/shots.test.ts`

**Interfaces:**
- Consumes: `View` (Task 4), `CarTopicId`, `EngineTopicId` (Task 3), `HOOD_OPEN_DEG` (Task 6), `CarRig` (Task 6), `ROOM` (Task 7), `Vec3` math.
- Produces: `ENGINE_ANCHORS: Record<EngineTopicId, { position: Vec3; normal: Vec3 }>`, `BAY`; `Shot`, `CarShotId`, `CAR_SOLIDS`, `CAR_SHOTS`, `HOOD_PANEL`, `ENGINE_OFFSET`, `engineOrigin(bay)`, `engineShot(origin, id)`, `shotFor(view, bay)`, `insideSolid(point, margin?)`, `segmentHitsHood(from, to, panel, angleRad)`; `<CameraRig bay={Vec3} />`, and `window.garageCamera()` when the page runs with `?qa`.

- [ ] **Step 1: Copy the measured numbers in**

Open `garage/assets-src/prepare-report.json`. The constants below use the values measured on 2026-10-10. Where the report differs, use the report's value:
- `HOOD_PANEL.hinge`: the report's `hinge`.
- `HOOD_PANEL.length`: `hoodLength`.
- `HOOD_PANEL.halfWidth`: `hoodHalfWidth`.
- `EXPECTED_BAY` in the test: `engineBay`.
- `CAR_SOLIDS`: the lower box spans the `boundsMin` and `boundsMax` x and z values, and stops at the hood surface height `hinge[1] + 0.07`.

- [ ] **Step 2: Write the failing tests**

`garage/src/car/shots.test.ts`:

```ts
import { MathUtils } from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_TOPIC_IDS } from '../content/car';
import { ENGINE_TOPIC_IDS } from '../content/engine';
import { BAY, ENGINE_ANCHORS } from '../engine/anchors';
import { add, type Vec3 } from '../math';
import { ROOM } from '../scene/layout';
import { CAR_SHOTS, engineOrigin, engineShot, HOOD_PANEL, insideSolid, segmentHitsHood, shotFor } from './shots';
import { HOOD_OPEN_DEG } from './hood';

const EXPECTED_BAY: Vec3 = [0, 0.32, 1.49];
const open = MathUtils.degToRad(HOOD_OPEN_DEG);
const origin = engineOrigin(EXPECTED_BAY);
const engineShots = ENGINE_TOPIC_IDS.map((id) => [id, engineShot(origin, id)] as const);
const allShots = [...Object.entries(CAR_SHOTS), ...engineShots];

describe('camera shots', () => {
  it('keeps every camera outside the car, above the floor and inside the room', () => {
    for (const [id, shot] of allShots) {
      expect(insideSolid(shot.position), id).toBe(false);
      expect(shot.position[1], id).toBeGreaterThan(0.2);
      expect(Math.abs(shot.position[0]), id).toBeLessThan(ROOM.halfWidth - 0.4);
      expect(shot.position[2], id).toBeGreaterThan(ROOM.back + 0.4);
      expect(shot.position[2], id).toBeLessThan(ROOM.front - 0.4);
    }
  });

  it('never looks at the engine through the open hood', () => {
    const bayShots = [['bay', CAR_SHOTS.bay] as const, ...engineShots];
    for (const [id, shot] of bayShots) expect(segmentHitsHood(shot.position, shot.target, HOOD_PANEL, open), id).toBe(false);
  });

  it('detects a camera that would look through the hood', () => {
    const above: Vec3 = [0, 3, 1.3];
    expect(segmentHitsHood(above, [0, 0.4, 1.2], HOOD_PANEL, open)).toBe(true);
    expect(segmentHitsHood(above, [0, 0.4, 1.2], HOOD_PANEL, 0)).toBe(true);
    expect(segmentHitsHood([3, 1, 1.2], [2, 1, 1.2], HOOD_PANEL, open)).toBe(false);
  });

  it('maps every view to a shot', () => {
    for (const id of CAR_TOPIC_IDS) {
      const view = id === 'hood' ? ({ kind: 'bay' } as const) : ({ kind: 'focus', id } as const);
      expect(shotFor(view, EXPECTED_BAY).target).toHaveLength(3);
    }
    expect(shotFor({ kind: 'bay-part', id: 'crank' }, EXPECTED_BAY)).toEqual(engineShot(origin, 'crank'));
  });
});

describe('engine anchors', () => {
  it('sit inside the engine bay', () => {
    for (const id of ENGINE_TOPIC_IDS) {
      const [x, y, z] = add(origin, ENGINE_ANCHORS[id].position);
      expect(Math.abs(x), id).toBeLessThan(BAY.halfWidth);
      expect(z, id).toBeGreaterThan(BAY.rearZ);
      expect(z, id).toBeLessThan(BAY.frontZ);
      expect(y, id).toBeGreaterThan(BAY.floorY);
    }
  });
});
```

Run: `cd garage && npx vitest run src/car/shots.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the anchors and shots**

`garage/src/engine/anchors.ts`:

```ts
import type { EngineTopicId } from '../content/engine';
import type { Vec3 } from '../math';

/** Hotspot positions in engine space (origin on the crank axis, mid-block; +Z toward the car's nose). */
export const ENGINE_ANCHORS: Record<EngineTopicId, { position: Vec3; normal: Vec3 }> = {
  layout: { position: [-0.24, 0.1, -0.2], normal: [-0.7, 0.5, 0.2] },
  heads: { position: [0.29, 0.33, -0.05], normal: [0.7, 0.7, 0] },
  crank: { position: [0, 0, 0.31], normal: [0, 1.2, 1] }, // steep, so the view clears the radiator
  restrictors: { position: [0.07, 0.4, 0.38], normal: [0, 0.5, 1] },
  'dry-sump': { position: [-0.52, 0.23, 0.12], normal: [-0.5, 1, 0] },
  fuel: { position: [-0.15, 0.36, -0.1], normal: [0, 1, 0.2] },
  headers: { position: [0.42, -0.02, 0.05], normal: [0.6, 0.8, 0.2] }, // from above, not through the fender
  'game-turbo': { position: [0, 0.58, 0.05], normal: [0, 1, 0.3] },
};

/** The engine bay in car space (m), from prepare-report.json: hood hinge to radiator, between the inner fenders. */
export const BAY = { rearZ: 0.86, frontZ: 2.02, halfWidth: 0.68, floorY: 0.1, topY: 0.76 } as const;
```

`garage/src/car/shots.ts`:

```ts
import type { CarTopicId } from '../content/car';
import type { EngineTopicId } from '../content/engine';
import { ENGINE_ANCHORS } from '../engine/anchors';
import { add, dot, normalize, scale, sub, type Vec3 } from '../math';
import type { View } from '../state/view';

export type Shot = { position: Vec3; target: Vec3 };
export type CarShotId = 'showroom' | 'bay' | Exclude<CarTopicId, 'hood'>;

/** Solid volumes of the car (lower body, cabin, rear wing), from prepare-report.json. */
export const CAR_SOLIDS: { min: Vec3; max: Vec3 }[] = [
  { min: [-1.0, 0, -2.25], max: [1.0, 0.86, 2.25] },
  { min: [-0.78, 0.86, -1.15], max: [0.78, 1.3, 0.75] },
  { min: [-0.9, 0.86, -2.3], max: [0.9, 1.32, -1.7] },
];

/** The hood panel, hinged along X at its rear edge. */
export const HOOD_PANEL = { hinge: [0, 0.79, 0.84] as Vec3, length: 1.29, halfWidth: 0.72 };

/** Engine origin relative to Marker_EngineBay: crank axis a little low and behind the bay centre. */
export const ENGINE_OFFSET: Vec3 = [0, -0.02, -0.22];

export const CAR_SHOTS: Record<CarShotId, Shot> = {
  showroom: { position: [5.4, 1.55, 5.2], target: [0, 0.55, 0] },
  bay: { position: [1.7, 2.35, 3.6], target: [0, 0.6, 1.3] },
  'front-aero': { position: [1.9, 0.75, 4.6], target: [0, 0.3, 2.0] },
  'rear-wing': { position: [-2.8, 2.1, -4.6], target: [0, 1.1, -1.9] },
  wheels: { position: [3.3, 0.75, 2.9], target: [0.9, 0.35, 1.4] },
  history: { position: [4.6, 1.3, -0.6], target: [0, 0.65, -0.2] },
  livery: { position: [-4.4, 2.6, 2.6], target: [0, 0.7, 0.1] },
};

const ENGINE_VIEW_DISTANCE = 1.35;
const ENGINE_VIEW_BIAS: Vec3 = [0, 0.9, 1.3]; // look from above and from the nose, so the raised hood never blocks the view

export const engineOrigin = (bay: Vec3): Vec3 => add(bay, ENGINE_OFFSET);

export function engineShot(origin: Vec3, id: EngineTopicId): Shot {
  const anchor = ENGINE_ANCHORS[id];
  const target = add(origin, anchor.position);
  const direction = normalize(add(normalize(anchor.normal), ENGINE_VIEW_BIAS));
  return { position: add(target, scale(direction, ENGINE_VIEW_DISTANCE)), target };
}

export function shotFor(view: View, bay: Vec3): Shot {
  switch (view.kind) {
    case 'showroom':
      return CAR_SHOTS.showroom;
    case 'focus':
      return CAR_SHOTS[view.id];
    case 'bay':
      return CAR_SHOTS.bay;
    case 'bay-part':
      return engineShot(engineOrigin(bay), view.id);
  }
}

export function insideSolid(point: Vec3, margin = 0.12): boolean {
  return CAR_SOLIDS.some(({ min, max }) => point.every((v, axis) => v > min[axis]! - margin && v < max[axis]! + margin));
}

/** Does the segment from→to pass through the hood panel when it is open by `angle` radians? */
export function segmentHitsHood(from: Vec3, to: Vec3, panel: typeof HOOD_PANEL, angle: number): boolean {
  const along: Vec3 = [0, Math.sin(angle), Math.cos(angle)]; // hinge → tip
  const normal: Vec3 = [0, -Math.cos(angle), Math.sin(angle)]; // x̂ × along
  const delta = sub(to, from);
  const denominator = dot(normal, delta);
  if (Math.abs(denominator) < 1e-9) return false;
  const t = dot(normal, sub(panel.hinge, from)) / denominator;
  if (t <= 0 || t >= 1) return false;
  const local = sub(add(from, scale(delta, t)), panel.hinge);
  const v = dot(local, along);
  return Math.abs(local[0]) <= panel.halfWidth && v >= 0 && v <= panel.length;
}
```

Run: `cd garage && npx vitest run src/car/shots.test.ts`
Expected: all pass. Hand-checked on 2026-10-10: with this bias, every engine camera sits either in front of the open hood's tip or below the hood's plane. If a shot fails the hood or solids test after Step 1's number updates, move that shot's camera, not the test. For an engine part, tilt its `ENGINE_ANCHORS` normal further toward +Y or +Z.

- [ ] **Step 4: Implement the rig**

`garage/src/scene/CameraRig.tsx`:

```tsx
import { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import { shotFor } from '../car/shots';
import type { Vec3 } from '../math';
import { QA } from '../qa';
import { useGarage } from '../state/store';

const DRIFT_RADIANS_PER_SECOND = 0.05;
const IDLE_SECONDS = 4;

/** Flies to the shot for each view; drifts slowly around the car while the showroom is idle. */
export function CameraRig({ bay }: { bay: Vec3 }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const view = useGarage((state) => state.view);
  const reducedMotion = useGarage((state) => state.reducedMotion);
  const camera = useThree((state) => state.camera);
  const idle = useRef(0);

  useEffect(() => {
    const { position: p, target: t } = shotFor(view, bay);
    void controls.current?.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], !reducedMotion);
    idle.current = 0;
  }, [view, bay, reducedMotion]);

  useEffect(() => {
    const rig = controls.current;
    if (!rig) return;
    const takeOver = () => {
      idle.current = -Infinity; // the visitor is driving; no drift until the next return to the showroom
    };
    rig.addEventListener('controlstart', takeOver);
    return () => rig.removeEventListener('controlstart', takeOver);
  }, []);

  useEffect(() => {
    if (!QA) return;
    Object.assign(window, { garageCamera: () => camera.position.toArray() });
  }, [camera]);

  useFrame((_, dt) => {
    if (reducedMotion || view.kind !== 'showroom' || !controls.current) return;
    idle.current += dt;
    if (idle.current > IDLE_SECONDS) void controls.current.rotate(DRIFT_RADIANS_PER_SECOND * dt, 0, false);
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={1.1}
      maxDistance={7.5}
      minPolarAngle={0.25}
      maxPolarAngle={1.48}
      smoothTime={0.55}
      draggingSmoothTime={0.12}
    />
  );
}
```

In `garage/src/scene/Scene.tsx`, remove `<CameraControls makeDefault />` and its import. Render the rig from the car instead:

```tsx
<Car>{(rig) => <CameraRig bay={rig.anchors.engineBay} />}</Car>
```

Add `import { CameraRig } from './CameraRig';`.

- [ ] **Step 5: Look at every shot**

Run: `cd garage && npm run dev`, then:

```bash
node tools/shot.ts "http://localhost:5173/?qa&quality=high" test-results/shots car:front-aero car:rear-wing car:wheels car:history car:livery car:hood part:crank part:dry-sump back close
```

Read every PNG. Each must frame its subject, with no camera inside a body panel, the wall, or the open hood.

The engine isn't built yet, so the `part:` shots look into an empty bay; Task 9 fills it. Adjust a `CAR_SHOTS` entry only if the screenshot shows a problem, then rerun the tests.

- [ ] **Step 6: Commit**

```bash
git add garage/src
git commit -m "Add camera shots for every view with an idle showroom drift"
```

---

### Task 9: The P60B40 and the engine bay

**Files:**
- Create: `garage/src/engine/geometry.ts`, `garage/src/engine/P60B40.tsx`, `garage/src/engine/Bay.tsx`
- Modify: `garage/src/scene/Scene.tsx`
- Test: `garage/src/engine/geometry.test.ts`

**Interfaces:**
- Consumes: `ENGINE_ANCHORS`, `BAY` (Task 8); `engineOrigin` (Task 8); `useGarage`, `isHoodOpen` (Task 4); `EngineTopicId` (Task 3).
- Produces: `P60`, `ILLUSTRATIVE`, `displacementCc(boreMm, strokeMm, cylinders)`, `Bank`, `Cylinder`, `cylinderLayout(): Cylinder[]`, `bankOf(n): Bank`; `<P60B40 origin={Vec3} hotspots={(id, selected) => ReactNode} />`; `<Bay />`. Task 10 passes the hotspot renderer.

- [ ] **Step 1: Write the failing test**

`garage/src/engine/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bankOf, cylinderLayout, displacementCc, P60 } from './geometry';

describe('P60B40 geometry', () => {
  it('reproduces the verified displacement from bore and stroke', () => {
    expect(Math.round(displacementCc(P60.boreMm, P60.strokeMm, P60.cylinders))).toBe(3997);
  });

  it('lays out eight cylinders, four per bank, banks 90° apart', () => {
    const cylinders = cylinderLayout();
    expect(cylinders).toHaveLength(8);
    expect(cylinders.filter((c) => c.bank === 'right')).toHaveLength(4);
    const right = cylinders.find((c) => c.bank === 'right')!.axis;
    const left = cylinders.find((c) => c.bank === 'left')!.axis;
    expect(right[0] * left[0] + right[1] * left[1] + right[2] * left[2]).toBeCloseTo(0);
  });

  it('never overlaps neighbouring bores', () => {
    const cylinders = cylinderLayout();
    for (const bank of ['right', 'left'] as const) {
      const zs = cylinders.filter((c) => c.bank === bank).map((c) => c.center[2]);
      for (let i = 1; i < zs.length; i++) expect(Math.abs(zs[i]! - zs[i - 1]!)).toBeGreaterThan(P60.boreMm / 1000);
    }
  });

  it('alternates banks along the firing order', () => {
    const banks = P60.firingOrder.map(bankOf);
    for (let i = 1; i < banks.length; i++) expect(banks[i]).not.toBe(banks[i - 1]);
  });
});
```

Run: `cd garage && npx vitest run src/engine`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement the geometry**

`garage/src/engine/geometry.ts`:

```ts
import type { Vec3 } from '../math';

/** Verified P60B40 figures (Wikipedia: BMW P60B40). */
export const P60 = { boreMm: 94, strokeMm: 72, cylinders: 8, bankAngleDeg: 90, firingOrder: [1, 8, 3, 6, 4, 5, 2, 7] } as const;

/** Illustrative: no source gives bore spacing, deck height, or bank stagger, so these fit a 94 mm bore. */
export const ILLUSTRATIVE = { boreSpacing: 0.1, deckHeight: 0.24, bankStagger: 0.022 } as const;

export type Bank = 'left' | 'right';
export type Cylinder = { number: number; bank: Bank; center: Vec3; axis: Vec3 };

export const displacementCc = (boreMm: number, strokeMm: number, cylinders: number): number =>
  ((Math.PI / 4) * boreMm ** 2 * strokeMm * cylinders) / 1000;

/** BMW's usual V8 numbering: 1–4 on the right bank, 5–8 on the left, from the front. */
export const bankOf = (number: number): Bank => (number <= 4 ? 'right' : 'left');

/** Engine space: crank along Z (+Z is the nose), right bank toward -X (the car's right). */
export function cylinderLayout(): Cylinder[] {
  const half = ((P60.bankAngleDeg / 2) * Math.PI) / 180;
  return Array.from({ length: P60.cylinders }, (_, i) => {
    const number = i + 1;
    const bank = bankOf(number);
    const side = bank === 'right' ? -1 : 1;
    const axis: Vec3 = [side * Math.sin(half), Math.cos(half), 0];
    const z = (1.5 - ((number - 1) % 4)) * ILLUSTRATIVE.boreSpacing - (bank === 'left' ? ILLUSTRATIVE.bankStagger : 0);
    return { number, bank, axis, center: [axis[0] * ILLUSTRATIVE.deckHeight, axis[1] * ILLUSTRATIVE.deckHeight, z] };
  });
}
```

Run: `cd garage && npx vitest run src/engine`
Expected: 4 passed.

- [ ] **Step 3: Build the engine and bay meshes**

`garage/src/engine/P60B40.tsx`:

```tsx
import { RoundedBox } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CatmullRomCurve3, Color, MeshPhysicalMaterial, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three';
import { ENGINE_TOPIC_IDS, type EngineTopicId } from '../content/engine';
import type { Vec3 } from '../math';
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { cylinderLayout, type Cylinder } from './geometry';

const HIGHLIGHT = new Color('#2f6bff');
const NONE = new Color('#000000');
const BANK_ANGLE = Math.PI / 4;

function makeMaterials() {
  return {
    castAlu: new MeshStandardMaterial({ color: '#a4a9ae', roughness: 0.55, metalness: 0.85 }),
    machinedAlu: new MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.28, metalness: 1 }),
    crinkle: new MeshStandardMaterial({ color: '#141516', roughness: 0.92, metalness: 0.2 }),
    carbon: new MeshPhysicalMaterial({ color: '#1b1d20', roughness: 0.38, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
    steel: new MeshStandardMaterial({ color: '#8b7464', roughness: 0.32, metalness: 1 }),
    braided: new MeshStandardMaterial({ color: '#2b2c2e', roughness: 0.62, metalness: 0.6 }),
    anodized: new MeshStandardMaterial({ color: '#3a66c9', roughness: 0.3, metalness: 0.9 }),
  };
}
type Materials = ReturnType<typeof makeMaterials>;

const tube = (points: Vec3[], radius: number) =>
  new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), 24, radius, 10, false);

const bankSide = (bank: 'left' | 'right') => (bank === 'right' ? -1 : 1);
const along = (side: number, distance: number, z = -0.01): Vec3 => [side * Math.sin(BANK_ANGLE) * distance, Math.cos(BANK_ANGLE) * distance, z];
/** Unit vector from a bank's head toward the valley between the banks. */
const inward = (side: number): Vec3 => [-side * Math.sin(BANK_ANGLE), Math.cos(BANK_ANGLE), 0];

function Block({ m }: { m: Materials }) {
  return (
    <>
      <mesh position={[0, -0.03, -0.01]} material={m.castAlu} castShadow>
        <boxGeometry args={[0.4, 0.17, 0.52]} />
      </mesh>
      <mesh position={[0, -0.135, -0.01]} material={m.castAlu}>
        <boxGeometry args={[0.34, 0.05, 0.48]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={along(side, 0.15)} rotation-z={-side * BANK_ANGLE} material={m.castAlu} castShadow>
          <boxGeometry args={[0.15, 0.2, 0.5]} />
        </mesh>
      ))}
    </>
  );
}

function Heads({ m }: { m: Materials }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={along(side, 0.31)} rotation-z={-side * BANK_ANGLE} material={m.castAlu} castShadow>
            <boxGeometry args={[0.19, 0.1, 0.5]} />
          </mesh>
          <RoundedBox args={[0.16, 0.05, 0.47]} radius={0.015} position={along(side, 0.38)} rotation-z={-side * BANK_ANGLE} material={m.crinkle} castShadow />
          {[0, 1, 2, 3].map((row) => (
            <mesh key={row} position={along(side, 0.415, (1.5 - row) * 0.1 - 0.01)} rotation-z={-side * BANK_ANGLE} material={m.crinkle}>
              <cylinderGeometry args={[0.018, 0.018, 0.04, 12]} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function FrontEnd({ m }: { m: Materials }) {
  return (
    <>
      <RoundedBox args={[0.36, 0.34, 0.025]} radius={0.01} position={[0, 0.06, 0.255]} material={m.castAlu} castShadow />
      <mesh position={[0, 0, 0.285]} rotation-x={Math.PI / 2} material={m.machinedAlu} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.03, 32]} />
      </mesh>
      <mesh position={[0, 0, 0.3]} material={m.steel}>
        <torusGeometry args={[0.06, 0.006, 8, 32]} />
      </mesh>
      <mesh position={[0.2, 0.15, 0.22]} rotation-x={Math.PI / 2} material={m.castAlu}>
        <cylinderGeometry args={[0.055, 0.055, 0.12, 24]} />
      </mesh>
    </>
  );
}

function Intake({ m, cylinders }: { m: Materials; cylinders: Cylinder[] }) {
  const runners = useMemo(
    () =>
      cylinders.map((c) => {
        const side = bankSide(c.bank);
        const into = inward(side);
        const port: Vec3 = [c.axis[0] * 0.31 + into[0] * 0.08, c.axis[1] * 0.31 + into[1] * 0.08, c.center[2]];
        return tube([[side * 0.06, 0.37, c.center[2]], [side * 0.09, 0.33, c.center[2]], port], 0.02);
      }),
    [cylinders],
  );
  const ducts = useMemo(() => [-1, 1].map((side) => tube([[side * 0.07, 0.37, 0.4], [side * 0.18, 0.32, 0.52], [side * 0.32, 0.22, 0.66]], 0.035)), []);
  return (
    <>
      <RoundedBox args={[0.15, 0.09, 0.44]} radius={0.02} position={[0, 0.37, -0.01]} material={m.carbon} castShadow />
      <RoundedBox args={[0.3, 0.12, 0.13]} radius={0.02} position={[0, 0.37, 0.29]} material={m.carbon} castShadow />
      {runners.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={m.carbon} />
      ))}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.07, 0.37, 0.37]} rotation-x={Math.PI / 2}>
          <mesh material={m.machinedAlu}>
            <cylinderGeometry args={[0.0152, 0.022, 0.05, 24, 1, true]} />
          </mesh>
          <mesh position={[0, 0.025, 0]} rotation-x={Math.PI / 2} material={m.machinedAlu}>
            <torusGeometry args={[0.024, 0.005, 8, 24]} />
          </mesh>
        </group>
      ))}
      {ducts.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={m.crinkle} />
      ))}
    </>
  );
}

function FuelRails({ m, cylinders }: { m: Materials; cylinders: Cylinder[] }) {
  return (
    <>
      {[-1, 1].map((side) => {
        const into = inward(side);
        const rail = along(side, 0.36);
        return (
          <mesh key={side} position={[rail[0] + into[0] * 0.07, rail[1] + into[1] * 0.07, -0.01]} rotation-x={Math.PI / 2} material={m.anodized}>
            <cylinderGeometry args={[0.009, 0.009, 0.44, 12]} />
          </mesh>
        );
      })}
      {cylinders.map((c) => {
        const into = inward(bankSide(c.bank));
        return (
          <mesh key={c.number} position={[c.axis[0] * 0.33 + into[0] * 0.07, c.axis[1] * 0.33 + into[1] * 0.07, c.center[2]]} material={m.anodized}>
            <cylinderGeometry args={[0.008, 0.008, 0.05, 10]} />
          </mesh>
        );
      })}
    </>
  );
}

function Headers({ m, cylinders }: { m: Materials; cylinders: Cylinder[] }) {
  const pipes = useMemo(
    () =>
      cylinders.map((c) => {
        const side = bankSide(c.bank);
        const out = inward(side).map((v) => -v) as Vec3;
        const port: Vec3 = [c.axis[0] * 0.29 + out[0] * 0.09, c.axis[1] * 0.29 + out[1] * 0.09, c.center[2]];
        return tube([port, [port[0] + side * 0.12, port[1] - 0.04, c.center[2]], [side * 0.42, -0.08, c.center[2] * 0.6], [side * 0.44, -0.2, -0.2]], 0.018);
      }),
    [cylinders],
  );
  return (
    <>
      {pipes.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={m.steel} castShadow />
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.44, -0.26, -0.22]} material={m.steel}>
          <cylinderGeometry args={[0.04, 0.03, 0.14, 20]} />
        </mesh>
      ))}
    </>
  );
}

function DrySump({ m }: { m: Materials }) {
  const lines = useMemo(
    () => [
      tube([[0.15, -0.14, 0.31], [-0.2, -0.12, 0.36], [-0.5, -0.05, 0.22], [-0.52, -0.09, 0.12]], 0.009),
      tube([[-0.52, 0.2, 0.12], [-0.3, 0.2, 0.3], [-0.1, 0.05, 0.27]], 0.009),
    ],
    [],
  );
  return (
    <>
      <mesh position={[-0.52, 0.06, 0.12]} material={m.machinedAlu} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.3, 28]} />
      </mesh>
      <mesh position={[-0.52, 0.22, 0.12]} material={m.anodized}>
        <cylinderGeometry args={[0.03, 0.03, 0.03, 20]} />
      </mesh>
      <mesh position={[0.15, -0.14, 0.27]} material={m.castAlu}>
        <boxGeometry args={[0.1, 0.08, 0.08]} />
      </mesh>
      {lines.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={m.braided} />
      ))}
    </>
  );
}

type PartProps = { id: EngineTopicId; active: boolean; interactive: boolean; onHover: (id: EngineTopicId | null) => void; children: (m: Materials) => ReactNode };

function Part({ id, active, interactive, onHover, children }: PartProps) {
  const materials = useMemo(makeMaterials, []);
  useEffect(() => {
    for (const material of Object.values(materials)) {
      material.emissive.copy(active ? HIGHLIGHT : NONE);
      material.emissiveIntensity = active ? 0.55 : 0;
    }
  }, [active, materials]);
  const handlers = interactive
    ? {
        onClick: (event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          useGarage.getState().dispatch({ type: 'select-part', id });
        },
        onPointerOver: (event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          onHover(id);
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          onHover(null);
          document.body.style.cursor = '';
        },
      }
    : {};
  return <group {...handlers}>{children(materials)}</group>;
}

/** The P60B40 built in code. Bore and stroke are real; the rest is proportioned to fit (see ILLUSTRATIVE). */
export function P60B40({ origin, hotspots }: { origin: Vec3; hotspots?: (id: EngineTopicId, selected: boolean) => ReactNode }) {
  const view = useGarage((state) => state.view);
  const [hovered, setHovered] = useState<EngineTopicId | null>(null);
  const cylinders = useMemo(cylinderLayout, []);
  const open = isHoodOpen(view);
  const selected = view.kind === 'bay-part' ? view.id : null;
  const part = (id: EngineTopicId) => ({ id, active: open && (hovered === id || selected === id), interactive: open, onHover: setHovered });

  return (
    <group position={origin}>
      <Part {...part('layout')}>{(m) => <Block m={m} />}</Part>
      <Part {...part('heads')}>{(m) => <Heads m={m} />}</Part>
      <Part {...part('crank')}>{(m) => <FrontEnd m={m} />}</Part>
      <Part {...part('restrictors')}>{(m) => <Intake m={m} cylinders={cylinders} />}</Part>
      <Part {...part('fuel')}>{(m) => <FuelRails m={m} cylinders={cylinders} />}</Part>
      <Part {...part('headers')}>{(m) => <Headers m={m} cylinders={cylinders} />}</Part>
      <Part {...part('dry-sump')}>{(m) => <DrySump m={m} />}</Part>
      {open && hotspots && ENGINE_TOPIC_IDS.map((id) => <group key={id}>{hotspots(id, selected === id)}</group>)}
    </group>
  );
}
```

`garage/src/engine/Bay.tsx`:

```tsx
import { useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { BAY } from './anchors';

/** The engine bay the source model lacks: floor, inner fenders, firewall, radiator, strut towers. */
export function Bay() {
  const { rearZ, frontZ, halfWidth, floorY, topY } = BAY;
  const length = frontZ - rearZ;
  const mid = (frontZ + rearZ) / 2;
  const height = topY - floorY;
  const tub = useMemo(() => new MeshStandardMaterial({ color: '#15171a', roughness: 0.8, metalness: 0.25 }), []);
  return (
    <group>
      <mesh position={[0, floorY, mid]} material={tub} receiveShadow>
        <boxGeometry args={[halfWidth * 2, 0.02, length]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * halfWidth, floorY + height / 2, mid]} material={tub} receiveShadow>
          <boxGeometry args={[0.03, height, length]} />
        </mesh>
      ))}
      <mesh position={[0, floorY + height / 2, rearZ]} material={tub} receiveShadow>
        <boxGeometry args={[halfWidth * 2, height, 0.03]} />
      </mesh>
      <mesh position={[0, floorY + height * 0.45, frontZ - 0.03]}>
        <boxGeometry args={[halfWidth * 1.6, height * 0.75, 0.05]} />
        <meshStandardMaterial color="#2b2e33" metalness={0.8} roughness={0.45} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`tower-${side}`} position={[side * (halfWidth - 0.09), topY - 0.06, 1.45]} material={tub}>
          <cylinderGeometry args={[0.09, 0.1, 0.12, 24]} />
        </mesh>
      ))}
    </group>
  );
}
```

In `garage/src/scene/Scene.tsx`, render them with the car:

```tsx
<Car>
  {(rig) => (
    <>
      <CameraRig bay={rig.anchors.engineBay} />
      <Bay />
      <P60B40 origin={engineOrigin(rig.anchors.engineBay)} />
    </>
  )}
</Car>
```

Imports: `import { engineOrigin } from '../car/shots';`, `import { Bay } from '../engine/Bay';`, `import { P60B40 } from '../engine/P60B40';`.

- [ ] **Step 4: Look at the engine and fit it**

Run: `cd garage && npm run dev`, then:

```bash
node tools/shot.ts "http://localhost:5173/?qa&quality=high" test-results/shots car:hood part:layout part:heads part:crank part:restrictors part:dry-sump part:fuel part:headers close
```

Check each PNG:
- With the hood open, a dark engine bay holds a recognisable V8: two banks, black crinkle cam covers, a carbon plenum and airbox, steel headers, and an aluminium oil tank.
- Each `part:` shot frames its part and highlights it in blue.
- In `close`, nothing pokes through the closed hood or the fenders.

If the engine clips the closed hood, lower `ENGINE_OFFSET[1]` in steps of 0.02. If the bay walls show through the fenders, reduce `BAY.halfWidth` or `BAY.topY`. Rerun `npx vitest run src/car src/engine` after any constant changes.

- [ ] **Step 5: Commit**

```bash
git add garage/src
git commit -m "Build the P60B40 V8 and engine bay in code"
```

---

### Task 10: Hotspots, info panel, HUD and loader

**Files:**
- Create: `garage/src/ui/facing.ts`, `garage/src/ui/topicFor.ts`, `garage/src/car/hotspots.ts`, `garage/src/ui/Hotspot.tsx`, `garage/src/ui/CarHotspots.tsx`, `garage/src/ui/InfoPanel.tsx`, `garage/src/ui/Hud.tsx`, `garage/src/ui/Loader.tsx`, `garage/src/ui/hud.css`
- Modify: `garage/src/scene/Scene.tsx`, `garage/src/App.tsx`, `garage/src/main.tsx`
- Test: `garage/src/ui/ui.test.ts`

**Interfaces:**
- Consumes: `CarRig`, `CarAnchors` (Task 6); `ENGINE_ANCHORS` (Task 8); `CAR_TOPICS`, `ENGINE_TOPICS`, `ENGINE_OVERVIEW`, `loaderFacts` (Task 3); store and view (Task 4); `<P60B40 hotspots>` (Task 9).
- Produces: `facingOpacity(anchor, normal, camera): number`; `topicFor(view): Topic | null`; `breadcrumbFor(view): string[]`; `carHotspot(id, anchors): { position: Vec3; normal: Vec3 }`; `<Hotspot>`, `<CarHotspots rig>`, `<InfoPanel>`, `<Hud>`, `<Loader>`. Also two accessible names the QA tests rely on: the HUD button "Open the hood" / "Close the hood", and engine hotspots named by topic title, for example "Flat-plane crankshaft".

- [ ] **Step 1: Write the failing tests**

`garage/src/ui/ui.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { carHotspot } from '../car/hotspots';
import type { CarAnchors } from '../car/prepareCar';
import { CAR_TOPIC_IDS } from '../content/car';
import { breadcrumbFor, topicFor } from './topicFor';
import { facingOpacity } from './facing';
import { SHOWROOM } from '../state/view';

const anchors: CarAnchors = { wheelFL: [0.8, 0.32, 1.45], wheelFR: [-0.8, 0.32, 1.45], wheelRL: [0.8, 0.32, -1.21], wheelRR: [-0.8, 0.32, -1.21], engineBay: [0, 0.32, 1.49] };

describe('facingOpacity', () => {
  it('shows hotspots facing the camera and hides those facing away', () => {
    expect(facingOpacity([1, 0, 0], [1, 0, 0], [5, 0, 0])).toBe(1);
    expect(facingOpacity([1, 0, 0], [1, 0, 0], [-5, 0, 0])).toBe(0);
    const grazing = facingOpacity([1, 0, 0], [1, 0, 0], [1, 0, 5]);
    expect(grazing).toBeGreaterThan(0);
    expect(grazing).toBeLessThan(1);
  });
});

describe('topicFor and breadcrumbFor', () => {
  it('describes every view', () => {
    expect(topicFor(SHOWROOM)).toBeNull();
    expect(topicFor({ kind: 'bay' })?.title).toBe('P60B40 V8');
    expect(topicFor({ kind: 'bay-part', id: 'crank' })?.title).toBe('Flat-plane crankshaft');
    expect(breadcrumbFor({ kind: 'bay-part', id: 'crank' })).toEqual(['Garage', 'Engine bay', 'Flat-plane crankshaft']);
    expect(breadcrumbFor({ kind: 'focus', id: 'wheels' })).toEqual(['Garage', 'Wheels and brakes']);
  });
});

describe('carHotspot', () => {
  it('places each hotspot above the floor, facing outward', () => {
    for (const id of CAR_TOPIC_IDS) {
      const { position, normal } = carHotspot(id, anchors);
      expect(Math.hypot(...normal), id).toBeGreaterThan(0.5);
      expect(position[1], id).toBeGreaterThan(0.1);
    }
  });

  it('puts the wheel hotspot just outside the front-left tyre', () => {
    expect(carHotspot('wheels', anchors).position[0]).toBeGreaterThan(anchors.wheelFL[0]);
  });
});
```

Run: `cd garage && npx vitest run src/ui`
Expected: FAIL, modules not found.

- [ ] **Step 2: Implement the pure helpers**

`garage/src/ui/facing.ts`:

```ts
import { dot, normalize, smoothstep, sub, type Vec3 } from '../math';

/** 1 when the hotspot's surface faces the camera, fading to 0 as it turns away. */
export function facingOpacity(anchor: Vec3, normal: Vec3, camera: Vec3): number {
  return smoothstep(-0.15, 0.3, dot(normalize(normal), normalize(sub(camera, anchor))));
}
```

`garage/src/ui/topicFor.ts`:

```ts
import { CAR_TOPICS } from '../content/car';
import { ENGINE_OVERVIEW, ENGINE_TOPICS } from '../content/engine';
import type { Topic } from '../content/types';
import type { View } from '../state/view';

export function topicFor(view: View): Topic | null {
  switch (view.kind) {
    case 'showroom':
      return null;
    case 'focus':
      return CAR_TOPICS[view.id];
    case 'bay':
      return ENGINE_OVERVIEW;
    case 'bay-part':
      return ENGINE_TOPICS[view.id];
  }
}

export function breadcrumbFor(view: View): string[] {
  switch (view.kind) {
    case 'showroom':
      return ['Garage'];
    case 'focus':
      return ['Garage', CAR_TOPICS[view.id].title];
    case 'bay':
      return ['Garage', 'Engine bay'];
    case 'bay-part':
      return ['Garage', 'Engine bay', ENGINE_TOPICS[view.id].title];
  }
}
```

`garage/src/car/hotspots.ts`:

```ts
import type { CarTopicId } from '../content/car';
import type { Vec3 } from '../math';
import type { CarAnchors } from './prepareCar';

/** Where each car hotspot sits (car space) and which way its surface faces. */
export function carHotspot(id: CarTopicId, anchors: CarAnchors): { position: Vec3; normal: Vec3 } {
  switch (id) {
    case 'hood':
      return { position: [0, 0.95, anchors.engineBay[2] + 0.1], normal: [0, 1, 0.35] };
    case 'front-aero':
      return { position: [0.45, 0.2, 2.28], normal: [0, 0.1, 1] };
    case 'rear-wing':
      return { position: [0, 1.36, -2.0], normal: [0, 1, -0.5] };
    case 'wheels':
      return { position: [anchors.wheelFL[0] + 0.14, anchors.wheelFL[1], anchors.wheelFL[2]], normal: [1, 0, 0] };
    case 'history':
      return { position: [1.02, 0.62, -0.25], normal: [1, 0, 0] };
    case 'livery':
      return { position: [0, 1.33, -0.25], normal: [0, 1, 0] };
  }
}
```

Run: `cd garage && npx vitest run src/ui`
Expected: 4 passed.

- [ ] **Step 3: Build the components**

`garage/src/ui/Hotspot.tsx`:

```tsx
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Vector3, type Group } from 'three';
import type { Vec3 } from '../math';
import { facingOpacity } from './facing';

type Props = { position: Vec3; normal: Vec3; label: string; summary: string; selected?: boolean; onSelect: () => void };

/** A pulsing marker anchored in 3D. It fades when its surface faces away, but stays reachable by keyboard. */
export function Hotspot({ position, normal, label, summary, selected = false, onSelect }: Props) {
  const group = useRef<Group>(null);
  const holder = useRef<HTMLDivElement>(null);
  const world = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    if (!group.current || !holder.current) return;
    group.current.getWorldPosition(world);
    const opacity = facingOpacity(world.toArray(), normal, camera.position.toArray());
    holder.current.style.opacity = opacity.toFixed(2);
    holder.current.style.pointerEvents = opacity > 0.2 ? 'auto' : 'none';
  });
  return (
    <group ref={group} position={position}>
      <Html center zIndexRange={[30, 10]}>
        <div ref={holder} className="hotspot-holder">
          <button type="button" className={selected ? 'hotspot is-selected' : 'hotspot'} onClick={onSelect}>
            <span className="hotspot-dot" aria-hidden="true" />
            <span className="hotspot-label">
              {label}
              <small>{summary}</small>
            </span>
          </button>
        </div>
      </Html>
    </group>
  );
}
```

`garage/src/ui/CarHotspots.tsx`:

```tsx
import { carHotspot } from '../car/hotspots';
import type { CarRig } from '../car/prepareCar';
import { CAR_TOPIC_IDS, CAR_TOPICS } from '../content/car';
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { Hotspot } from './Hotspot';

export function CarHotspots({ rig }: { rig: CarRig }) {
  const view = useGarage((state) => state.view);
  const dispatch = useGarage((state) => state.dispatch);
  if (isHoodOpen(view)) return null;
  return (
    <>
      {CAR_TOPIC_IDS.map((id) => {
        const { position, normal } = carHotspot(id, rig.anchors);
        return (
          <Hotspot
            key={id}
            position={position}
            normal={normal}
            label={CAR_TOPICS[id].title}
            summary={CAR_TOPICS[id].summary}
            selected={view.kind === 'focus' && view.id === id}
            onSelect={() => dispatch({ type: 'select-car', id })}
          />
        );
      })}
    </>
  );
}
```

`garage/src/ui/InfoPanel.tsx`:

```tsx
import { Fragment, useState } from 'react';
import type { Badge, Topic } from '../content/types';
import { useGarage } from '../state/store';
import { topicFor } from './topicFor';

const BADGE_LABEL: Record<Badge, string> = { verified: 'Verified', illustrative: 'Illustrative', 'game-lore': 'Game lore' };
type Tab = 'real' | 'game';

function PanelBody({ topic, eyebrow, hint }: { topic: Topic; eyebrow: string; hint: string | null }) {
  const tabs = (['real', 'game'] as const).filter((tab) => topic[tab].length > 0);
  const [tab, setTab] = useState<Tab>(tabs[0]!);
  const back = () => useGarage.getState().dispatch({ type: 'back' });
  const facts = (
    <ul className="facts">
      {topic[tab].map((fact) => (
        <li key={fact.text} className={`fact fact-${fact.badge}`}>
          <span className="badge">{BADGE_LABEL[fact.badge]}</span>
          <p>{fact.text}</p>
          {fact.sources.length > 0 && (
            <p className="sources">
              {fact.sources.map((source, i) => (
                <Fragment key={source.url}>
                  {i > 0 && ' · '}
                  <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
                </Fragment>
              ))}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <aside className="panel" aria-labelledby="panel-title">
      <header className="panel-head">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="panel-title">{topic.title}</h2>
        <button type="button" className="panel-close" onClick={back} aria-label="Back">×</button>
      </header>
      {tabs.length > 1 ? (
        <>
          <div className="panel-tabs" role="tablist" aria-label="Facts about">
            {tabs.map((t) => (
              <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls="panel-facts" onClick={() => setTab(t)}>
                {t === 'real' ? 'Real car' : 'In the game'}
              </button>
            ))}
          </div>
          <div id="panel-facts" role="tabpanel" aria-labelledby={`tab-${tab}`}>{facts}</div>
        </>
      ) : (
        facts
      )}
      {hint && <p className="panel-hint">{hint}</p>}
    </aside>
  );
}

export function InfoPanel() {
  const view = useGarage((state) => state.view);
  const topic = topicFor(view);
  if (!topic) return null;
  const inBay = view.kind === 'bay' || view.kind === 'bay-part';
  return (
    <PanelBody
      key={topic.id}
      topic={topic}
      eyebrow={inBay ? 'P60B40 V8' : 'BMW M3 GTR'}
      hint={view.kind === 'bay' ? 'Pick a highlighted part to see what it does.' : null}
    />
  );
}
```

`garage/src/ui/Hud.tsx`:

```tsx
import { useEffect } from 'react';
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { InfoPanel } from './InfoPanel';
import { breadcrumbFor } from './topicFor';

export function Hud() {
  const view = useGarage((state) => state.view);
  const ready = useGarage((state) => state.ready);
  const dispatch = useGarage((state) => state.dispatch);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useGarage.getState().dispatch({ type: 'back' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) return null;
  const hoodOpen = isHoodOpen(view);
  const crumbs = breadcrumbFor(view);
  return (
    <>
      <nav className="crumbs" aria-label="Location">
        <ol>
          {crumbs.map((crumb, i) => (
            <li key={crumb} aria-current={i === crumbs.length - 1 ? 'location' : undefined}>{crumb}</li>
          ))}
        </ol>
      </nav>
      <div className="hud-actions">
        <button type="button" className="hud-button" onClick={() => dispatch(hoodOpen ? { type: 'close-hood' } : { type: 'select-car', id: 'hood' })}>
          {hoodOpen ? 'Close the hood' : 'Open the hood'}
        </button>
      </div>
      <p className="hint">Drag to orbit · Pick a marker · Esc to go back</p>
      <InfoPanel />
    </>
  );
}
```

`garage/src/ui/Loader.tsx`:

```tsx
import { useProgress } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { loaderFacts } from '../content/loaderFacts';
import { useGarage } from '../state/store';

const FACT_SECONDS = 4.5;

export function Loader() {
  const { progress } = useProgress();
  const ready = useGarage((state) => state.ready);
  const facts = useMemo(loaderFacts, []);
  const [index, setIndex] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % facts.length), FACT_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [facts.length]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setGone(true), 700);
    return () => clearTimeout(timer);
  }, [ready]);

  if (gone) return null;
  return (
    <div className={ready ? 'loader is-done' : 'loader'} role="status">
      <p className="eyebrow">Loading the garage · {Math.round(progress)}%</p>
      <div className="loader-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(progress)}%` }} />
      </div>
      <p className="loader-fact">{facts[index]}</p>
    </div>
  );
}
```

`garage/src/ui/hud.css`:

```css
.crumbs { position: absolute; z-index: 12; top: calc(max(16px, env(safe-area-inset-top)) + 60px); left: 16px; font: 12px/1.4 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.crumbs ol { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.crumbs li + li::before { content: '/'; margin-right: 8px; color: var(--line); }
.crumbs [aria-current] { color: var(--silver); }
.hud-actions { position: absolute; z-index: 12; top: max(16px, env(safe-area-inset-top)); right: 16px; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: calc(100% - 32px); }
.hud-button { min-height: 40px; padding: 8px 16px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); font: 600 15px/1 var(--font); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%); backdrop-filter: blur(8px); }
.hud-button:hover, .hud-button[aria-pressed='true'] { border-color: var(--blue); background: rgba(61, 123, 255, 0.28); }
.hint { position: absolute; z-index: 11; left: 16px; bottom: max(14px, env(safe-area-inset-bottom)); margin: 0; font: 12px/1.4 var(--mono); color: var(--muted); }
.panel { position: absolute; z-index: 20; top: 96px; right: 16px; width: min(380px, calc(100% - 32px)); max-height: calc(100% - 170px); overflow: auto; padding: 18px 20px 20px; background: var(--panel); border-left: 3px solid var(--blue); backdrop-filter: blur(12px); clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%); }
.panel-head { position: relative; padding-right: 40px; }
.panel h2 { margin: 2px 0 12px; font-size: 28px; font-weight: 700; line-height: 1.05; text-transform: uppercase; transform: skewX(-8deg); transform-origin: left; }
.panel-close { position: absolute; top: -6px; right: -8px; width: 44px; height: 44px; border: 0; background: transparent; color: var(--silver); font-size: 26px; cursor: pointer; }
.panel-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.panel-tabs button { flex: 1; min-height: 40px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: 600 14px/1 var(--font); letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; }
.panel-tabs button[aria-selected='true'] { border-color: var(--blue); background: rgba(61, 123, 255, 0.18); color: var(--ink); }
.facts { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.fact p { margin: 4px 0 0; font-size: 16px; line-height: 1.4; }
.fact .sources { font: 11px/1.4 var(--mono); color: var(--muted); }
.badge { display: inline-block; padding: 1px 7px; border: 1px solid currentColor; font: 10px/1.6 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; }
.fact-verified .badge { color: var(--silver); }
.fact-illustrative .badge { color: var(--amber); }
.fact-game-lore .badge { color: #7fa6ff; }
.panel-hint { margin: 14px 0 0; font: 12px/1.4 var(--mono); color: var(--muted); }
.hotspot-holder { transition: opacity 0.2s; }
.hotspot-holder:focus-within { opacity: 1 !important; pointer-events: auto !important; }
.hotspot { position: relative; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; background: transparent; color: var(--ink); cursor: pointer; }
.hotspot-dot { width: 16px; height: 16px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 0 3px rgba(61, 123, 255, 0.35), 0 0 18px rgba(61, 123, 255, 0.8); animation: pulse 2.2s ease-in-out infinite; }
.hotspot.is-selected .hotspot-dot { background: var(--ink); }
.hotspot-label { position: absolute; top: 50%; left: 40px; width: max-content; max-width: 240px; padding: 6px 10px; translate: 0 -50%; background: var(--panel); border-left: 2px solid var(--blue); font: 600 15px/1.2 var(--font); letter-spacing: 0.04em; text-align: left; text-transform: uppercase; opacity: 0; pointer-events: none; transition: opacity 0.15s; }
.hotspot-label small { display: block; margin-top: 2px; font: 12px/1.35 var(--mono); letter-spacing: 0; text-transform: none; color: var(--muted); }
.hotspot:hover .hotspot-label, .hotspot:focus-visible .hotspot-label { opacity: 1; }
@keyframes pulse { 50% { box-shadow: 0 0 0 7px rgba(61, 123, 255, 0.12), 0 0 22px rgba(61, 123, 255, 0.9); } }
.loader { position: fixed; inset: 0; z-index: 40; display: grid; place-content: center; gap: 14px; padding: 24px; background: radial-gradient(ellipse at 50% 60%, #101722, #05070a 70%); text-align: center; transition: opacity 0.6s; }
.loader.is-done { opacity: 0; pointer-events: none; }
.loader-bar { width: min(420px, 80vw); height: 4px; margin: 0 auto; background: rgba(201, 206, 214, 0.15); }
.loader-bar span { display: block; height: 100%; background: linear-gradient(90deg, var(--navy), var(--blue)); transition: width 0.3s; }
.loader-fact { max-width: 460px; margin: 0 auto; font-size: 18px; line-height: 1.4; color: var(--silver); }
@media (prefers-reduced-motion: reduce) {
  .hotspot-dot { animation: none; }
  .loader, .hotspot-holder, .hotspot-label { transition: none; }
}
@media (max-width: 720px) {
  .panel { top: auto; right: 0; bottom: 0; left: 0; width: auto; max-height: 46vh; padding-bottom: max(20px, env(safe-area-inset-bottom)); border-top: 3px solid var(--blue); border-left: 0; clip-path: none; }
  .hint { display: none; }
  .hud-actions { top: auto; right: 16px; bottom: max(44px, env(safe-area-inset-bottom)); left: 16px; justify-content: flex-start; }
  .crumbs { top: calc(max(16px, env(safe-area-inset-top)) + 48px); }
}
```

- [ ] **Step 4: Wire it up**

In `garage/src/scene/Scene.tsx`, extend the car's render prop:

```tsx
<Car>
  {(rig) => (
    <>
      <CameraRig bay={rig.anchors.engineBay} />
      <Bay />
      <P60B40
        origin={engineOrigin(rig.anchors.engineBay)}
        hotspots={(id, selected) => (
          <Hotspot
            position={ENGINE_ANCHORS[id].position}
            normal={ENGINE_ANCHORS[id].normal}
            label={ENGINE_TOPICS[id].title}
            summary={ENGINE_TOPICS[id].summary}
            selected={selected}
            onSelect={() => useGarage.getState().dispatch({ type: 'select-part', id })}
          />
        )}
      />
      <CarHotspots rig={rig} />
    </>
  )}
</Car>
```

Imports: `Hotspot`, `CarHotspots`, `ENGINE_ANCHORS`, `ENGINE_TOPICS`, `useGarage`.

`garage/src/App.tsx`: render `<Hud />` and `<Loader />` after the stage `div`, and wrap the return in a fragment. In `garage/src/main.tsx`, add `import './ui/hud.css';` after `base.css`.

- [ ] **Step 5: Check it by hand and with screenshots**

Run: `cd garage && npm run dev`, then in a browser:
1. Load the page. The loader shows facts, then fades out.
2. Hover each car hotspot. A label appears with its summary.
3. Click "Wheels and brakes". The camera flies to the wheel, the panel opens, and you can switch between "Real car" and "In the game".
4. Press Esc. You're back in the showroom.
5. Click "Open the hood". The engine hotspots appear.
6. Tab to "Flat-plane crankshaft" and press Enter. The panel shows the firing order and its source link.
7. Press Esc twice. You're back in the showroom.

Then take screenshots at 390 × 844. Temporarily add `--viewport` support, or use Chrome devtools, and confirm the panel stays below the middle of the screen.

Run: `cd garage && npm test && npm run build`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add garage/src
git commit -m "Add hotspots, the fact panel, HUD and loader"
```

---

### Task 11: Synthesized audio and "Play my own track"

**Files:**
- Create: `garage/src/audio/schedule.ts`, `noise.ts`, `ambience.ts`, `sfx.ts`, `controller.ts`, `prefs.ts`, `bindings.ts`, `garage/src/ui/SoundControls.tsx`
- Modify: `garage/src/ui/Hud.tsx`, `garage/src/main.tsx`, `garage/src/ui/hud.css`
- Test: `garage/src/audio/audio.test.ts`

**Interfaces:**
- Consumes: `mulberry32` (Task 4); store fields `soundOn`, `ownTrack`, `trackError` and their setters (Task 4); `isHoodOpen`.
- Produces: `midiToHz`, `CHORDS`, `BAR_SECONDS`, `chordAt(seconds)`, `duckLevel(playing)`, `swell(seconds, period?)`, `HUM_HZ`; `brownNoise(length, rand)`, `impulseResponse(length, decaySeconds, sampleRate, rand)`; `Ambience`; `hoodClunk(ctx, out)`, `uiTick(ctx, out)`; `audio` (an `AudioController` singleton with `setEnabled(on)`, `sfx(kind)`, `playOwnTrack(file)`, `clearOwnTrack()`); `bindAudio()`; `<SoundControls />`, whose buttons are "Sound on" / "Sound off" and "Play my own track".

- [ ] **Step 1: Write the failing tests**

`garage/src/audio/audio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../random';
import { brownNoise, impulseResponse } from './noise';
import { BAR_SECONDS, CHORDS, chordAt, duckLevel, midiToHz, swell } from './schedule';

describe('schedule', () => {
  it('converts MIDI notes to pitch', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220);
  });

  it('cycles an original, mid-range progression', () => {
    expect(CHORDS).toHaveLength(4);
    for (const chord of CHORDS) for (const note of chord) expect(note).toBeGreaterThanOrEqual(40);
    expect(chordAt(0)).toBe(CHORDS[0]);
    expect(chordAt(BAR_SECONDS)).toBe(CHORDS[1]);
    expect(chordAt(BAR_SECONDS * CHORDS.length)).toBe(CHORDS[0]);
  });

  it('ducks under the visitor’s track and swells slowly', () => {
    expect(duckLevel(true)).toBeLessThan(duckLevel(false));
    expect(swell(0)).toBe(0);
    expect(swell(11.5, 23)).toBeCloseTo(1);
  });
});

describe('noise', () => {
  it('makes bounded, low-heavy brown noise', () => {
    const noise = brownNoise(48_000, mulberry32(1));
    expect(Math.max(...noise.map(Math.abs))).toBeLessThanOrEqual(1);
    let step = 0;
    for (let i = 1; i < noise.length; i++) step += Math.abs(noise[i]! - noise[i - 1]!);
    expect(step / noise.length).toBeLessThan(0.1); // white noise in [-1, 1] averages about 0.67
  });

  it('decays an impulse response by 60 dB over its length', () => {
    const ir = impulseResponse(48_000, 1, 48_000, mulberry32(2));
    const energy = (from: number, to: number) => ir.slice(from, to).reduce((sum, v) => sum + v * v, 0);
    expect(energy(43_200, 48_000)).toBeLessThan(energy(0, 4_800) * 0.001);
  });
});
```

Run: `cd garage && npx vitest run src/audio`
Expected: FAIL, modules not found.

- [ ] **Step 2: Implement the pure parts**

`garage/src/audio/schedule.ts`:

```ts
export const midiToHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** An original, slow progression in D minor: Dm(add9), B♭maj7, Gm7, A7sus4. No melody, no quotation. */
export const CHORDS: readonly (readonly number[])[] = [
  [50, 57, 62, 64, 65],
  [46, 53, 57, 62, 65],
  [43, 50, 58, 62, 65],
  [45, 52, 57, 62, 67],
];
export const BAR_SECONDS = 8;
export const chordAt = (seconds: number): readonly number[] => CHORDS[Math.floor(seconds / BAR_SECONDS) % CHORDS.length]!;

/** Ambience gain while the visitor's own track plays. */
export const duckLevel = (ownTrackPlaying: boolean): number => (ownTrackPlaying ? 0.2 : 1);

/** Slow 0..1 swell for distant traffic. */
export const swell = (seconds: number, period = 23): number => 0.5 - 0.5 * Math.cos((2 * Math.PI * seconds) / period);

/** Fluorescent tubes on 50 Hz mains hum at twice the line frequency, plus harmonics. */
export const HUM_HZ = [100, 200, 300] as const;
```

`garage/src/audio/noise.ts`:

```ts
export function brownNoise(length: number, rand: () => number): Float32Array {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
    out[i] = Math.max(-1, Math.min(1, last * 3.5));
  }
  return out;
}

/** Exponentially decaying noise: reaches -60 dB at `decaySeconds`. */
export function impulseResponse(length: number, decaySeconds: number, sampleRate: number, rand: () => number): Float32Array {
  const tau = decaySeconds / 6.9;
  return Float32Array.from({ length }, (_, i) => (rand() * 2 - 1) * Math.exp(-i / sampleRate / tau));
}
```

Run: `cd garage && npx vitest run src/audio`
Expected: 5 passed.

- [ ] **Step 3: Implement the Web Audio graph, effects and controller**

`garage/src/audio/ambience.ts`:

```ts
import { mulberry32 } from '../random';
import { brownNoise, impulseResponse } from './noise';
import { BAR_SECONDS, chordAt, duckLevel, HUM_HZ, midiToHz, swell } from './schedule';

const LEVEL = 0.9;
const LOOKAHEAD_SECONDS = 1.5;

/** The garage's room tone, tube hum, distant traffic, and a slow dark pad. Synthesized live. */
export class Ambience {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly pad: GainNode;
  private readonly traffic: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextBar = 0;
  private startedAt = 0;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.out = new GainNode(ctx, { gain: 0 });
    this.out.connect(destination);
    this.pad = new GainNode(ctx, { gain: 0.08 });
    this.traffic = new GainNode(ctx, { gain: 0.02 });
  }

  start(): void {
    const { ctx } = this;
    const now = ctx.currentTime;
    const rand = mulberry32(11);
    this.startedAt = now;
    this.nextBar = now + 0.1;
    this.out.gain.setTargetAtTime(LEVEL, now, 1.2);

    const room = this.loop(brownNoise(ctx.sampleRate * 4, rand));
    room.connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 260 })).connect(new GainNode(ctx, { gain: 0.22 })).connect(this.out);

    HUM_HZ.forEach((frequency, i) => {
      const hum = new OscillatorNode(ctx, { frequency });
      hum.connect(new GainNode(ctx, { gain: [0.01, 0.004, 0.0015][i] })).connect(this.out);
      hum.start(now);
      this.sources.push(hum);
    });

    const road = this.loop(brownNoise(ctx.sampleRate * 6, rand));
    road.connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 520 })).connect(this.traffic).connect(this.out);

    const reverb = new ConvolverNode(ctx);
    const ir = ctx.createBuffer(2, ctx.sampleRate * 3, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) ir.copyToChannel(impulseResponse(ir.length, 2.8, ctx.sampleRate, rand), channel);
    reverb.buffer = ir;
    const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 700, Q: 0.7 });
    const lfo = new OscillatorNode(ctx, { frequency: 0.05 });
    lfo.connect(new GainNode(ctx, { gain: 250 })).connect(tone.frequency);
    lfo.start(now);
    this.sources.push(lfo);
    this.pad.connect(tone);
    tone.connect(this.out);
    tone.connect(reverb).connect(new GainNode(ctx, { gain: 0.6 })).connect(this.out);

    this.timer = setInterval(() => this.tick(), 500);
    this.tick();
  }

  stop(): void {
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, now, 0.25);
    for (const source of this.sources) source.stop(now + 1.2);
    this.sources.length = 0;
    setTimeout(() => this.out.disconnect(), 1500);
  }

  setDuck(ownTrackPlaying: boolean): void {
    this.out.gain.setTargetAtTime(LEVEL * duckLevel(ownTrackPlaying), this.ctx.currentTime, 0.4);
  }

  private tick(): void {
    const now = this.ctx.currentTime;
    this.traffic.gain.setTargetAtTime(0.02 + 0.09 * swell(now - this.startedAt), now, 0.8);
    while (this.nextBar < now + LOOKAHEAD_SECONDS) {
      this.scheduleBar(this.nextBar, chordAt(this.nextBar - this.startedAt));
      this.nextBar += BAR_SECONDS;
    }
  }

  private scheduleBar(at: number, chord: readonly number[]): void {
    for (const note of chord) {
      for (const detune of [-7, 7]) {
        const osc = new OscillatorNode(this.ctx, { type: 'sawtooth', frequency: midiToHz(note), detune });
        const envelope = new GainNode(this.ctx, { gain: 0 });
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(0.06, at + 3);
        envelope.gain.setValueAtTime(0.06, at + BAR_SECONDS - 1);
        envelope.gain.linearRampToValueAtTime(0, at + BAR_SECONDS + 2);
        osc.connect(envelope).connect(this.pad);
        osc.start(at);
        osc.stop(at + BAR_SECONDS + 2.1);
        osc.onended = () => envelope.disconnect();
      }
    }
  }

  private loop(samples: Float32Array): AudioBufferSourceNode {
    const buffer = this.ctx.createBuffer(1, samples.length, this.ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = new AudioBufferSourceNode(this.ctx, { buffer, loop: true });
    source.start(this.ctx.currentTime);
    this.sources.push(source);
    return source;
  }
}
```

`garage/src/audio/sfx.ts`:

```ts
import { mulberry32 } from '../random';

/** The hood latch: a resonant noise thud with a low body. */
export function hoodClunk(ctx: AudioContext, out: AudioNode): void {
  const now = ctx.currentTime;
  const rand = mulberry32(5);
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.12), ctx.sampleRate);
  buffer.copyToChannel(Float32Array.from({ length: buffer.length }, () => rand() * 2 - 1), 0);
  const burst = new AudioBufferSourceNode(ctx, { buffer });
  const body = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420, Q: 6 });
  const envelope = new GainNode(ctx, { gain: 0.9 });
  envelope.gain.setValueAtTime(0.9, now);
  envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  burst.connect(body).connect(envelope).connect(out);
  burst.start(now);

  const thump = new OscillatorNode(ctx, { type: 'sine', frequency: 70 });
  thump.frequency.exponentialRampToValueAtTime(42, now + 0.18);
  const thumpGain = new GainNode(ctx, { gain: 0.7 });
  thumpGain.gain.setValueAtTime(0.7, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  thump.connect(thumpGain).connect(out);
  thump.start(now);
  thump.stop(now + 0.25);
}

export function uiTick(ctx: AudioContext, out: AudioNode): void {
  const now = ctx.currentTime;
  const osc = new OscillatorNode(ctx, { type: 'sine', frequency: 1800 });
  const gain = new GainNode(ctx, { gain: 0.05 });
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  osc.connect(gain).connect(out);
  osc.start(now);
  osc.stop(now + 0.05);
}
```

`garage/src/audio/controller.ts`:

```ts
import { Ambience } from './ambience';
import { hoodClunk, uiTick } from './sfx';

/** Owns the AudioContext. Created lazily, because browsers only allow audio after a user gesture. */
class AudioController {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: Ambience | null = null;
  private track: HTMLAudioElement | null = null;
  private trackUrl: string | null = null;

  async setEnabled(on: boolean): Promise<void> {
    if (!on) {
      this.ambience?.stop();
      this.ambience = null;
      this.track?.pause();
      await this.ctx?.suspend();
      return;
    }
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = new GainNode(this.ctx, { gain: 0.8 });
      this.master.connect(new DynamicsCompressorNode(this.ctx)).connect(this.ctx.destination);
    }
    await this.ctx.resume();
    if (!this.ambience) {
      this.ambience = new Ambience(this.ctx, this.master!);
      this.ambience.start();
    }
    if (this.track) await this.track.play().catch(() => undefined);
    this.ambience.setDuck(this.track !== null && !this.track.paused);
  }

  sfx(kind: 'hood' | 'tick'): void {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    (kind === 'hood' ? hoodClunk : uiTick)(this.ctx, this.master);
  }

  /** Plays a file the visitor picked, from memory. Nothing is uploaded or stored. Rejects if it can't play. */
  async playOwnTrack(file: File): Promise<void> {
    this.clearOwnTrack();
    const url = URL.createObjectURL(file);
    const track = new Audio(url);
    track.loop = true;
    try {
      await track.play();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    this.track = track;
    this.trackUrl = url;
    this.ambience?.setDuck(true);
  }

  clearOwnTrack(): void {
    this.track?.pause();
    if (this.trackUrl) URL.revokeObjectURL(this.trackUrl);
    this.track = null;
    this.trackUrl = null;
    this.ambience?.setDuck(false);
  }
}

export const audio = new AudioController();
```

`garage/src/audio/prefs.ts`:

```ts
const KEY = 'garage-sound';

export function readSoundPref(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeSoundPref(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Private windows can refuse storage; the preference simply isn't remembered.
  }
}
```

`garage/src/audio/bindings.ts`:

```ts
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { audio } from './controller';
import { readSoundPref, writeSoundPref } from './prefs';

/** Connects the store to the audio controller. Call once at startup. */
export function bindAudio(): void {
  useGarage.subscribe((state, previous) => {
    if (state.soundOn !== previous.soundOn) {
      writeSoundPref(state.soundOn);
      void audio.setEnabled(state.soundOn);
    }
    if (state.soundOn && isHoodOpen(state.view) !== isHoodOpen(previous.view)) audio.sfx('hood');
  });
  if (readSoundPref()) {
    // Browsers block audio until a gesture, so a remembered "on" waits for the first one.
    const resume = () => useGarage.getState().setSound(true);
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }
}
```

`garage/src/ui/SoundControls.tsx`:

```tsx
import { useRef } from 'react';
import { audio } from '../audio/controller';
import { useGarage } from '../state/store';

export function SoundControls() {
  const soundOn = useGarage((state) => state.soundOn);
  const ownTrack = useGarage((state) => state.ownTrack);
  const trackError = useGarage((state) => state.trackError);
  const { setSound, setOwnTrack, setTrackError } = useGarage.getState();
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File) => {
    setTrackError(null);
    setSound(true);
    try {
      await audio.playOwnTrack(file);
      setOwnTrack(file.name);
    } catch {
      setOwnTrack(null);
      setTrackError(`Couldn’t play “${file.name}”. Try an MP3, M4A, OGG or WAV file.`);
    }
  };

  return (
    <>
      <button type="button" className="hud-button" aria-pressed={soundOn} onClick={() => setSound(!soundOn)}>
        {soundOn ? 'Sound on' : 'Sound off'}
      </button>
      <button type="button" className="hud-button" onClick={() => input.current?.click()}>
        {ownTrack ? 'Change track' : 'Play my own track'}
      </button>
      {ownTrack && (
        <button type="button" className="hud-button" onClick={() => { audio.clearOwnTrack(); setOwnTrack(null); }}>
          Stop my track
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="audio/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void pick(file);
        }}
      />
      <p className="sound-status" role="status">
        {trackError ?? (ownTrack ? `Playing ${ownTrack} from this device. It is not uploaded.` : '')}
      </p>
    </>
  );
}
```

Add to `garage/src/ui/hud.css`:

```css
.sound-status { flex-basis: 100%; margin: 0; font: 11px/1.4 var(--mono); color: var(--muted); text-align: right; }
.sound-status:empty { display: none; }
```

In `garage/src/ui/Hud.tsx`, render `<SoundControls />` inside `.hud-actions`, after the hood button. In `garage/src/main.tsx`, call `bindAudio()` before `root.render(...)`.

- [ ] **Step 4: Listen to it**

Run: `cd garage && npm run dev`, then in a browser:
1. Click "Sound off". It turns to "Sound on", and room tone, hum and a slow pad fade in.
2. Open the hood. A clunk plays.
3. Pick a real MP3 with "Play my own track". It plays, the ambience ducks, and the status names the file.
4. Pick a non-audio file. The error message appears and the controls still work.
5. Reload. Sound stays off until the first click, then comes back.

Run: `cd garage && npm test && npm run build`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add garage/src
git commit -m "Add synthesized garage ambience and local own-track playback"
```

---

### Task 12: Playwright smoke tests, budgets, docs, final check

**Files:**
- Create: `garage/playwright.config.ts`, `garage/tests/smoke.spec.ts`, `garage/tools/check-bundle.ts`
- Modify: `garage/package.json` (scripts), `scripts/build-site.sh`, `README.md`, `docs/superpowers/specs/2026-10-10-nfs-garage-design.md` (sync the file map)

**Interfaces:**
- Consumes: everything above. The tests rely on: `body[data-ready="true"]`; buttons "Open the hood", "Close the hood", "Sound off"; hotspot buttons named by topic title; `h2` panel titles; `window.garageCamera()` when the page runs with `?qa`.
- Produces: `npm run qa`, and `npm run check:bundle`, which is wired into `scripts/build-site.sh`.

- [ ] **Step 1: Add the bundle budget check (failing first)**

`garage/tools/check-bundle.ts`:

```ts
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
```

Add `"check:bundle": "node tools/check-bundle.ts"` and `"qa": "playwright test"` to `garage/package.json`. In `scripts/build-site.sh`, add this line after the garage build:

```bash
npm --prefix garage run check:bundle
```

Run: `cd garage && npm run build && npm run check:bundle`
Expected: prints the sizes. If the total exceeds 450 KB, lazy-load the post-processing. In `Scene.tsx`, replace the `Effects` import with:

```tsx
const Effects = lazy(() => import('./Effects').then((module) => ({ default: module.Effects })));
```

Render it as `<Suspense fallback={null}><Effects /></Suspense>`, then rebuild. The check measures every JS chunk, so a lazy split alone won't pass it. If it still fails, change the check to sum only the entry chunk and the chunks it statically imports. To find them, read `dist/.vite/manifest.json` after enabling `build.manifest: true`, and walk `imports` from the `index.html` entry. Record the decision in the spec's §7.

- [ ] **Step 2: Write the smoke tests**

`garage/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const external = process.env.GARAGE_URL;

export default defineConfig({
  testDir: 'tests',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  outputDir: 'test-results',
  use: { baseURL: external ?? 'http://localhost:4176/', trace: 'retain-on-failure' },
  webServer: external ? undefined : { command: 'npm run build && npx vite preview --port 4176 --strictPort', url: 'http://localhost:4176/', reuseExistingServer: true, timeout: 240_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
```

`garage/tests/smoke.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, query = '?qa&quality=high'): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`./${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 150_000 });
  await expect(page.locator('.loader')).toHaveCount(0);
  return errors;
}

const cameraPosition = (page: Page) => page.evaluate(() => (window as unknown as { garageCamera(): number[] }).garageCamera());

test('renders the garage', async ({ page }, info) => {
  const errors = await open(page);
  const variance = await page.evaluate(() => {
    const source = document.querySelector('canvas')!;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 40;
    const context = canvas.getContext('2d')!;
    context.drawImage(source, 0, 0, 64, 40);
    const data = context.getImageData(0, 0, 64, 40).data;
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      sum += luma;
      squares += luma * luma;
    }
    const n = data.length / 4;
    return squares / n - (sum / n) ** 2;
  });
  expect(variance).toBeGreaterThan(40);
  await expect(page.locator('h1')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('showroom.png') });
  expect(errors).toEqual([]);
});

test('opens the hood and explores the engine by keyboard', async ({ page }, info) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Open the hood' }).click();
  const crank = page.getByRole('button', { name: /Flat-plane crankshaft/ });
  await expect(crank).toBeAttached();
  await crank.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Flat-plane crankshaft' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Wikipedia: BMW P60B40' }).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('crank.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 2, name: 'P60B40 V8' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open the hood' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('shows real and game facts for a car hotspot', async ({ page }) => {
  const errors = await open(page);
  const wheels = page.getByRole('button', { name: /Wheels and brakes/ });
  await wheels.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Wheels and brakes' })).toBeVisible();
  await page.getByRole('tab', { name: 'In the game' }).click();
  await expect(page.getByText(/ADR M Sport wheels/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone layout keeps the car visible', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  await open(page);
  const wheels = page.getByRole('button', { name: /Wheels and brakes/ });
  await wheels.focus();
  await page.keyboard.press('Enter');
  const panel = await page.locator('.panel').boundingBox();
  const viewport = page.viewportSize()!;
  expect(panel!.y).toBeGreaterThanOrEqual(viewport.height * 0.5);
  await expect(page.getByRole('button', { name: 'Back' })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('phone-wheels.png') });
});

test('falls back without WebGL 2', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' ? null : (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('needs WebGL 2');
  await expect(page.getByRole('link', { name: 'Back to indivar.xyz' })).toBeVisible();
});

test('rejects a file it can’t play', async ({ page }) => {
  const errors = await open(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'not-audio.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('this is not audio') });
  await expect(page.getByRole('status').filter({ hasText: 'Couldn’t play' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play my own track' })).toBeVisible();
  expect(errors.filter((e) => !/NotSupportedError|no supported source/i.test(e))).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('respects reduced motion', async ({ page }) => {
    await open(page);
    const before = await cameraPosition(page);
    await page.waitForTimeout(6000);
    expect(await cameraPosition(page)).toEqual(before);
  });
});

test('drifts when idle without reduced motion', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(1500);
  const before = await cameraPosition(page);
  await page.waitForTimeout(6000);
  expect(await cameraPosition(page)).not.toEqual(before);
});
```

- [ ] **Step 3: Run the smoke tests**

Run: `cd garage && npm run qa`
Expected: every test passes on both projects. Some tests skip by design, such as the phone layout test on desktop.

Read the screenshots in `garage/test-results/*/`. If headless Chromium can't create a WebGL 2 context (every "renders" test shows the fallback), run the tests headed with `npx playwright test --headed`. If that also fails, add `launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }` to `use`.

- [ ] **Step 4: Run under the preview baseurl**

Run:

```bash
scripts/build-site.sh /tmp/indivar-preview /preview
mkdir -p /tmp/preview-root && rm -rf /tmp/preview-root/preview && cp -R /tmp/indivar-preview /tmp/preview-root/preview
(cd /tmp/preview-root && python3 -m http.server 4177 >/dev/null 2>&1 &) && sleep 1
cd garage && GARAGE_URL=http://localhost:4177/preview/garage/ npx playwright test -g "renders the garage|opens the hood" --project=desktop
```

Expected: both pass. That proves the model, the transcoder, and the JavaScript all resolve under a subpath. Stop the server afterwards: `pkill -f "http.server 4177"`.

- [ ] **Step 5: Final verification**

Run each command and read its output:

```bash
cd garage && npm test                 # all Vitest suites + asset check
cd garage && npm run build && npm run check:bundle
scripts/build-site.sh                 # site + garage + page/link checks
scripts/build-site.sh /tmp/indivar-preview /preview
```

Expected:
- every Vitest suite passes;
- `m3-gtr.glb OK`;
- the JavaScript total is within budget;
- both `Passed: 7 pages …` lines print.

Then check performance by hand, in headed Chrome on the owner's laptop:
1. Open `npm run preview`'s URL with `?qa`.
2. Orbit for 20 seconds.
3. Run `garage.getState().quality` in the console. Expected: `'high'`; the frame monitor never downgraded.
4. Repeat in Chrome's device toolbar with CPU throttling at 4×. Expected: it drops to `'low'` and stays usable.

- [ ] **Step 6: Docs and spec sync**

In `README.md`'s Garage section, add:

````markdown
```sh
npm run qa         # Playwright smoke tests and screenshots (run `npx playwright install chromium` once)
```

### Re-processing the car model

Unzip the Sketchfab download into `garage/assets-src/model/`, run `garage/tools/install-ktx.sh` once, then `npm run prepare:car`. Blender 5.2 must be on `PATH`. The result, `garage/public/models/m3-gtr.glb`, is committed; `npm test` validates it.
````

In the spec's §4 file map, update the entries that moved:
- content lives in `src/content/` (`car.ts`, `engine.ts`, `validate.ts`, `loaderFacts.ts`);
- engine hotspot anchors and the bay box live in `src/engine/anchors.ts`;
- the tools are `tools/prepare-car.ts`, `tools/blender/prepare_car.py`, `tools/check-assets.ts`, `tools/check-bundle.ts` and `tools/shot.ts`.

In §6, remove the WebP fallback: KTX-Software is installed by script. In §10, change the KTX risk row to "Resolved: `tools/install-ktx.sh` pins and checksums KTX-Software 4.4.2". In §4.2, add `blinn12` (silver mirrors and trim) to the painted panels.

- [ ] **Step 7: Commit**

```bash
git add garage/playwright.config.ts garage/tests garage/tools/check-bundle.ts garage/package.json scripts/build-site.sh README.md docs/superpowers/specs/2026-10-10-nfs-garage-design.md
git commit -m "Add garage smoke tests, bundle budget, and docs"
```
