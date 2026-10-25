/**
 * Score backend adapter. Uses Supabase (REST, zero SDK) when public env vars
 * are configured, and transparently falls back to localStorage so the game
 * works fully offline. See README for the SQL schema + RLS policies.
 */

import { dailySeedFor } from "@/game/core/rng";

export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  distance: number;
  mode: "daily" | "free";
  seed: number;
  duration: number;
  created_at: string;
}

export interface SubmitInput {
  name: string;
  score: number;
  distance: number;
  mode: "daily" | "free";
  seed: number;
  duration: number;
}

const LOCAL_KEY = "duneglide.scores.v1";
const MAX_LOCAL = 100;

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const backendKind: "supabase" | "local" =
  envUrl && envKey ? "supabase" : "local";

/** Basic server-plausibility style validation, mirrored client-side. */
export function validateEntry(e: SubmitInput): string | null {
  if (!Number.isFinite(e.score) || e.score < 0 || e.score > 10_000_000) {
    return "invalid score";
  }
  if (!Number.isFinite(e.distance) || e.distance < 0 || e.distance > 500_000) {
    return "invalid distance";
  }
  if (!Number.isFinite(e.duration) || e.duration <= 0) {
    return "invalid duration";
  }
  // Plausibility: max ~220 points per meter travelled plus trick budget.
  if (e.score > e.distance * 220 + 5000) {
    return "implausible score";
  }
  // Run must have been long enough to cover the distance (min avg speed).
  if (e.distance > 0 && e.duration < (e.distance * 40) / 1500) {
    return "implausible duration";
  }
  const name = e.name.trim().slice(0, 24);
  if (!name) return "invalid name";
  return null;
}

function localLoad(): ScoreEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function localSave(entries: ScoreEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    entries.sort((a, b) => b.score - a.score);
    window.localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify(entries.slice(0, MAX_LOCAL)),
    );
  } catch {
    // storage unavailable — scores stay session-only
  }
}

async function supabaseFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${envUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: envKey!,
      Authorization: `Bearer ${envKey!}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function getScores(mode: "daily" | "free"): Promise<ScoreEntry[]> {
  if (backendKind === "supabase") {
    const path =
      mode === "daily"
        ? `dg_scores?mode=eq.daily&seed=eq.${dailySeedFor()}&order=score.desc&limit=50`
        : `dg_scores?mode=eq.free&order=score.desc&limit=50`;
    const res = await supabaseFetch(path);
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return (await res.json()) as ScoreEntry[];
  }
  const todaySeed = dailySeedFor();
  return localLoad()
    .filter((e) =>
      mode === "daily" ? e.mode === "daily" && e.seed === todaySeed : e.mode === "free",
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

export async function submitScore(
  input: SubmitInput,
): Promise<{ ok: boolean; error?: string; entry?: ScoreEntry }> {
  const invalid = validateEntry(input);
  if (invalid) return { ok: false, error: invalid };

  const entry: ScoreEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim().slice(0, 24) || "Rider",
    score: Math.floor(input.score),
    distance: Math.floor(input.distance),
    mode: input.mode,
    seed: input.seed,
    duration: input.duration,
    created_at: new Date().toISOString(),
  };

  if (backendKind === "supabase") {
    const res = await supabaseFetch("dg_scores", {
      method: "POST",
      body: JSON.stringify({
        name: entry.name,
        score: entry.score,
        distance: entry.distance,
        mode: entry.mode,
        seed: entry.seed,
        duration: entry.duration,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Supabase ${res.status}` };
    }
    return { ok: true, entry };
  }

  const entries = localLoad();
  entries.push(entry);
  localSave(entries);
  return { ok: true, entry };
}
