"use client";

/**
 * Live physics-tuning sliders (plan Phase 1 risk mitigation: tune feel with
 * debug sliders for gravity, friction and boost). Mutates the params
 * singleton directly; the simulation reads it every step.
 */

import { useState } from "react";
import { defaultParams, params, resetParams } from "@/game/core/params";

type NumericParamKey = {
  [K in keyof typeof defaultParams]: (typeof defaultParams)[K] extends number
    ? K
    : never;
}[keyof typeof defaultParams];

const SLIDERS: { key: NumericParamKey; label: string; min: number; max: number; step: number }[] = [
  { key: "gravity", label: "Gravity", min: 800, max: 4000, step: 20 },
  { key: "frictionMu", label: "Sand friction", min: 0, max: 0.08, step: 0.001 },
  { key: "quadDrag", label: "Drag", min: 0, max: 0.0006, step: 0.00001 },
  { key: "baseSlope", label: "Base slope", min: 0.05, max: 0.35, step: 0.005 },
  { key: "maxSpeed", label: "Max speed", min: 800, max: 2400, step: 10 },
  { key: "jumpMin", label: "Jump min", min: 200, max: 800, step: 10 },
  { key: "jumpMax", label: "Jump max", min: 500, max: 1600, step: 10 },
  { key: "spinRate", label: "Spin rate", min: 4, max: 16, step: 0.1 },
  { key: "boostAccel", label: "Boost", min: 200, max: 1200, step: 10 },
  { key: "doubleJumpStrength", label: "2nd hop", min: 0.1, max: 0.8, step: 0.01 },
  { key: "saltSpeedMult", label: "Salt speed", min: 1, max: 2, step: 0.05 },
  { key: "slowmoMinScale", label: "Slow-mo", min: 0.15, max: 1, step: 0.05 },
];

export default function DebugPanel({ open }: { open: boolean }) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(SLIDERS.map((s) => [s.key, params[s.key]])),
  );

  if (!open) return null;

  return (
    <div className="absolute bottom-20 right-4 z-20 w-64 rounded-xl border border-white/10 bg-slate-950/85 p-4 font-mono text-xs text-white/80 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-teal-300">
          Tune · live
        </span>
        <button
          type="button"
          onClick={() => {
            resetParams();
            setValues(Object.fromEntries(SLIDERS.map((s) => [s.key, params[s.key]])));
          }}
          className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider hover:bg-white/20"
        >
          Reset
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {SLIDERS.map((s) => (
          <label key={s.key} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[11px] text-white/60">{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={values[s.key]}
              onChange={(e) => {
                const v = Number(e.target.value);
                (params as unknown as Record<string, number>)[s.key] = v;
                setValues((prev) => ({ ...prev, [s.key]: v }));
              }}
              className="h-1 w-full accent-teal-300"
            />
            <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-white/50">
              {values[s.key].toFixed(3)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
