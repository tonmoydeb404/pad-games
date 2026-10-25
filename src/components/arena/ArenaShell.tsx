"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Arena, FeedEntry, HudState } from "@/arena";

const ArenaCanvas = dynamic(() => import("./ArenaCanvas"), { ssr: false });

const SERVER_URL = process.env.NEXT_PUBLIC_ARENA_WS_URL ?? "ws://localhost:2567";

type Status = { state: "connecting" | "connected" | "error" | "disconnected"; message?: string };
type FeedItem = FeedEntry & { id: number };

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function ArenaShell() {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [sensitivity, setSensitivity] = useState(1);

  const [status, setStatus] = useState<Status>({ state: "connecting" });
  const [locked, setLocked] = useState(false);
  const [hud, setHud] = useState<HudState | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [showBoard, setShowBoard] = useState(false);
  const [hitmarker, setHitmarker] = useState<"hit" | "kill" | null>(null);
  const [damageFlash, setDamageFlash] = useState(false);

  const arenaRef = useRef<Arena | null>(null);
  const unsubs = useRef<(() => void)[]>([]);
  const feedId = useRef(0);
  const timers = useRef<number[]>([]);

  const onReady = useCallback((arena: Arena) => {
    arenaRef.current = arena;
    const e = arena.events;
    const later = (fn: () => void, ms: number) => {
      timers.current.push(window.setTimeout(fn, ms));
    };
    unsubs.current = [
      e.on("status", setStatus),
      e.on("hud", setHud),
      e.on("lock", setLocked),
      e.on("scoreboard", setShowBoard),
      e.on("feed", (f) => {
        const id = ++feedId.current;
        setFeed((cur) => [...cur.slice(-4), { ...f, id }]);
        later(() => setFeed((cur) => cur.filter((x) => x.id !== id)), 5000);
      }),
      e.on("hitmarker", (h) => {
        setHitmarker(h.killed ? "kill" : "hit");
        later(() => setHitmarker(null), 150);
      }),
      e.on("damaged", () => {
        setDamageFlash(true);
        later(() => setDamageFlash(false), 200);
      }),
    ];
  }, []);

  useEffect(() => {
    const ts = timers.current;
    return () => {
      unsubs.current.forEach((u) => u());
      ts.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    arenaRef.current?.setSensitivity(0.0022 * sensitivity);
  }, [sensitivity]);

  if (!joined) {
    return (
      <main className="flex min-h-dvh flex-1 items-center justify-center bg-[radial-gradient(100%_80%_at_50%_0%,#1f3a5f_0%,#0a1020_100%)] p-6">
        <form
          className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
          onSubmit={(ev) => {
            ev.preventDefault();
            setJoined(true);
          }}
        >
          <h1 className="font-mono text-4xl font-black uppercase tracking-tight text-sky-200">Arena</h1>
          <p className="text-sm text-white/60">Free-for-all deathmatch. First to 20 kills or highest score at 5:00.</p>
          <input
            autoFocus
            maxLength={16}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nickname"
            className="rounded-lg border border-white/15 bg-black/30 px-4 py-3 font-mono text-white outline-none focus:border-sky-300"
          />
          <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-widest text-white/50">
            Sensitivity {sensitivity.toFixed(1)}×
            <input
              type="range"
              min={0.3}
              max={3}
              step={0.1}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-sky-300 to-blue-400 px-6 py-3 font-mono text-sm font-bold uppercase tracking-widest text-blue-950 transition hover:brightness-110"
          >
            Play
          </button>
          <div className="font-mono text-[11px] leading-relaxed text-white/40">
            WASD move · Space jump · Mouse aim/fire · R reload · 1/2 or wheel switch · Tab scoreboard
          </div>
          <Link href="/" className="text-center font-mono text-xs uppercase tracking-widest text-white/40 hover:text-white/70">
            ← Back
          </Link>
        </form>
      </main>
    );
  }

  const ready = status.state === "connected";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <ArenaCanvas
        onReady={onReady}
        options={{
          serverUrl: SERVER_URL,
          name: name || "Player",
          sensitivity: 0.0022 * sensitivity,
          volume: 0.5,
        }}
      />

      {ready && hud && (
        <>
          {/* crosshair */}
          {hud.alive && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-6 w-6">
                <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-white/90" />
                <span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-white/90" />
                <span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white/90" />
                <span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white/90" />
                {hitmarker && (
                  <span
                    className={`absolute inset-[-6px] rotate-45 border-2 ${
                      hitmarker === "kill" ? "border-red-500" : "border-white"
                    }`}
                  />
                )}
              </div>
            </div>
          )}

          {damageFlash && <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_30px_rgba(220,0,0,0.6)]" />}

          {/* top: timer */}
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <div className="rounded-lg bg-black/40 px-4 py-1 font-mono text-lg font-bold text-white">
              {hud.phase === "intermission" ? "Next round " : ""}
              {fmtTime(hud.timeLeft)}
            </div>
          </div>

          {/* kill feed */}
          <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 font-mono text-sm">
            {feed.map((f) => (
              <div
                key={f.id}
                className={`rounded px-2 py-1 text-white ${f.involvesSelf ? "bg-red-600/70" : "bg-black/50"}`}
              >
                {f.killer} <span className="text-white/60">[{f.weapon}]</span> {f.victim}
              </div>
            ))}
          </div>

          {/* bottom: health + ammo */}
          <div className="pointer-events-none absolute bottom-4 left-4 w-56">
            <div className="h-3 overflow-hidden rounded bg-black/50">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-green-400 transition-[width]"
                style={{ width: `${Math.max(0, hud.hp)}%` }}
              />
            </div>
            <div className="mt-1 font-mono text-2xl font-black text-white">{hud.hp} HP</div>
          </div>
          <div className="pointer-events-none absolute bottom-4 right-4 text-right font-mono text-white">
            <div className="text-xs uppercase tracking-widest text-white/60">{hud.weaponName}</div>
            <div className="text-4xl font-black">
              {hud.ammo}
              <span className="text-lg text-white/50"> / {hud.magSize}</span>
            </div>
          </div>

          {!hud.alive && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 font-mono text-white">
              <div className="text-4xl font-black text-red-400">ELIMINATED</div>
              <div className="text-sm">Respawning in {Math.ceil(hud.respawnIn)}…</div>
            </div>
          )}

          {(showBoard || hud.phase === "intermission") && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-full max-w-lg rounded-xl bg-black/70 p-4 font-mono text-sm text-white">
                <div className="mb-2 text-xs uppercase tracking-widest text-white/50">
                  {hud.phase === "intermission" ? "Round over" : "Scoreboard"}
                </div>
                {hud.rows.map((r, i) => (
                  <div
                    key={r.id}
                    className={`flex justify-between px-2 py-1 ${r.self ? "rounded bg-sky-400/20" : ""}`}
                  >
                    <span>
                      {i + 1}. {r.name}
                    </span>
                    <span>
                      {r.kills} / {r.deaths}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {ready && !locked && (
        <button
          type="button"
          onClick={() => arenaRef.current?.requestLock()}
          className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center bg-black/60 font-mono text-xl font-bold uppercase tracking-widest text-white"
        >
          Click to {hud ? "resume" : "play"}
        </button>
      )}

      {status.state !== "connected" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center font-mono text-white">
          {status.state === "connecting" ? (
            <p className="text-sm uppercase tracking-[0.3em] text-sky-200">Connecting…</p>
          ) : (
            <>
              <p className="text-sm uppercase tracking-[0.3em] text-red-300">
                {status.state === "error" ? "Couldn't connect" : "Disconnected"}
              </p>
              <p className="max-w-md text-xs text-white/60">
                {status.message ?? `Is the game server running at ${SERVER_URL}? Start it with pnpm dev:server.`}
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg border border-white/20 px-4 py-2 text-xs uppercase tracking-widest hover:bg-white/10"
              >
                Retry
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
