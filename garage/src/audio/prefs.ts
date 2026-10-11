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
