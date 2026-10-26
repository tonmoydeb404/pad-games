import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JeepEngine, JeepQuality } from "@/game/core/engine";
import { padMenuRumble, useGamepadMenu } from "@/hooks/use-gamepad-menu";
import { CHARACTERS, CHARACTER_KEY, QUALITIES, START_BTN } from "./shell-data";
import type { OverlayButton } from "./menu-types";

/**
 * Shell state: engine lifecycle callbacks, explorer selection, overlay
 * buttons and gamepad-menu navigation.
 */
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
  const charIdxRef = useRef(0);

  // Restore the saved explorer (client only). The ref feeds the engine; the
  // deferred state update refreshes the picker.
  useEffect(() => {
    let raf = 0;
    try {
      const saved = window.localStorage.getItem(CHARACTER_KEY);
      const i = saved ? CHARACTERS.findIndex((c) => c.id === saved) : -1;
      if (i > 0) {
        charIdxRef.current = i;
        raf = requestAnimationFrame(() => setCharIdx(i));
      }
    } catch {
      // private mode etc. — the first explorer is fine
    }
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Cycle the explorer; applies live to the in-game character too. */
  const cycleCharacter = useCallback((dir: 1 | -1) => {
    const next = (charIdxRef.current + dir + CHARACTERS.length) % CHARACTERS.length;
    charIdxRef.current = next;
    setCharIdx(next);
    const id = CHARACTERS[next].id;
    void engineRef.current?.setSkin(id);
    try {
      window.localStorage.setItem(CHARACTER_KEY, id);
    } catch {
      // non-fatal
    }
  }, []);

  // Stable engine callbacks -------------------------------------------------
  const onEngine = useCallback((engine: JeepEngine) => {
    engineRef.current = engine;
    // Apply the restored selection — the engine boots with the first explorer.
    void engine.setSkin(CHARACTERS[charIdxRef.current].id);
  }, []);
  const onProgress = useCallback((pct: number, label: string) => {
    setProgress({ pct, label });
  }, []);
  const onReady = useCallback(() => {
    setReady(true);
    // Land focus on the Start button once the world is built.
    setFocusIdx(START_BTN);
  }, []);
  const onPauseChange = useCallback((p: boolean) => setPaused(p), []);
  const onPadChange = useCallback((c: boolean) => setPadConnected(c), []);

  // Gamepad menu navigation -------------------------------------------------
  const qualityLocked = ready;

  /** Pure button data — no ref-touching closures, safe to build in render. */
  const overlayButtons = useMemo<OverlayButton[]>(() => {
    if (!started) {
      return [
        ...QUALITIES.map((q) => ({
          label: q.label,
          disabled: qualityLocked,
          action: `quality:${q.id}`,
        })),
        { label: "◀", action: "character:prev" },
        { label: "▶", action: "character:next" },
        { label: ready ? "Start Experience" : "Preparing…", disabled: !ready, action: "start" },
      ];
    }
    return [
      { label: "Resume", action: "resume" },
      { label: "Restart Trail", action: "restart" },
    ];
  }, [started, qualityLocked, ready]);

  /** Dispatches a button action. Event-handler context only. */
  const activate = useCallback(
    (action: string) => {
      if (action.startsWith("quality:")) {
        if (!qualityLocked) setQuality(action.slice(8) as JeepQuality);
        return;
      }
      if (action === "character:prev") {
        cycleCharacter(-1);
        return;
      }
      if (action === "character:next") {
        cycleCharacter(1);
        return;
      }
      switch (action) {
        case "start":
          if (ready && !started) {
            setStarted(true);
            engineRef.current?.start();
          }
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
    [qualityLocked, ready, started, cycleCharacter],
  );

  // Stale index (e.g. after switching overlays) clamps instead of cascading.
  const clampedIdx = Math.min(focusIdx, overlayButtons.length - 1);
  const overlayVisible = !started || paused;

  useGamepadMenu(
    overlayVisible,
    useCallback(
      (action) => {
        const count = overlayButtons.length;
        if (action === "up" || action === "down" || action === "left" || action === "right") {
          const dir = action === "up" || action === "left" ? -1 : 1;
          setFocusIdx((i) => (Math.min(i, count - 1) + dir + count) % count);
          padMenuRumble("move");
          return;
        }
        if (action === "confirm") {
          const btn = overlayButtons[Math.min(focusIdx, count - 1)];
          if (btn && !btn.disabled) {
            activate(btn.action);
            padMenuRumble("confirm");
          }
          return;
        }
        if (action === "back") {
          if (paused) activate("resume");
        }
      },
      [overlayButtons, focusIdx, paused, activate],
    ),
  );

  // Keep DOM focus in sync with the ring (keyboard Enter then just works).
  useEffect(() => {
    if (!overlayVisible) return;
    const container = paused
      ? pauseOverlayRef.current
      : started
        ? null
        : startOverlayRef.current;
    const el = container?.querySelector<HTMLElement>(`[data-mb="${clampedIdx}"]`);
    el?.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
  }, [clampedIdx, overlayVisible, started, paused]);

  const ringCls = (i: number) =>
    clampedIdx === i && overlayVisible
      ? "outline outline-2 outline-offset-2 outline-lime-300"
      : "outline-none";

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
    qualityLocked,
    overlayButtons,
    clampedIdx,
    focus: { ringCls, setFocusIdx, activate },
    engineCallbacks: { onEngine, onProgress, onReady, onPauseChange, onPadChange },
  };
}
