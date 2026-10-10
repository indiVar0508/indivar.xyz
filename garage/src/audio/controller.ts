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
