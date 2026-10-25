"use client";

/**
 * Phase 0 deliverable: input tester. Shows every connected gamepad with live
 * axes/buttons, verifies the mapping used by the game, and fires test rumbles
 * (weak / strong / dual) so haptics can be confirmed on your pad.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface PadView {
  index: number;
  id: string;
  mapping: string;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
}

const BUTTON_NAMES: Record<number, string> = {
  0: "A/Cross",
  1: "B/Circle",
  2: "X/Square",
  3: "Y/Triangle",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "Back",
  9: "Start",
  10: "L3",
  11: "R3",
  12: "D-Up",
  13: "D-Down",
  14: "D-Left",
  15: "D-Right",
};

export default function InputTestView() {
  const [pads, setPads] = useState<PadView[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [rumbleNote, setRumbleNote] = useState<string | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (typeof navigator.getGamepads !== "function") return;
      const list = [...navigator.getGamepads()]
        .filter((gp): gp is Gamepad => gp !== null && gp.connected)
        .map((gp) => ({
          index: gp.index,
          id: gp.id,
          mapping: gp.mapping,
          axes: [...gp.axes],
          buttons: gp.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
        }));
      setPads(list);
    };
    rafRef.current = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      setKeys((prev) => [...prev.slice(-7), e.code]);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const rumble = async (kind: "weak" | "strong" | "dual") => {
    const gp = [...navigator.getGamepads()].find((g) => g !== null);
    if (!gp) {
      setRumbleNote("No gamepad connected — press any button on your pad first.");
      return;
    }
    const act = (
      gp as Gamepad & {
        vibrationActuator?: { playEffect: (t: string, o: object) => Promise<string> };
      }
    ).vibrationActuator;
    if (!act) {
      setRumbleNote("This pad/browser has no vibrationActuator (rumble is optional).");
      return;
    }
    try {
      await act.playEffect("dual-rumble", {
        startDelay: 0,
        duration: 350,
        weakMagnitude: kind === "strong" ? 0 : 1,
        strongMagnitude: kind === "weak" ? 0 : 1,
      });
      setRumbleNote(`Fired ${kind} rumble on "${gp.id.slice(0, 40)}"`);
    } catch (err) {
      setRumbleNote(`Rumble failed: ${String(err)}`);
    }
  };

  return (
    <main className="relative min-h-dvh flex-1">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#3d2a52_0%,#17203f_45%,#070b1c_100%)]" />
      <div className="relative mx-auto w-full max-w-3xl px-6 py-16">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-mono text-3xl font-black uppercase tracking-tight text-amber-200">
            Input test
          </h1>
          <Link
            href="/play"
            className="rounded-xl border border-white/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-white/80 transition hover:bg-white/5"
          >
            Back
          </Link>
        </div>
        <p className="mt-2 text-sm text-white/55">
          Browsers only expose a gamepad after the first button press — press
          any button on your pad. Expected mapping: A = jump/confirm, X·RB =
          boost, LB·LT·RT·stick X = spin, Start = pause.
        </p>

        {pads.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-sm text-white/45">
            No gamepad detected. Connect one and press a button, or use the
            keyboard (keys shown below).
          </div>
        )}

        {pads.map((pad) => (
          <div
            key={pad.index}
            className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-mono text-sm font-bold text-teal-200">
                Pad #{pad.index}
              </h2>
              <span className="text-xs text-white/45">{pad.mapping}</span>
            </div>
            <p className="mt-1 truncate text-xs text-white/60">{pad.id}</p>

            <h3 className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
              Axes
            </h3>
            <div className="mt-2 flex flex-col gap-1.5">
              {pad.axes.map((v, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-10 font-mono text-[11px] text-white/50">
                    ax{i}
                  </span>
                  <div className="relative h-1.5 flex-1 rounded-full bg-white/10">
                    <div
                      className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-teal-300"
                      style={{ left: `calc(${((v + 1) / 2) * 100}% - 6px)` }}
                    />
                  </div>
                  <span className="w-12 text-right font-mono text-[11px] tabular-nums text-white/50">
                    {v.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <h3 className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
              Buttons
            </h3>
            <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {pad.buttons.map((b, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-2 py-1.5 text-center transition-colors ${
                    b.pressed
                      ? "bg-teal-400/30 ring-1 ring-teal-300"
                      : "bg-white/5 ring-1 ring-white/10"
                  }`}
                  title={`value ${b.value.toFixed(2)}`}
                >
                  <div className="font-mono text-[9px] uppercase tracking-wide text-white/60">
                    {BUTTON_NAMES[i] ?? i}
                  </div>
                  <div className="font-mono text-[10px] tabular-nums text-white/40">
                    {b.value.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-mono text-sm font-bold text-teal-200">Rumble test</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["weak", "strong", "dual"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => void rumble(k)}
                className="rounded-xl border border-white/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-white/80 transition hover:bg-white/10"
              >
                {k}
              </button>
            ))}
          </div>
          {rumbleNote && (
            <p className="mt-3 text-xs text-white/55">{rumbleNote}</p>
          )}
          <p className="mt-2 text-[11px] text-white/35">
            Rumble is optional in Dune Glide — audio and visuals carry the same
            cues when unsupported.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-mono text-sm font-bold text-teal-200">Keyboard</h2>
          <div className="mt-3 flex min-h-9 flex-wrap items-center gap-2">
            {keys.length === 0 && (
              <span className="text-xs text-white/40">Press any key…</span>
            )}
            {keys.map((k, i) => (
              <span
                key={`${k}-${i}`}
                className="rounded-lg bg-white/10 px-2.5 py-1 font-mono text-xs text-white/80"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
