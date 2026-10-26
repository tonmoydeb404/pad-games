import { clamp } from "../noise";
import { sfxOut } from "./duck";
import type { AudioState, ImpactGroup } from "./types";

/** Kenney impact-sounds banks shipped under CC0 (rides in /assets/jeep/audio). */
const IMPACT_FILES: Record<ImpactGroup, string[]> = {
  light: ["impactGeneric_light_000", "impactGeneric_light_001", "impactGeneric_light_002", "impactGeneric_light_003", "impactGeneric_light_004"],
  wood: ["impactWood_medium_000", "impactWood_medium_001", "impactWood_medium_002", "impactWood_medium_003", "impactWood_medium_004"],
  heavy: ["impactPlate_heavy_000", "impactPlate_heavy_001", "impactPlate_heavy_002", "impactPlate_heavy_003", "impactPlate_heavy_004", "impactSoft_heavy_000", "impactSoft_heavy_001", "impactSoft_heavy_002", "impactSoft_heavy_003", "impactSoft_heavy_004"],
};

/**
 * Fetch the CC0 recorded audio (TinyWorlds ambience + Kenney impacts).
 * Never throws; gameplay never waits for it.
 */
export async function loadSamples(a: AudioState): Promise<void> {
  const ctx = a.ctx;
  if (!ctx || !a.ready) return;
  const decode = async (url: string): Promise<AudioBuffer | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return await ctx.decodeAudioData(arr);
    } catch {
      return null; // decode unsupported (or offline) — procedural layer stays
    }
  };

  // recorded rainforest bed — loops seamlessly, sits under everything
  const amb = await decode("/assets/jeep/audio/ambience.mp3");
  if (amb && a.ctx && a.ambienceBus && a.ready) {
    const src = a.ctx.createBufferSource();
    src.buffer = amb;
    src.loop = true;
    const g = a.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(g);
    g.connect(a.ambienceBus);
    src.start();
    a.ambienceSrc = src;
  }

  // Kenney impact banks → randomized one-shots for bumps/crashes
  const groups = Object.keys(IMPACT_FILES) as ImpactGroup[];
  const ids = groups.flatMap((grp) => IMPACT_FILES[grp].map((n) => [n, grp] as const));
  const bufs = await Promise.all(ids.map(async ([n, grp]) => [grp, await decode(`/assets/jeep/audio/impact/${n}.mp3`)] as const));
  if (!a.ctx || !a.ready) return;
  a.impacts = { light: [], wood: [], heavy: [] };
  for (const [grp, b] of bufs) {
    if (b) a.impacts[grp].push(b);
  }
}

/** Randomized real-impact one-shot; returns false when no samples loaded. */
export function playImpact(a: AudioState, group: ImpactGroup, strength: number): boolean {
  const ctx = a.ctx;
  const pool = a.impacts[group];
  if (!ctx || !a.ready || a.muted || pool.length === 0) return false;
  const buf = pool[Math.floor(Math.random() * pool.length)];
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.85 + Math.random() * 0.35;
  const g = ctx.createGain();
  g.gain.setValueAtTime(clamp(strength, 0.05, 1), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + buf.duration);
  src.connect(g);
  g.connect(sfxOut(a)!);
  src.start(t);
  src.stop(t + buf.duration + 0.05);
  return true;
}
