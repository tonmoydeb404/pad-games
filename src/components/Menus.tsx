"use client";

/**
 * Menu overlays: start, pause, game over, settings, toasts. Entirely
 * gamepad-navigable — the shell moves `focusIndex` from input events; mouse
 * and touch work too.
 */

import type { ReactNode } from "react";
import type { Settings, ToastEvent } from "@/game/core/types";

export interface MenuItem {
  label: string;
  hint?: string;
  value?: () => ReactNode;
  onSelect: () => void;
}

export function MenuBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="animate-fade-in absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-b from-slate-950/70 via-slate-950/55 to-slate-950/75 p-4 backdrop-blur-[2px]">
      {children}
    </div>
  );
}

export function MenuCard({
  title,
  subtitle,
  items,
  focusIndex,
  onFocus,
  footer,
}: {
  title: string;
  subtitle?: string;
  items: MenuItem[];
  focusIndex: number;
  onFocus: (index: number) => void;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl">
      <h2 className="font-mono text-2xl font-black uppercase tracking-widest text-white">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-white/60">{subtitle}</p>}
      <div className="mt-5 flex flex-col gap-2">
        {items.map((item, i) => {
          const focused = i === focusIndex;
          return (
            <button
              key={item.label}
              type="button"
              onMouseEnter={() => onFocus(i)}
              onClick={item.onSelect}
              className={`group flex items-center justify-between rounded-xl px-4 py-3 text-left transition-colors ${
                focused
                  ? "bg-teal-400/15 ring-2 ring-teal-300/80"
                  : "ring-1 ring-transparent hover:bg-white/5"
              }`}
            >
              <span
                className={`font-mono text-sm font-bold uppercase tracking-wider ${
                  focused ? "text-teal-100" : "text-white/80"
                }`}
              >
                {item.label}
              </span>
              <span className="ml-3 flex items-center gap-2 text-xs text-white/50">
                {item.value ? (
                  <span className="font-mono font-semibold text-amber-300">
                    {item.value()}
                  </span>
                ) : null}
                {item.hint}
                {focused && <span aria-hidden>▸</span>}
              </span>
            </button>
          );
        })}
      </div>
      {footer && <div className="mt-5 border-t border-white/10 pt-3">{footer}</div>}
    </div>
  );
}

export function StartMenu(props: {
  focusIndex: number;
  onFocus: (i: number) => void;
  items: MenuItem[];
  padConnected: boolean;
  dailyLabel: string;
}) {
  return (
    <MenuBackdrop>
      <div className="flex w-full max-w-4xl flex-col items-center gap-8 md:flex-row md:items-center md:justify-between">
        <div className="text-center md:text-left">
          <h1 className="bg-gradient-to-br from-amber-200 via-orange-300 to-teal-300 bg-clip-text font-mono text-5xl font-black uppercase tracking-tight text-transparent sm:text-6xl">
            Dune
            <br />
            Glide
          </h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/65">
            Endless dune sliding. Charge your jumps, spin, stick the landing,
            chain the combo.
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-widest text-teal-200/80">
            {props.padConnected
              ? "Controller ready"
              : "Press any button or key"}
          </p>
          <p className="mt-1 font-mono text-[11px] text-white/40">
            Daily seed · {props.dailyLabel}
          </p>
        </div>
        <MenuCard
          title="Ride"
          items={props.items}
          focusIndex={props.focusIndex}
          onFocus={props.onFocus}
          footer={
            <p className="font-mono text-[11px] leading-relaxed text-white/45">
              A/Space hold jump · ←→ spin · Shift boost · Start/Esc pause
            </p>
          }
        />
      </div>
    </MenuBackdrop>
  );
}

export function PauseMenu(props: {
  focusIndex: number;
  onFocus: (i: number) => void;
  items: MenuItem[];
}) {
  return (
    <MenuBackdrop>
      <MenuCard
        title="Paused"
        subtitle="The dunes wait for no one. Except now."
        items={props.items}
        focusIndex={props.focusIndex}
        onFocus={props.onFocus}
      />
    </MenuBackdrop>
  );
}

export function GameOverMenu(props: {
  focusIndex: number;
  onFocus: (i: number) => void;
  items: MenuItem[];
  summary: {
    score: number;
    distance: number;
    duration: number;
    maxCombo: number;
    spins: number;
    cleanLandings: number;
  };
  submitState: "idle" | "saving" | "saved" | "error";
  submitError?: string;
  backend: "local" | "supabase";
  name: string;
  onNameChange: (name: string) => void;
}) {
  const stats: [string, string][] = [
    ["Distance", `${props.summary.distance.toLocaleString()} m`],
    ["Run time", `${props.summary.duration.toFixed(1)} s`],
    ["Best combo", `×${props.summary.maxCombo}`],
    ["Spins", `${props.summary.spins}`],
    ["Clean landings", `${props.summary.cleanLandings}`],
  ];
  return (
    <MenuBackdrop>
      <div className="animate-menu-in w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/80 p-6 shadow-2xl">
        <h2 className="font-mono text-2xl font-black uppercase tracking-widest text-amber-200">
          Run over
        </h2>
        <div className="mt-2 font-mono text-5xl font-black text-white">
          {props.summary.score.toLocaleString()}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
          {stats.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <dt className="text-xs uppercase tracking-wider text-white/50">{k}</dt>
              <dd className="font-mono text-sm font-semibold text-white/90">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex items-center gap-2">
          <label
            htmlFor="rider-name"
            className="text-xs uppercase tracking-wider text-white/50"
          >
            Name
          </label>
          <input
            id="rider-name"
            value={props.name}
            maxLength={24}
            onChange={(e) => props.onNameChange(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-sm text-white outline-none focus:border-teal-300/60"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-white/40">
          {props.submitState === "saving" && "Saving score…"}
          {props.submitState === "saved" &&
            (props.backend === "supabase"
              ? "Saved to the online leaderboard."
              : "Saved to this device's leaderboard.")}
          {props.submitState === "error" &&
            `Couldn't save${props.submitError ? `: ${props.submitError}` : ""}.`}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {props.items.map((item, i) => {
            const focused = i === props.focusIndex;
            return (
              <button
                key={item.label}
                type="button"
                onMouseEnter={() => props.onFocus(i)}
                onClick={item.onSelect}
                className={`flex items-center justify-between rounded-xl px-4 py-3 text-left transition-colors ${
                  focused
                    ? "bg-teal-400/15 ring-2 ring-teal-300/80"
                    : "ring-1 ring-transparent hover:bg-white/5"
                }`}
              >
                <span
                  className={`font-mono text-sm font-bold uppercase tracking-wider ${
                    focused ? "text-teal-100" : "text-white/80"
                  }`}
                >
                  {item.label}
                </span>
                {item.hint}
              </button>
            );
          })}
        </div>
      </div>
    </MenuBackdrop>
  );
}

export function SettingsPanel(props: {
  focusIndex: number;
  onFocus: (i: number) => void;
  items: MenuItem[];
  settings: Settings;
  onNameChange: (name: string) => void;
}) {
  return (
    <MenuBackdrop>
      <MenuCard
        title="Settings"
        subtitle="A/D or ←/→ to change · confirm to toggle"
        items={props.items}
        focusIndex={props.focusIndex}
        onFocus={props.onFocus}
        footer={
          <div className="flex items-center gap-2">
            <label
              htmlFor="settings-name"
              className="shrink-0 text-xs uppercase tracking-wider text-white/50"
            >
              Name
            </label>
            <input
              id="settings-name"
              value={props.settings.name}
              maxLength={24}
              onChange={(e) => props.onNameChange(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-sm text-white outline-none focus:border-teal-300/60"
            />
          </div>
        }
      />
    </MenuBackdrop>
  );
}

export function Toasts({ toasts }: { toasts: ToastEvent[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex flex-col items-center gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toast rounded-full px-4 py-1.5 font-mono text-sm font-bold shadow-lg backdrop-blur-sm ${
            t.tone === "bad"
              ? "bg-red-500/25 text-red-100 ring-1 ring-red-300/40"
              : t.tone === "info"
                ? "bg-slate-900/60 text-slate-100 ring-1 ring-white/20"
                : "bg-teal-400/20 text-teal-100 ring-1 ring-teal-300/40"
          }`}
        >
          {t.text}
          {t.sub ? <span className="ml-2 font-semibold text-white/90">{t.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function BootOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-teal-300" />
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/50">
        Loading the dunes
      </p>
    </div>
  );
}
