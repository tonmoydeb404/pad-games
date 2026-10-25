import { defaultSettings, type Settings } from "@/game/core/types";

const KEY = "duneglide.settings.v1";

/**
 * Tiny external store so React reads settings via useSyncExternalStore
 * (hydration-safe: the server snapshot is the defaults) instead of
 * setState-in-effect bootstrapping.
 */

type Listener = () => void;

let cache: Settings | null = null;
const listeners = new Set<Listener>();

function readFromStorage(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...defaultSettings };
  }
}

export const settingsStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Client snapshot — stable identity between storage writes. */
  get(): Settings {
    if (typeof window === "undefined") return defaultSettings;
    if (cache === null) cache = readFromStorage();
    return cache;
  },

  /** Server snapshot — defaults, so SSR markup is deterministic. */
  getServer(): Settings {
    return defaultSettings;
  },

  set(next: Settings): void {
    cache = next;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      }
    } catch {
      // storage unavailable — keep session-only settings
    }
    for (const l of listeners) l();
  },
};
