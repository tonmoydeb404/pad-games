"use client";

/**
 * Jungle Jeep shell: owns the engine lifecycle, the gamepad-navigable start
 * overlay (quality + start), and the pause overlay. The engine renders its
 * own HUD inside the canvas root; React only draws these overlays.
 *
 * Pad navigation: buttons carry data-mb indices; focus is applied by querying
 * the active overlay, and the ring is driven by focusIdx state so it renders
 * identically in every browser.
 */

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JeepEngine, JeepQuality } from "@/jeep/engine";
import type { SkinId } from "@/jeep/character";
import { padMenuRumble, useGamepadMenu } from "@/lib/useGamepadMenu";
import CharacterPreview from "./CharacterPreview";

// SSR disabled: the engine touches window/navigator/WebGL at construction.
const JeepCanvas = dynamic(() => import("./JeepCanvas"), { ssr: false });

const QUALITIES: { id: JeepQuality; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High (4K)" },
];

/** Playable explorers — the four Kenney skins on the shared rig. */
const CHARACTERS: { id: SkinId; label: string; blurb: string }[] = [
  { id: "skaterMaleA", label: "Rio · Skater", blurb: "Quick on his feet, always up for a trail." },
  { id: "skaterFemaleA", label: "Mia · Skater", blurb: "Fearless on any terrain." },
  { id: "criminalMaleA", label: "Dex · Outlaw", blurb: "Hard to rattle, harder to catch." },
  { id: "cyborgFemaleA", label: "Nova · Cyborg", blurb: "Part human, all explorer." },
];
const CHARACTER_KEY = "jeep.character";

const CHAR_PREV_BTN = QUALITIES.length;
const CHAR_NEXT_BTN = QUALITIES.length + 1;
const START_BTN = QUALITIES.length + 2; // Start button index in the ring
const STORE_BTN = QUALITIES.length + 3;

const PAD_CONTROLS: [string, string][] = [
  ["Left stick", "Steer · move (tilt = walk → jog)"],
  ["RT · A", "Accelerate · A jumps on foot"],
  ["LT", "Brake · reverse"],
  ["RT · L3", "Sprint (on foot, no gun)"],
  ["X · B", "Punch · kick (on foot)"],
  ["R3", "Dodge roll (on foot)"],
  ["LB", "Cameras · crouch (on foot)"],
  ["B · X", "Handbrake · horn (driving)"],
  ["Dpad ↓", "Headlights · cycle guns (on foot)"],
  ["RT · LT", "Gun out: fire · aim"],
  ["X", "Gun out: reload"],
  ["Y", "Enter / exit vehicle"],
  ["Right stick", "Look around"],
  ["RB", "Reset · warp to vehicle"],
  ["Start", "Pause"],
];

const KEY_CONTROLS: [string, string][] = [
  ["W A S D", "Drive · move on foot"],
  ["Shift", "Sprint (on foot)"],
  ["Space", "Handbrake · jump (on foot)"],
  ["J · click", "Punch (on foot)"],
  ["K · right-click", "Kick (on foot) · horn"],
  ["Q", "Dodge roll (on foot)"],
  ["C", "Crouch (on foot) · camera"],
  ["1 – 5 · Tab · 0", "Draw a gun · cycle · holster"],
  ["Click · J", "Gun out: fire (hold for auto)"],
  ["Right-click · X", "Gun out: aim down the sights"],
  ["R · T", "Gun out: reload"],
  ["F / E", "Enter / exit vehicle"],
  ["Drag", "Look around"],
  ["V · H", "Undercam · headlights"],
  ["R", "Reset · warp to vehicle (no gun)"],
  ["P / Esc", "Pause"],
];

export default function JeepShell() {
  const router = useRouter();
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
  const overlayButtons = useMemo<
    { label: string; disabled?: boolean; action: string }[]
  >(() => {
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
        { label: "← Back to Store", action: "store" },
      ];
    }
    return [
      { label: "Resume", action: "resume" },
      { label: "Restart Trail", action: "restart" },
      { label: "Quit to Store", action: "store" },
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
        case "store":
          router.push("/");
          break;
      }
    },
    [qualityLocked, ready, started, router, cycleCharacter],
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
          else if (!started) activate("store");
        }
      },
      [overlayButtons, focusIdx, paused, started, activate],
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

  return (
    <div className="relative h-dvh w-full select-none overflow-hidden bg-[#0a0f0a] text-[#f3efe6]">
      <JeepCanvas
        onEngine={onEngine}
        onProgress={onProgress}
        onReady={onReady}
        onPauseChange={onPauseChange}
        onPadChange={onPadChange}
      />

      {/* ---------------- Start overlay ---------------- */}
      {!started && (
        <div
          ref={startOverlayRef}
          className="absolute inset-0 z-40 overflow-y-auto bg-[linear-gradient(160deg,#070e08_0%,#0d160f_45%,#050906_100%)]"
        >
          <div className="flex min-h-full items-center justify-center p-5">
            <div className="w-full max-w-5xl rounded-3xl border border-white/15 bg-[#101611]/80 p-8 shadow-[0_40px_100px_rgba(0,0,0,.75)] backdrop-blur-xl sm:p-10">
              <div className="grid gap-9 lg:grid-cols-[1fr_1.05fr]">
                {/* left column — the game card */}
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#e2452f]/40 bg-[#e2452f]/15 px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#ff8c7a]">
                    ⚡ Open-world 4×4 Off-road Simulator
                  </span>
                  <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
                    Jeep in{" "}
                    <span className="bg-gradient-to-br from-[#ff7a63] to-[#ffaa00] bg-clip-text text-transparent">
                      Jungle
                    </span>
                  </h1>
                  <p className="mt-3.5 text-sm leading-relaxed text-white/70 sm:text-[15px]">
                    An open-world jungle to explore on foot or behind the wheel.
                    Start as the explorer — walk, sprint, jump, dodge, fight and shoot your way through dense
                    tropical jungle — then hop into any of 26 rides for mud
                    trails, a stream ford, a wooden bridge and a rocky climb.
                    Fully playable with a gamepad, with rumble on every bump.
                  </p>

                  {/* pad status */}
                  <div className="mt-5">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${
                        padConnected
                          ? "border-lime-300/40 bg-lime-300/10 text-lime-200"
                          : "border-white/15 bg-white/5 text-white/50"
                      }`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          padConnected ? "bg-lime-300 shadow-[0_0_8px_#bef264]" : "bg-white/30"
                        }`}
                      />
                      {padConnected ? "Gamepad connected" : "No gamepad — press any pad button"}
                    </span>
                  </div>
                </div>

                {/* right column — character select */}
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                    Choose your explorer <span className="text-white/30">· {CHARACTERS.length} characters</span>
                  </p>
                  <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-black/25">
                    <button
                      data-mb={CHAR_PREV_BTN}
                      aria-label="Previous character"
                      onFocus={() => setFocusIdx(CHAR_PREV_BTN)}
                      onClick={() => {
                        activate("character:prev");
                        padMenuRumble("move");
                      }}
                      className={`px-4 py-3 font-mono text-[13px] font-bold text-white/55 transition hover:bg-white/10 hover:text-white ${ringCls(CHAR_PREV_BTN)}`}
                    >
                      ◀
                    </button>
                    <span className="flex flex-1 items-center justify-center px-5 py-3 font-mono text-[13px] font-bold text-white">
                      {CHARACTERS[charIdx].label}
                    </span>
                    <button
                      data-mb={CHAR_NEXT_BTN}
                      aria-label="Next character"
                      onFocus={() => setFocusIdx(CHAR_NEXT_BTN)}
                      onClick={() => {
                        activate("character:next");
                        padMenuRumble("move");
                      }}
                      className={`px-4 py-3 font-mono text-[13px] font-bold text-white/55 transition hover:bg-white/10 hover:text-white ${ringCls(CHAR_NEXT_BTN)}`}
                    >
                      ▶
                    </button>
                  </div>
                  <div className="mt-4">
                    <CharacterPreview skin={CHARACTERS[charIdx].id} />
                  </div>
                  <p className="mt-2.5 text-[12px] text-white/50">{CHARACTERS[charIdx].blurb}</p>
                </div>
              </div>

              {/* quality + start */}
              <div className="mt-7 flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                    Graphics quality {qualityLocked && <span className="text-white/30">· locked</span>}
                  </p>
                  <div className="flex overflow-hidden rounded-xl border border-white/10 bg-black/25">
                    {QUALITIES.map((q, i) => (
                      <button
                        key={q.id}
                        data-mb={i}
                        disabled={qualityLocked}
                        onFocus={() => setFocusIdx(i)}
                        onClick={() => {
                          activate(`quality:${q.id}`);
                          padMenuRumble("move");
                        }}
                        className={`px-5 py-3 font-mono text-[13px] font-bold transition disabled:opacity-50 ${ringCls(i)} ${
                          quality === q.id
                            ? "bg-gradient-to-b from-[#e2452f] to-[#b82d19] text-white"
                            : "text-white/55 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  data-mb={START_BTN}
                  disabled={!ready}
                  onFocus={() => setFocusIdx(START_BTN)}
                  onClick={() => activate("start")}
                  className={`rounded-2xl px-10 py-4 font-mono text-[16px] font-black uppercase tracking-wide transition ${ringCls(START_BTN)} ${
                    ready
                      ? "bg-gradient-to-br from-[#ff543d] to-[#e2452f] text-white shadow-[0_12px_36px_rgba(226,69,47,.45)] hover:scale-[1.02] hover:shadow-[0_18px_48px_rgba(226,69,47,.6)]"
                      : "cursor-progress bg-white/10 text-white/40"
                  }`}
                >
                  {ready ? "Start Experience" : `Preparing… ${progress.pct}%`}
                </button>
              </div>

              {/* progress */}
              {!ready && (
                <div className="mt-5">
                  <div className="h-1 overflow-hidden rounded bg-white/10">
                    <div
                      className="h-full rounded bg-gradient-to-r from-[#e2452f] to-[#ff7a5c] transition-[width] duration-300"
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                  <p className="mt-2 font-mono text-[11px] tracking-wide text-white/45">{progress.label}</p>
                </div>
              )}

              {/* controls */}
              <div className="mt-8 grid gap-x-6 gap-y-5 border-t border-white/10 pt-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#ff8c7a]">
                    🎮 Gamepad
                  </p>
                  <ul className="space-y-1 text-[12px] text-white/60">
                    {PAD_CONTROLS.map(([keys, action]) => (
                      <li key={keys} className="flex justify-between gap-3">
                        <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-white">
                          {keys}
                        </kbd>
                        <span className="text-right">{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
                    ⌨️ Keyboard
                  </p>
                  <ul className="space-y-1 text-[12px] text-white/60">
                    {KEY_CONTROLS.map(([keys, action]) => (
                      <li key={keys} className="flex justify-between gap-3">
                        <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-white">
                          {keys}
                        </kbd>
                        <span className="text-right">{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
                <p className="font-mono text-[10px] text-white/30">
                  Original concept by Ali Usman · ported to Pad·Games
                </p>
                <button
                  data-mb={STORE_BTN}
                  onFocus={() => setFocusIdx(STORE_BTN)}
                  onClick={() => activate("store")}
                  className={`rounded-lg border border-white/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/60 transition hover:bg-white/5 hover:text-white ${ringCls(STORE_BTN)}`}
                >
                  ← Back to Store
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Pause overlay ---------------- */}
      {started && paused && (
        <div
          ref={pauseOverlayRef}
          className="absolute inset-0 z-30 flex items-center justify-center bg-[#050906]/70 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#101611]/90 p-8 text-center shadow-2xl">
            <h2 className="text-3xl font-black tracking-tight text-white">Paused</h2>
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
              Start / Esc to continue
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              {overlayButtons.map((btn, i) => (
                <button
                  key={btn.label}
                  data-mb={i}
                  onFocus={() => setFocusIdx(i)}
                  onClick={() => {
                    activate(btn.action);
                    padMenuRumble("confirm");
                  }}
                  className={`rounded-xl border px-5 py-3 font-mono text-[13px] font-bold uppercase tracking-[0.14em] transition ${ringCls(i)} ${
                    clampedIdx === i
                      ? "border-lime-300/80 bg-lime-300/15 text-lime-100"
                      : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
