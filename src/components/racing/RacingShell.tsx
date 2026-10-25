"use client";

/**
 * Racing shell: owns the engine lifecycle, the gamepad-navigable start
 * overlay (car + quality + start), the pause overlay and the in-race HUD
 * (speedometer, minimap, tokens, drift score, toasts).
 *
 * Pad navigation mirrors the jeep shell: buttons carry data-mb indices and
 * the focus ring is driven by focusIdx state.
 */

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CAR_CATALOG } from "@/racing/cars";
import type { HudFrame, RacingEngine, RacingQuality } from "@/racing/engine";
import { padMenuRumble, useGamepadMenu } from "@/lib/useGamepadMenu";

// SSR disabled: the engine touches window/navigator/WebGL at construction.
const RacingCanvas = dynamic(() => import("./RacingCanvas"), { ssr: false });

const QUALITIES: { id: RacingQuality; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

const CAR_KEY = "racing.car";
const QUALITY_KEY = "racing.quality";

const CAR_PREV_BTN = QUALITIES.length;
const CAR_NEXT_BTN = QUALITIES.length + 1;
const START_BTN = QUALITIES.length + 2;
const STORE_BTN = QUALITIES.length + 3;

const PAD_CONTROLS: [string, string][] = [
  ["RT · A", "Accelerate"],
  ["LT", "Brake · reverse"],
  ["Left stick", "Steer"],
  ["B", "Handbrake / drift"],
  ["Right stick", "Look around"],
  ["Y", "Cycle camera"],
  ["X", "Horn"],
  ["RB", "Reset car"],
  ["Start", "Pause"],
];

const KEY_CONTROLS: [string, string][] = [
  ["W / ↑", "Accelerate"],
  ["S / ↓", "Brake · reverse"],
  ["A · D", "Steer"],
  ["Space", "Handbrake / drift"],
  ["C", "Cycle camera"],
  ["K · B", "Horn"],
  ["R", "Reset car"],
  ["P / Esc", "Pause"],
  ["M", "Mute"],
];

const EMPTY_HUD: HudFrame = {
  speedKph: 0,
  surface: "road",
  airborne: false,
  boost: false,
  tokens: 0,
  tokenTotal: 0,
  drift: 0,
  inZone: false,
};

export default function RacingShell() {
  const router = useRouter();
  const engineRef = useRef<RacingEngine | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const startOverlayRef = useRef<HTMLDivElement | null>(null);
  const pauseOverlayRef = useRef<HTMLDivElement | null>(null);
  const carIdxRef = useRef(3);
  const qualityRef = useRef<RacingQuality>("high");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, label: "Loading engine…" });
  const [quality, setQuality] = useState<RacingQuality>("high");
  const [padConnected, setPadConnected] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [carIdx, setCarIdx] = useState(3);
  const [hud, setHud] = useState<HudFrame>(EMPTY_HUD);
  const [toast, setToast] = useState<string | null>(null);

  // Restore saved selections (client only).
  useEffect(() => {
    let raf = 0;
    try {
      const saved = window.localStorage.getItem(CAR_KEY);
      const i = saved ? CAR_CATALOG.findIndex((c) => c.id === saved) : -1;
      const q = window.localStorage.getItem(QUALITY_KEY) as RacingQuality | null;
      raf = requestAnimationFrame(() => {
        if (i >= 0) {
          carIdxRef.current = i;
          setCarIdx(i);
        }
        if (q === "low" || q === "medium" || q === "high") {
          qualityRef.current = q;
          setQuality(q);
          engineRef.current?.setQuality(q);
        }
      });
    } catch {
      // private mode — defaults are fine
    }
    return () => cancelAnimationFrame(raf);
  }, []);

  const cycleCar = useCallback((dir: 1 | -1) => {
    const next = (carIdxRef.current + dir + CAR_CATALOG.length) % CAR_CATALOG.length;
    carIdxRef.current = next;
    setCarIdx(next);
    const id = CAR_CATALOG[next].id;
    void engineRef.current?.setCar(id);
    try {
      window.localStorage.setItem(CAR_KEY, id);
    } catch {
      // non-fatal
    }
  }, []);

  // Stable engine callbacks -------------------------------------------------
  const onEngine = useCallback((engine: RacingEngine) => {
    engineRef.current = engine;
    engine.setQuality(qualityRef.current);
    engine.setMinimapCanvas(minimapRef.current);
    // adopt the saved car before the world finishes building
    void engine.setCar(CAR_CATALOG[carIdxRef.current].id, true);
  }, []);
  const onProgress = useCallback((pct: number, label: string) => setProgress({ pct: Math.round(pct), label }), []);
  const onReady = useCallback(() => {
    setReady(true);
    setFocusIdx(START_BTN);
  }, []);
  const onPauseChange = useCallback((p: boolean) => setPaused(p), []);
  const onPadChange = useCallback((c: boolean) => setPadConnected(c), []);
  const onHud = useCallback((h: HudFrame) => setHud(h), []);
  const onToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const changeQuality = useCallback((q: RacingQuality) => {
    qualityRef.current = q;
    setQuality(q);
    engineRef.current?.setQuality(q);
    try {
      window.localStorage.setItem(QUALITY_KEY, q);
    } catch {
      // non-fatal
    }
  }, []);

  const overlayButtons = useMemo<{ label: string; disabled?: boolean; action: string }[]>(() => {
    if (!started) {
      return [
        ...QUALITIES.map((q) => ({ label: q.label, action: `quality:${q.id}` })),
        { label: "◀", action: "car:prev" },
        { label: "▶", action: "car:next" },
        { label: ready ? "Start Engine" : "Preparing…", disabled: !ready, action: "start" },
        { label: "← Back to Store", action: "store" },
      ];
    }
    return [
      { label: "Resume", action: "resume" },
      { label: "Reset Car", action: "reset" },
      { label: "Quit to Store", action: "store" },
    ];
  }, [started, ready]);

  const activate = useCallback(
    (action: string) => {
      if (action.startsWith("quality:")) return changeQuality(action.slice(8) as RacingQuality);
      switch (action) {
        case "car:prev":
          return cycleCar(-1);
        case "car:next":
          return cycleCar(1);
        case "start":
          if (ready && !started) {
            setStarted(true);
            engineRef.current?.start();
          }
          return;
        case "resume":
          engineRef.current?.setPaused(false);
          return;
        case "reset":
          engineRef.current?.resetCar();
          engineRef.current?.setPaused(false);
          return;
        case "store":
          router.push("/");
      }
    },
    [changeQuality, cycleCar, ready, started, router],
  );

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

  useEffect(() => {
    if (!overlayVisible) return;
    const container = paused ? pauseOverlayRef.current : started ? null : startOverlayRef.current;
    const el = container?.querySelector<HTMLElement>(`[data-mb="${clampedIdx}"]`);
    el?.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
  }, [clampedIdx, overlayVisible, started, paused]);

  const ringCls = (i: number) =>
    clampedIdx === i && overlayVisible ? "outline outline-2 outline-offset-2 outline-sky-300" : "outline-none";

  const car = CAR_CATALOG[carIdx];
  const speedPct = Math.min(1, hud.speedKph / 260);

  return (
    <div className="relative h-dvh w-full select-none overflow-hidden bg-[#090b10] text-[#eef2f8]">
      <RacingCanvas
        onEngine={onEngine}
        onProgress={onProgress}
        onReady={onReady}
        onPauseChange={onPauseChange}
        onPadChange={onPadChange}
        onHud={onHud}
        onToast={onToast}
      />

      {/* ---------------- HUD ---------------- */}
      {started && (
        <>
          <div className="pointer-events-none absolute bottom-5 right-5 z-20 text-right">
            <div className="font-mono text-6xl font-black leading-none tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,.6)]">
              {hud.speedKph}
            </div>
            <div className="mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-white/60">km/h</div>
            <div className="mt-2 ml-auto h-1.5 w-52 overflow-hidden rounded bg-white/15">
              <div
                className={`h-full rounded transition-[width] duration-100 ${hud.boost ? "bg-sky-300" : "bg-gradient-to-r from-lime-300 to-amber-300"}`}
                style={{ width: `${speedPct * 100}%` }}
              />
            </div>
            {hud.surface === "grass" && (
              <div className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Off road</div>
            )}
          </div>

          <div className="pointer-events-none absolute left-5 top-5 z-20 space-y-2">
            <div className="rounded-xl border border-white/10 bg-black/45 px-3.5 py-2 font-mono text-xs backdrop-blur">
              <span className="text-amber-300">◎</span> Tokens{" "}
              <span className="font-bold text-white">
                {hud.tokens}/{hud.tokenTotal}
              </span>
            </div>
            {hud.inZone && (
              <div className="rounded-xl border border-orange-300/40 bg-orange-500/15 px-3.5 py-2 font-mono text-xs backdrop-blur">
                <span className="text-orange-300">Drift zone</span>{" "}
                <span className="font-bold text-white">{hud.drift}</span>
              </div>
            )}
          </div>

          {toast && (
            <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-black/65 px-5 py-2 font-mono text-sm font-bold text-white backdrop-blur">
              {toast}
            </div>
          )}
        </>
      )}
      {/* mounted from the start so the engine's reference never goes stale */}
      <canvas
        ref={minimapRef}
        className={`pointer-events-none absolute right-5 top-5 z-20 w-44 rounded-xl border border-white/15 bg-black/50 shadow-lg sm:w-56 ${started ? "" : "hidden"}`}
      />

      {/* ---------------- Start overlay ---------------- */}
      {!started && (
        <div
          ref={startOverlayRef}
          className="absolute inset-0 z-40 overflow-y-auto bg-[linear-gradient(160deg,rgba(7,10,18,.78)_0%,rgba(10,16,28,.55)_50%,rgba(5,7,12,.82)_100%)]"
        >
          <div className="flex min-h-full items-center justify-center p-5">
            <div className="w-full max-w-4xl rounded-3xl border border-white/15 bg-[#0e1420]/80 p-8 shadow-[0_40px_100px_rgba(0,0,0,.7)] backdrop-blur-xl sm:p-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/40 bg-sky-300/10 px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">
                🏁 Free Roam
              </span>
              <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
                Kenney{" "}
                <span className="bg-gradient-to-br from-sky-300 to-lime-300 bg-clip-text text-transparent">Circuit</span>
              </h1>
              <p className="mt-3.5 max-w-xl text-sm leading-relaxed text-white/70">
                Open-road racing on a hand-built circuit: a bridge crossover, a jump, boost pads, a pit lane and a drift
                lot. Hit speed traps, bank drift scores and collect every token. Online rooms are coming next.
              </p>
              <div className="mt-4">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${
                    padConnected ? "border-lime-300/40 bg-lime-300/10 text-lime-200" : "border-white/15 bg-white/5 text-white/50"
                  }`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${padConnected ? "bg-lime-300" : "bg-white/30"}`} />
                  {padConnected ? "Gamepad connected" : "No gamepad — press any pad button"}
                </span>
              </div>

              <div className="mt-7 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">Car</p>
                  <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-black/25">
                    <button
                      data-mb={CAR_PREV_BTN}
                      aria-label="Previous car"
                      onFocus={() => setFocusIdx(CAR_PREV_BTN)}
                      onClick={() => {
                        activate("car:prev");
                        padMenuRumble("move");
                      }}
                      className={`px-4 py-3 font-mono text-[13px] font-bold text-white/55 transition hover:bg-white/10 hover:text-white ${ringCls(CAR_PREV_BTN)}`}
                    >
                      ◀
                    </button>
                    <span className={`flex flex-1 items-center justify-center px-5 py-3 font-mono text-[13px] font-bold ${car.accent}`}>
                      {car.label}
                    </span>
                    <button
                      data-mb={CAR_NEXT_BTN}
                      aria-label="Next car"
                      onFocus={() => setFocusIdx(CAR_NEXT_BTN)}
                      onClick={() => {
                        activate("car:next");
                        padMenuRumble("move");
                      }}
                      className={`px-4 py-3 font-mono text-[13px] font-bold text-white/55 transition hover:bg-white/10 hover:text-white ${ringCls(CAR_NEXT_BTN)}`}
                    >
                      ▶
                    </button>
                  </div>
                  <p className="mt-2 text-[12px] text-white/55">{car.blurb}</p>
                </div>
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">Graphics quality</p>
                  <div className="flex overflow-hidden rounded-xl border border-white/10 bg-black/25">
                    {QUALITIES.map((q, i) => (
                      <button
                        key={q.id}
                        data-mb={i}
                        onFocus={() => setFocusIdx(i)}
                        onClick={() => {
                          activate(`quality:${q.id}`);
                          padMenuRumble("move");
                        }}
                        className={`flex-1 px-5 py-3 font-mono text-[13px] font-bold transition ${ringCls(i)} ${
                          quality === q.id
                            ? "bg-gradient-to-b from-sky-400 to-sky-600 text-white"
                            : "text-white/55 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
                <button
                  data-mb={STORE_BTN}
                  onFocus={() => setFocusIdx(STORE_BTN)}
                  onClick={() => activate("store")}
                  className={`rounded-xl border border-white/15 px-5 py-3 font-mono text-[12px] font-bold text-white/70 transition hover:bg-white/10 ${ringCls(STORE_BTN)}`}
                >
                  ← Back to Store
                </button>
                <button
                  data-mb={START_BTN}
                  disabled={!ready}
                  onFocus={() => setFocusIdx(START_BTN)}
                  onClick={() => activate("start")}
                  className={`rounded-2xl px-10 py-4 font-mono text-[16px] font-black uppercase tracking-wide transition ${ringCls(START_BTN)} ${
                    ready
                      ? "bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-[0_12px_36px_rgba(56,189,248,.4)] hover:scale-[1.02]"
                      : "cursor-progress bg-white/10 text-white/40"
                  }`}
                >
                  {ready ? "Start Engine" : `Preparing… ${progress.pct}%`}
                </button>
              </div>

              {!ready && (
                <div className="mt-5">
                  <div className="h-1 overflow-hidden rounded bg-white/10">
                    <div
                      className="h-full rounded bg-gradient-to-r from-sky-400 to-lime-300 transition-[width] duration-300"
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                  <p className="mt-2 font-mono text-[11px] tracking-wide text-white/45">{progress.label}</p>
                </div>
              )}

              <div className="mt-8 grid gap-x-6 gap-y-5 border-t border-white/10 pt-6 sm:grid-cols-2">
                <ControlList title="🎮 Gamepad" rows={PAD_CONTROLS} />
                <ControlList title="⌨ Keyboard" rows={KEY_CONTROLS} />
              </div>
              <p className="mt-6 text-[10px] text-white/30">Models: Kenney Racing Kit (CC0).</p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Pause overlay ---------------- */}
      {started && paused && (
        <div
          ref={pauseOverlayRef}
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm"
        >
          <div className="w-72 rounded-2xl border border-white/15 bg-[#0e1420]/90 p-6 text-center">
            <p className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.3em] text-sky-200">Paused</p>
            <div className="flex flex-col gap-2.5">
              {overlayButtons.map((b, i) => (
                <button
                  key={b.action}
                  data-mb={i}
                  onFocus={() => setFocusIdx(i)}
                  onClick={() => activate(b.action)}
                  className={`rounded-xl border border-white/15 px-4 py-3 font-mono text-[13px] font-bold transition hover:bg-white/10 ${ringCls(i)}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ControlList({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-sky-200">{title}</p>
      <ul className="space-y-1 text-[12px] text-white/60">
        {rows.map(([keys, action]) => (
          <li key={keys} className="flex justify-between gap-3">
            <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-white">
              {keys}
            </kbd>
            <span className="text-right">{action}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
