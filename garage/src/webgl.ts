export function supportsWebGL2(): boolean {
  try {
    return typeof WebGL2RenderingContext !== 'undefined' && document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
