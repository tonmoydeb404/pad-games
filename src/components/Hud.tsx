"use client";

import type { HudData } from "@/game/core/types";
import type { ToastEvent } from "@/game/core/types";

/** Combo pill heats up as the multiplier climbs. */
function comboClasses(multiplier: number): string {
  if (multiplier >= 6)
    return "bg-rose-500/90 text-rose-50 shadow-[0_0_16px_rgba(244,63,94,0.55)]";
  if (multiplier >= 4) return "bg-orange-400/90 text-orange-950 shadow";
  return "bg-amber-400/90 text-amber-950 shadow";
}

export function Hud({
  hud,
  toasts,
  showFps,
  scale,
}: {
  hud: HudData;
  toasts: ToastEvent[];
  showFps: boolean;
  scale: number;
}) {
  const showAir = !hud.grounded && hud.airTime > 0.3;
  const segments = Array.from({ length: 12 }, (_, i) => hud.boost * 12 >= i + 0.5);
  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-[max(1.5rem,env(safe-area-inset-top))]"
      style={{ zoom: scale }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-3xl font-bold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-4xl">
            {hud.score.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {hud.multiplier > 1 && (
              <div
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-bold ${comboClasses(hud.multiplier)}`}
              >
                COMBO ×{hud.multiplier}
              </div>
            )}
            {hud.chain > 0 && (
              <div className="inline-flex items-center rounded-full bg-slate-950/55 px-2.5 py-0.5 font-mono text-xs font-semibold text-amber-200 ring-1 ring-amber-300/30 backdrop-blur-sm">
                CHAIN +{hud.chain.toLocaleString()}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-semibold text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] sm:text-xl">
            {hud.distance.toLocaleString()} m
          </div>
          <div className="font-mono text-sm text-white/70">
            {hud.speedKph} km/h
          </div>
          {showFps && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-white/50">
              {hud.fps} fps
            </div>
          )}
        </div>
      </div>

      {/* storm wall closing in */}
      {hud.stormMeters !== null && hud.stormMeters < 90 && (
        <div className="absolute left-1/2 top-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))] -translate-x-1/2">
          <div className="animate-pulse rounded-full bg-orange-950/60 px-3.5 py-1 text-center font-mono text-sm font-bold text-orange-200 ring-1 ring-orange-400/40 backdrop-blur-sm">
            WALL {hud.stormMeters}m
          </div>
        </div>
      )}

      {/* live trick readout while airborne */}
      {showAir && (
        <div className="absolute left-1/2 top-[max(6rem,calc(env(safe-area-inset-top)+5rem))] -translate-x-1/2">
          <div className="rounded-full bg-slate-950/55 px-3.5 py-1 text-center font-mono text-sm font-bold text-teal-200 ring-1 ring-teal-300/30 backdrop-blur-sm">
            AIR {hud.airTime.toFixed(1)}s · {hud.spinDeg}°
          </div>
        </div>
      )}

      {/* trick toasts */}
      <div className="absolute inset-x-0 top-24 flex flex-col items-center gap-1.5 sm:top-28">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast rounded-full px-4 py-1.5 text-center font-mono text-sm font-bold shadow-lg backdrop-blur-sm ${
              t.tone === "bad"
                ? "bg-red-500/25 text-red-100 ring-1 ring-red-300/40"
                : t.tone === "info"
                  ? "bg-slate-900/50 text-slate-100 ring-1 ring-white/20"
                  : "bg-teal-400/20 text-teal-100 ring-1 ring-teal-300/40"
            }`}
          >
            {t.text}
            {t.sub ? <span className="ml-2 font-semibold text-white/90">{t.sub}</span> : null}
          </div>
        ))}
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="w-40 sm:w-52">
          {/* goal card: level + the three active goals */}
          {hud.goals.length > 0 && (
            <div className="mb-2 rounded-lg bg-slate-950/50 px-2.5 py-2 ring-1 ring-white/10 backdrop-blur-sm">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-white/50">
                Level {hud.level} goals
              </div>
              <div className="flex flex-col gap-1">
                {hud.goals.map((g, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span
                      className={`w-3 text-center font-mono text-[10px] ${g.done ? "text-teal-300" : "text-white/40"}`}
                    >
                      {g.done ? "✓" : "○"}
                    </span>
                    <span
                      className={`flex-1 truncate font-mono text-[10px] ${g.done ? "text-teal-200/80 line-through" : "text-white/75"}`}
                      title={g.label}
                    >
                      {g.label}
                    </span>
                    <span className="font-mono text-[10px] text-white/50">
                      {Math.min(g.progress, g.target)}/{g.target}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/60">
              Boost
            </span>
            <span className="font-mono text-[10px] text-white/40">
              {Math.round(hud.boost * 12)}/12
            </span>
          </div>
          <div className="flex h-2 gap-[2px]">
            {segments.map((on, i) => (
              <div
                key={i}
                className={`h-full flex-1 rounded-[2px] transition-colors duration-100 ${
                  on
                    ? "bg-gradient-to-t from-teal-400 to-amber-300 shadow-[0_0_6px_rgba(53,208,186,0.5)]"
                    : "bg-white/15"
                }`}
              />
            ))}
          </div>
        </div>
        <div
          className={`h-2 w-2 rounded-full ${hud.padConnected ? "bg-teal-300 shadow-[0_0_8px_rgba(53,208,186,0.9)]" : "bg-white/20"}`}
          title={hud.padConnected ? "Controller connected" : "No controller"}
        />
      </div>
    </div>
  );
}
