import type { WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

let ktx2: KTX2Loader | undefined;

/** One KTX2 loader per page. Its Basis transcoder (WebAssembly) is served from `basis/` beside index.html. */
export function getKtx2Loader(renderer: WebGLRenderer): KTX2Loader {
  ktx2 ??= new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(renderer);
  return ktx2;
}
