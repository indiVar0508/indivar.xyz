import { Ambience } from './ambience';
import { EngineSound, engineLive, type EngineStatus } from './engineSound';
import { hoodClunk, uiTick } from './sfx';

/** Owns the AudioContext. Created lazily, because browsers only allow audio after a user gesture. */
class AudioController {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: Ambience | null = null;
  private track: HTMLAudioElement | null = null;
  private trackUrl: string | null = null;
  private radioPlaying = false;
  private engine: Promise<EngineSound> | null = null;
  /** Told whenever the engine's status changes on the audio thread. */
  onEngineStatus: (status: EngineStatus) => void = () => undefined;

  async setEnabled(on: boolean): Promise<void> {
    if (!on) {
      this.resetEngine();
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
    this.duck();
  }

  /** The Most Wanted radio plays in YouTube's player, outside this context, so it only reports in to duck the room. */
  setRadioPlaying(playing: boolean): void {
    this.radioPlaying = playing;
    this.duck();
  }

  private duck(): void {
    this.ambience?.setDuck(this.radioPlaying || engineLive.status !== 'off' || (this.track !== null && !this.track.paused));
  }

  /** Starts the P60B40. Turns the audio on first if it isn't; rejects if the engine sound can't load here. */
  async startEngine(): Promise<void> {
    await this.setEnabled(true);
    this.engine ??= EngineSound.create(this.ctx!, this.master!, (status) => {
      this.duck();
      this.onEngineStatus(status);
    }).catch((error: unknown) => {
      this.engine = null;
      throw error;
    });
    (await this.engine).start();
  }

  stopEngine(): void {
    void this.engine?.then((engine) => engine.stop());
  }

  /** The accelerator, 0 to 1. */
  setThrottle(pedal: number): void {
    void this.engine?.then((engine) => engine.throttle(pedal));
  }

  private resetEngine(): void {
    void this.engine?.then((engine) => engine.reset());
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
    this.duck();
  }

  clearOwnTrack(): void {
    this.track?.pause();
    if (this.trackUrl) URL.revokeObjectURL(this.trackUrl);
    this.track = null;
    this.trackUrl = null;
    this.duck();
  }
}

export const audio = new AudioController();
