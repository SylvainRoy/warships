import { GAME_CONFIG } from "../shared/config.js";

export type SoundKind =
  | "cannon-fire"
  | "splash"
  | "shell-explosion"
  | "torpedo-launch"
  | "torpedo-hit"
  | "own-damage"
  | "sinking"
  | "turret-fire"
  | "radar-ping"
  | "chime";

export interface SoundPosition {
  distance?: number;
  dx?: number;
  own?: boolean;
  gain?: number;
}

export function worldSoundAttenuation(distance: number): number {
  if (distance <= GAME_CONFIG.audio.fullVolumeDistance) return 1;
  if (distance >= GAME_CONFIG.audio.maxDistance) return 0;
  return 1 - (distance - GAME_CONFIG.audio.fullVolumeDistance)
    / (GAME_CONFIG.audio.maxDistance - GAME_CONFIG.audio.fullVolumeDistance);
}

export function stereoPanForOffset(dx: number): number {
  return Math.max(-1, Math.min(1, dx / GAME_CONFIG.audio.panDistance)) * GAME_CONFIG.audio.panScale;
}

export class SoundRateLimiter {
  private readonly lastPlayedAt = new Map<string, number>();

  constructor(
    private readonly intervalMs: number = GAME_CONFIG.audio.rateLimitMs,
    private readonly maxVoices: number = GAME_CONFIG.audio.maxVoices,
  ) {}

  allow(kind: string, now: number, activeVoices: number): boolean {
    if (activeVoices >= this.maxVoices) return false;
    const previous = this.lastPlayedAt.get(kind);
    if (previous !== undefined && now - previous < this.intervalMs) return false;
    this.lastPlayedAt.set(kind, now);
    return true;
  }
}

type AudioContextConstructor = typeof AudioContext;
interface ScheduledSoundSource {
  output: AudioNode;
  source: AudioScheduledSourceNode;
  when: number;
  stopAt: number;
}

export class SynthAudio {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly limiter = new SoundRateLimiter();
  private activeVoices = 0;
  private volume: number = GAME_CONFIG.effects.defaultVolume;

  resumeOnGesture(): void {
    if (!this.context) {
      const AudioContextType = (window as Window & {
        AudioContext?: AudioContextConstructor;
        webkitAudioContext?: AudioContextConstructor;
      }).AudioContext
        ?? (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
      if (!AudioContextType) return;
      const context = new AudioContextType();
      const masterGain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      masterGain.gain.value = this.volume / 100;
      masterGain.connect(compressor);
      compressor.connect(context.destination);
      this.context = context;
      this.masterGain = masterGain;
    }
    const context = this.context;
    if (context?.state === "suspended") void context.resume();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, volume));
    if (this.context && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume / 100, this.context.currentTime, 0.01);
    }
  }

  play(kind: SoundKind, position: SoundPosition = {}): void {
    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain || this.volume === 0) return;
    const attenuation = position.own ? 1 : worldSoundAttenuation(position.distance ?? 0);
    const gainScale = attenuation * (position.gain ?? 1);
    if (gainScale <= 0) return;
    if (!this.limiter.allow(kind, performance.now(), this.activeVoices)) return;
    const pan = position.own ? 0 : stereoPanForOffset(position.dx ?? 0);
    const start = context.currentTime + 0.005;
    const duration = soundDuration(kind);
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(pan, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(gainScale, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    envelope.connect(panner);
    panner.connect(masterGain);

    const sources = createSoundSources(context, kind, start, duration);
    for (const scheduled of sources) scheduled.output.connect(envelope);
    this.activeVoices += 1;
    for (const scheduled of sources) {
      scheduled.source.start(scheduled.when);
      scheduled.source.stop(scheduled.stopAt);
    }
    window.setTimeout(() => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      envelope.disconnect();
      panner.disconnect();
    }, duration * 1000 + 100);
  }
}

function soundDuration(kind: SoundKind): number {
  switch (kind) {
    case "cannon-fire": return 0.38;
    case "splash": return 0.2;
    case "shell-explosion": return 0.46;
    case "torpedo-launch": return 0.28;
    case "torpedo-hit": return 0.62;
    case "own-damage": return 0.22;
    case "sinking": return 1.15;
    case "turret-fire": return 0.16;
    case "radar-ping": return 0.18;
    case "chime": return 0.44;
  }
}

function createSoundSources(
  context: AudioContext,
  kind: SoundKind,
  start: number,
  duration: number,
): ScheduledSoundSource[] {
  const oscillator = (
    type: OscillatorType,
    from: number,
    to: number,
    offset = 0,
    length = duration,
  ): ScheduledSoundSource => {
    const source = context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(from, start + offset);
    source.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + offset + length);
    return { output: source, source, when: start + offset, stopAt: start + offset + length };
  };
  const noise = (type: BiquadFilterType, frequency: number): ScheduledSoundSource => {
    const samples = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, samples, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples; index += 1) channel[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.35), start + duration);
    source.connect(filter);
    return { output: filter, source, when: start, stopAt: start + duration };
  };

  switch (kind) {
    case "cannon-fire":
      return [oscillator("sine", 115, 38), noise("lowpass", 900)];
    case "splash":
      return [noise("highpass", 1200)];
    case "shell-explosion":
      return [oscillator("sawtooth", 150, 42), noise("lowpass", 1100)];
    case "torpedo-launch":
      return [oscillator("triangle", 260, 90), noise("bandpass", 850)];
    case "torpedo-hit":
      return [oscillator("sine", 85, 28), noise("lowpass", 700)];
    case "own-damage":
      return [oscillator("triangle", 92, 44)];
    case "sinking":
      return [oscillator("sine", 72, 24), noise("lowpass", 260)];
    case "turret-fire":
      return [oscillator("square", 240, 95)];
    case "radar-ping":
      return [oscillator("sine", 980, 560)];
    case "chime":
      return [oscillator("sine", 587, 587, 0, 0.16), oscillator("sine", 784, 784, 0.15, 0.22)];
  }
}
