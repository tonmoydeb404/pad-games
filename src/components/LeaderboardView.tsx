"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { backendKind, getScores, type ScoreEntry } from "@/lib/supabase";

type Tab = "daily" | "free";

interface BoardData {
  /** Which tab the data belongs to; null while the first fetch is in flight. */
  tab: Tab | null;
  entries: ScoreEntry[];
  error: string | null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function LeaderboardView() {
  const [tab, setTab] = useState<Tab>("daily");
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<BoardData>({
    tab: null,
    entries: [],
    error: null,
  });
  const loading = data.tab === null || data.tab !== tab;

  useEffect(() => {
    let alive = true;
    getScores(tab)
      .then((entries) => {
        if (alive) setData({ tab, entries, error: null });
      })
      .catch((err: unknown) => {
        if (alive) {
          setData({
            tab,
            entries: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [tab, reloadKey]);

  return (
    <main className="relative min-h-dvh flex-1">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#3d2a52_0%,#17203f_45%,#070b1c_100%)]" />
      <div className="relative mx-auto w-full max-w-2xl px-6 py-16">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-mono text-3xl font-black uppercase tracking-tight text-amber-200">
            Leaderboard
          </h1>
          <Link
            href="/play"
            className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-amber-950 transition hover:brightness-110"
          >
            Ride
          </Link>
        </div>
        <p className="mt-2 text-sm text-white/55">
          {backendKind === "supabase"
            ? "Scores are stored online via Supabase."
            : "No Supabase configured — scores are stored on this device. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to go online."}
        </p>

        <div className="mt-6 flex items-center gap-3">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
            {(["daily", "free"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-widest transition ${
                  tab === t
                    ? "bg-teal-400/20 text-teal-100 ring-1 ring-teal-300/50"
                    : "text-white/55 hover:text-white/85"
                }`}
              >
                {t === "daily" ? "Daily seed" : "Free ride"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-lg border border-white/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-white/55 transition hover:bg-white/5 hover:text-white/85"
          >
            Refresh
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          {loading && (
            <p className="px-5 py-8 text-center font-mono text-xs uppercase tracking-widest text-white/45">
              Loading…
            </p>
          )}
          {!loading && data.error && (
            <p className="px-5 py-8 text-center text-sm text-red-300">
              Couldn&apos;t load scores: {data.error}
            </p>
          )}
          {!loading && !data.error && data.entries.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-white/50">
              No scores yet — be the first to carve this seed.
            </p>
          )}
          {!loading &&
            !data.error &&
            data.entries.map((e, i) => (
              <div
                key={e.id}
                className={`flex items-center gap-4 px-5 py-3 ${
                  i % 2 === 0 ? "bg-white/[0.04]" : ""
                }`}
              >
                <span
                  className={`w-8 text-right font-mono text-sm font-bold ${
                    i === 0
                      ? "text-amber-300"
                      : i === 1
                        ? "text-slate-200"
                        : i === 2
                          ? "text-orange-300/90"
                          : "text-white/40"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-white/90">
                  {e.name}
                </span>
                <span className="hidden font-mono text-xs text-white/45 sm:inline">
                  {e.distance.toLocaleString()} m · {timeAgo(e.created_at)}
                </span>
                <span className="font-mono text-sm font-bold text-teal-200">
                  {e.score.toLocaleString()}
                </span>
              </div>
            ))}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-white/35">
          Basic plausibility checks are applied on submit (score vs distance
          and run duration). Real anti-cheat is out of scope — see the README
          for server-side notes.
        </p>
      </div>
    </main>
  );
}
