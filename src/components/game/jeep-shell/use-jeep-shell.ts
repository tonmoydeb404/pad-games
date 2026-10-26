import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JeepEngine, JeepQuality } from "@/game/core/engine";
import { padMenuRumble, useGamepadMenu } from "@/hooks/use-gamepad-menu";
import type { MenuItem, MenuNav } from "./menu-types";
import { CHARACTERS, CHARACTER_KEY, QUALITIES, QUALITY_KEY } from "./shell-data";

const readSaved = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode etc. — defaults are fine
  }
};
const save = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // non-fatal
  }
};
const cycle = (i: number, dir: 1 | -1, n: number): number => (i + dir + n) % n;

/** Shell state: engine lifecycle, title/pause menus, settings and gamepad-menu navigation. */
export function useJeepShell() {
  const engineRef = useRef<JeepEngine | null>(null);
  const startOverlayRef = useRef<HTMLDivElement | null>(null);
  const pauseOverlayRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, label: "Loading 3D engine & terrain assets…" });
  const [quality, setQuality] = useState<JeepQuality>("high");
  const [padConnected, setPadConnected] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const charIdxRef = useRef(0);

  // Restore saved settings after mount (client only; the engine boots with the defaults).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const c = CHARACTERS.findIndex((x) => x.id === readSaved(CHARACTER_KEY));
      if (c > 0) {
        charIdxRef.current = c;
        setCharIdx(c);
      }
      const q = QUALITIES.find((x) => x.id === readSaved(QUALITY_KEY));
      if (q) setQuality(q.id);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const onEngine = useCallback((engine: JeepEngine) => {
    engineRef.current = engine;
    void engine.setSkin(CHARACTERS[charIdxRef.current].id);
  }, []);
  const onProgress = useCallback((pct: number, label: string) => setProgress({ pct, label }), []);
  const onReady = useCallback(() => {
    setReady(true);
    setFocusIdx(0); // land on Play
  }, []);
  const onPauseChange = useCallback((p: boolean) => {
    setPaused(p);
    setFocusIdx(0);
    if (!p) setControlsOpen(false);
  }, []);
  const onPadChange = useCallback((c: boolean) => setPadConnected(c), []);

  const items = useMemo<MenuItem[]>(() => {
    if (started) {
      return [
        { id: "resume", label: "Resume", primary: true },
        { id: "controls", label: "Controls" },
        { id: "restart", label: "Respawn at the trail" },
      ];
    }
    return [
      { id: "start", label: "Play", primary: true, disabled: !ready, hint: ready ? undefined : `${progress.pct}%` },
      { id: "character", label: "Explorer", value: CHARACTERS[charIdx].label.split(" · ")[0] },
      { id: "quality", label: "Graphics", value: quality },
      { id: "controls", label: "Controls" },
    ];
  }, [started, ready, progress.pct, charIdx, quality]);

  const activate = useCallback(
    (id: string, dir: 1 | -1 = 1) => {
      switch (id) {
        case "start":
          if (ready && !started) {
            setStarted(true);
            engineRef.current?.start();
          }
          break;
        case "character": {
          const next = cycle(charIdxRef.current, dir, CHARACTERS.length);
          charIdxRef.current = next;
          setCharIdx(next);
          void engineRef.current?.setSkin(CHARACTERS[next].id);
          save(CHARACTER_KEY, CHARACTERS[next].id);
          break;
        }
        case "quality": {
          // graphics are baked at world build: changing them rebuilds the world
          const next = QUALITIES[cycle(QUALITIES.findIndex((q) => q.id === quality), dir, QUALITIES.length)].id;
          setQuality(next);
          setReady(false);
          setProgress({ pct: 0, label: "Rebuilding the world…" });
          save(QUALITY_KEY, next);
          break;
        }
        case "controls":
          setControlsOpen(true);
          break;
        case "resume":
          engineRef.current?.resume();
          break;
        case "restart":
          engineRef.current?.restart();
          engineRef.current?.resume();
          break;
      }
    },
    [ready, started, quality],
  );

  const clampedIdx = Math.min(focusIdx, items.length - 1);
  const overlayVisible = !started || paused;
  const menuActive = overlayVisible && !controlsOpen;

  const step = useCallback(
    (dir: 1 | -1) =>
      setFocusIdx((i) => {
        let n = Math.min(i, items.length - 1);
        for (let k = 0; k < items.length; k++) {
          n = cycle(n, dir, items.length);
          if (!items[n].disabled) break;
        }
        return n;
      }),
    [items],
  );

  const onMenuAction = useCallback(
    (action: "up" | "down" | "left" | "right" | "confirm" | "back") => {
      if (controlsOpen) {
        if (action === "back" || action === "confirm") setControlsOpen(false);
        return;
      }
      const cur = items[clampedIdx];
      if (action === "up" || action === "down") {
        step(action === "up" ? -1 : 1);
        padMenuRumble("move");
      } else if (action === "left" || action === "right") {
        if (cur?.value !== undefined) {
          activate(cur.id, action === "left" ? -1 : 1);
          padMenuRumble("move");
        }
      } else if (action === "confirm") {
        if (cur && !cur.disabled) {
          activate(cur.id);
          padMenuRumble("confirm");
        }
      } else if (paused) activate("resume");
    },
    [controlsOpen, items, clampedIdx, step, activate, paused],
  );

  useGamepadMenu(overlayVisible, onMenuAction);

  // Keyboard: arrows move/adjust (Enter/Space click the focused button natively).
  useEffect(() => {
    if (!menuActive && !controlsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, "up" | "down" | "left" | "right" | "back"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Escape: "back",
      };
      const a = map[e.key];
      if (!a) return;
      if (a === "back" && !controlsOpen) return; // the engine owns Esc-to-pause
      e.preventDefault();
      onMenuAction(a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuActive, controlsOpen, onMenuAction]);

  // Keep DOM focus on the highlighted row.
  useEffect(() => {
    if (!menuActive) return;
    const root = paused ? pauseOverlayRef.current : startOverlayRef.current;
    root?.querySelector<HTMLElement>(`[data-mb="${clampedIdx}"]`)?.focus({ preventScroll: true });
  }, [clampedIdx, menuActive, paused]);

  const nav: MenuNav = { items, focusIdx: clampedIdx, setFocusIdx, activate };

  return {
    startOverlayRef,
    pauseOverlayRef,
    ready,
    started,
    paused,
    progress,
    quality,
    padConnected,
    charIdx,
    nav,
    controlsOpen,
    closeControls: () => setControlsOpen(false),
    engineCallbacks: { onEngine, onProgress, onReady, onPauseChange, onPadChange },
  };
}
