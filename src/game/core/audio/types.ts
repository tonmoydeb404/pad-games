export interface VehicleAudioState {
  rpm: number;
  throttle: number;
  brake: number;
  speed: number;
  maxSpeed: number;
  surface: string;
  handbrake: boolean;
  lateral: number;
  bumpImpulse: number;
}

export type ImpactGroup = "light" | "wood" | "heavy";

/** Every Web Audio node and cooldown the JeepAudio modules share. */
export interface AudioState {
  ctx: AudioContext | null;
  master: GainNode | null;
  bgmGain: GainNode | null;
  /** Dedicated duck stage between the music bus and master (audio-design:
   * ducking must never overwrite the music bus level itself). */
  musicDuck: GainNode | null;
  engineBus: GainNode | null;
  sfxBus: GainNode | null;
  /** Adaptive-music intensity 0..1 (drives melody/hat layers). */
  intensity: number;
  engOsc1: OscillatorNode | null;
  engOsc2: OscillatorNode | null;
  engGain: GainNode | null;
  engFilter: BiquadFilterNode | null;
  subOsc: OscillatorNode | null;
  subGain: GainNode | null;
  tireFilter: BiquadFilterNode | null;
  tireGain: GainNode | null;
  skidGain: GainNode | null;
  muted: boolean;
  ready: boolean;
  ambienceBus: GainNode | null;
  ambienceSrc: AudioBufferSourceNode | null;
  /** The Jungle Express: chuff pulse + low rumble through one panner. */
  trainBus: GainNode | null;
  trainPan: StereoPannerNode | null;
  chugPulse: GainNode | null;
  chugGain: GainNode | null;
  chugLfo: OscillatorNode | null;
  rumbleGain: GainNode | null;
  /** Real CC0 impact samples (Kenney), grouped by weight. */
  impacts: Record<ImpactGroup, AudioBuffer[]>;
  lastSplash: number;
  lastThump: number;
  lastHorn: number;
  lastDuck: number;
  lastThud: number;
  lastCall: number;
  lastShot: number;
  lastStep: number;
  stepTimer: ReturnType<typeof setInterval> | null;
  currentStep: number;
  /** True while the player is walking: the parked jeep's engine falls silent. */
  footMode: boolean;
  stateRef: VehicleAudioState | null;
}

export function createAudioState(): AudioState {
  return {
    ctx: null,
    master: null,
    bgmGain: null,
    musicDuck: null,
    engineBus: null,
    sfxBus: null,
    intensity: 0,
    engOsc1: null,
    engOsc2: null,
    engGain: null,
    engFilter: null,
    subOsc: null,
    subGain: null,
    tireFilter: null,
    tireGain: null,
    skidGain: null,
    muted: false,
    ready: false,
    ambienceBus: null,
    ambienceSrc: null,
    trainBus: null,
    trainPan: null,
    chugPulse: null,
    chugGain: null,
    chugLfo: null,
    rumbleGain: null,
    impacts: { light: [], wood: [], heavy: [] },
    lastSplash: 0,
    lastThump: 0,
    lastHorn: 0,
    lastDuck: 0,
    lastThud: 0,
    lastCall: 0,
    lastShot: 0,
    lastStep: 0,
    stepTimer: null,
    currentStep: 0,
    footMode: false,
    stateRef: null,
  };
}
