const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

/** `?qa` turns on test hooks: a readable canvas, `window.garage`, and `window.garageCamera`. */
export const QA = params.has('qa');

/** `?quality=high|low` pins the render quality (used by screenshots and tests). */
export const FORCED_QUALITY = params.get('quality');
