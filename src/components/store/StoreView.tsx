"use client";

/**
 * Xbox-style dashboard: a single non-scrolling screen. The background art and
 * the hero block always reflect the focused tile, so moving focus with the
 * d-pad (or hovering with the mouse) previews each game; A launches it.
 * Navigation is spatial (closest focusable in the pressed direction) and
 * focus is mirrored in state to draw a ring that behaves identically in every
 * browser (script-driven .focus() does not reliably trigger :focus-visible).
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GAMES, type GameEntry } from "@/lib/games";
import { padMenuRumble, useGamepadMenu } from "@/lib/useGamepadMenu";

const BG = "#0a0a0f";
const RED = "#e50914";

/** Deterministic Netflix-style "match %" per game. */
function matchScore(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 90 + (h % 10);
}

function Tile({
  game,
  focused,
  onPreview,
  onOpen,
}: {
  game: GameEntry;
  focused: boolean;
  onPreview: () => void;
  onOpen: () => void;
}) {
  return (
    <Link
      href={game.href}
      onClick={onOpen}
      onMouseEnter={onPreview}
      onFocus={onPreview}
      data-card={game.id}
      aria-label={`${game.title} — ${game.tagline}`}
      className={`group relative block aspect-[4/3] w-40 shrink-0 snap-start overflow-hidden rounded-xl outline-none transition duration-200 focus-visible:ring-4 focus-visible:ring-white sm:w-56 lg:w-64 ${
        focused
          ? "-translate-y-1 scale-[1.04] brightness-110 ring-4 ring-white/90"
          : "brightness-[0.8] ring-1 ring-white/10 hover:-translate-y-0.5 hover:brightness-100 hover:ring-white/40"
      }`}
    >
      <div className={`absolute inset-0 ${game.art}`} />
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_75%_15%,rgba(255,255,255,0.2),transparent_70%)]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-white/25" />
      {game.badge && (
        <span
          className="absolute left-3 top-3 rounded px-1.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-white"
          style={{ backgroundColor: RED }}
        >
          {game.badge}
        </span>
      )}
      <span className="absolute right-3 top-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
        {matchScore(game.id)}%
      </span>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-10 sm:p-4 sm:pt-12">
        <span className="block font-mono text-lg font-black uppercase leading-none tracking-tight text-white drop-shadow sm:text-2xl">
          {game.title}
        </span>
        <span className="mt-1 hidden text-[11px] text-white/60 lg:block">
          {game.tagline}
        </span>
      </div>
      {/* button hint, Xbox-style: visible on the focused tile */}
      <span
        className={`absolute bottom-3 right-3 rounded bg-white px-2 py-1 font-mono text-[10px] font-black uppercase tracking-widest text-black transition ${
          focused ? "opacity-100" : "opacity-0"
        }`}
      >
        ▶ Play
      </span>
    </Link>
  );
}

export default function StoreView() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [focusId, setFocusId] = useState<string>(GAMES[0].id);
  const [padConnected, setPadConnected] = useState(false);
  const [padNav, setPadNav] = useState(false);
  const [clock, setClock] = useState<string | null>(null);

  const focused = GAMES.find((g) => g.id === focusId) ?? GAMES[0];

  useEffect(() => {
    const on = () => setPadConnected(true);
    const off = () => setPadConnected(false);
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    // Deferred so the effect body itself never calls setState synchronously.
    const bootTimer = window.setTimeout(() => {
      tick();
      if (
        typeof navigator.getGamepads === "function" &&
        [...navigator.getGamepads()].some((g) => g && g.connected)
      ) {
        setPadConnected(true);
      }
    }, 0);
    const clockTimer = window.setInterval(tick, 30_000);
    window.addEventListener("gamepadconnected", on);
    window.addEventListener("gamepaddisconnected", off);
    return () => {
      window.clearTimeout(bootTimer);
      window.clearInterval(clockTimer);
      window.removeEventListener("gamepadconnected", on);
      window.removeEventListener("gamepaddisconnected", off);
    };
  }, []);

  const focusables = useCallback((): HTMLAnchorElement[] => {
    const root = rootRef.current;
    if (!root) return [];
    return [
      ...root.querySelectorAll<HTMLAnchorElement>("a[data-card]"),
    ].filter((el) => el.offsetParent !== null);
  }, []);

  const moveFocus = useCallback(
    (dir: "up" | "down" | "left" | "right") => {
      const items = focusables();
      if (!items.length) return;
      const current =
        items.find((el) => el.dataset.card === focusId) ?? items[0];
      const r0 = current.getBoundingClientRect();
      const cx = r0.left + r0.width / 2;
      const cy = r0.top + r0.height / 2;
      let best: HTMLAnchorElement | null = null;
      let bestScore = Infinity;
      for (const el of items) {
        if (el === current) continue;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - cx;
        const dy = r.top + r.height / 2 - cy;
        let primary = 0;
        let ok = false;
        if (dir === "left" && dx < -8) {
          ok = true;
          primary = -dx;
        } else if (dir === "right" && dx > 8) {
          ok = true;
          primary = dx;
        } else if (dir === "up" && dy < -8) {
          ok = true;
          primary = -dy;
        } else if (dir === "down" && dy > 8) {
          ok = true;
          primary = dy;
        }
        if (!ok) continue;
        const secondary =
          dir === "up" || dir === "down" ? Math.abs(dx) : Math.abs(dy);
        const score = primary + secondary * 3;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      const next = best ?? current;
      setFocusId(next.dataset.card ?? "");
      next.focus({ preventScroll: false });
    },
    [focusId, focusables],
  );

  useGamepadMenu(
    true,
    useCallback(
      (action) => {
        setPadNav(true);
        if (
          action === "up" ||
          action === "down" ||
          action === "left" ||
          action === "right"
        ) {
          moveFocus(action);
          padMenuRumble("move");
          return;
        }
        if (action === "confirm") {
          const el =
            focusables().find((x) => x.dataset.card === focusId) ??
            focusables()[0];
          el?.click();
          padMenuRumble("confirm");
        }
      },
      [moveFocus, focusables, focusId],
    ),
  );

  const navLink = (id: string) =>
    `text-sm outline-none transition ${
      padNav && focusId === id
        ? "font-semibold text-white"
        : "text-white/70 hover:text-white focus-visible:text-white"
    }`;

  return (
    <div
      ref={rootRef}
      data-padnav={padNav ? "on" : "off"}
      className="relative flex h-dvh min-h-[560px] flex-col overflow-hidden"
      style={{ backgroundColor: BG }}
    >
      {/* background art crossfades to the focused game */}
      {GAMES.map((g) => (
        <div
          key={g.id}
          aria-hidden
          className={`absolute inset-0 transition-opacity duration-700 ${g.art} ${
            focused.id === g.id ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(70%_60%_at_75%_15%,rgba(255,255,255,0.14),transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(115deg,transparent_42%,rgba(255,255,255,0.05)_50%,transparent_58%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_40%,transparent_40%,rgba(0,0,0,0.6)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/60 to-transparent"
      />

      {/* top bar */}
      <header className="relative z-20 shrink-0">
        <nav className="flex items-center justify-between px-[4vw] py-4">
          <div className="flex items-center gap-8">
            <span
              className="font-mono text-xl font-black uppercase tracking-tighter sm:text-2xl"
              style={{ color: RED }}
            >
              Pad·Games
            </span>
            <div className="hidden items-center gap-5 md:flex">
              <Link
                href="/leaderboard"
                data-card="nav-leaderboard"
                onFocus={() => setFocusId("nav-leaderboard")}
                className={navLink("nav-leaderboard")}
              >
                Leaderboard
              </Link>
              <Link
                href="/input-test"
                data-card="nav-input"
                onFocus={() => setFocusId("nav-input")}
                className={navLink("nav-input")}
              >
                Input Lab
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm tabular-nums text-white/70">
              {clock ?? ""}
            </span>
            <span
              className={`hidden items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] sm:inline-flex ${
                padConnected
                  ? "border-lime-300/40 bg-lime-300/10 text-lime-200"
                  : "border-white/10 bg-white/5 text-white/45"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${padConnected ? "bg-lime-300 shadow-[0_0_8px_#bef264]" : "bg-white/30"}`}
              />
              {padConnected ? "Pad" : "No pad"}
            </span>
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-teal-300 to-violet-500 ring-1 ring-white/25" />
          </div>
        </nav>
      </header>

      {/* hero — always the focused game */}
      <section className="relative z-10 flex min-h-0 flex-1 flex-col justify-center px-[4vw]">
        <div key={focused.id} className="animate-fade-in max-w-2xl">
          <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.35em]">
            <span style={{ color: RED }}>Pad·Games</span>
            <span className="text-white/70">Original</span>
          </p>
          <h1 className="mt-2 font-mono text-4xl font-black uppercase leading-[0.95] tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-6xl lg:text-7xl">
            {focused.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[11px] uppercase tracking-[0.18em] sm:text-xs">
            <span className="font-bold text-lime-400">
              {matchScore(focused.id)}% match
            </span>
            <span className="rounded border border-white/30 px-1.5 py-0.5 text-[10px] text-white/70">
              4K
            </span>
            {focused.badge && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-black text-white"
                style={{ backgroundColor: RED }}
              >
                {focused.badge}
              </span>
            )}
            <span className="text-white/60">{focused.genres.join(" · ")}</span>
          </div>
          <p className="mt-3 line-clamp-3 max-w-xl text-sm leading-relaxed text-white/85 drop-shadow sm:text-base">
            {focused.description}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={focused.href}
              onClick={() => padMenuRumble("confirm")}
              className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-2.5 font-bold text-black transition hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-white"
            >
              <span aria-hidden className="translate-y-px">
                ▶
              </span>
              {focused.cta}
            </Link>
          </div>
        </div>
      </section>

      {/* tile row */}
      <section className="relative z-20 shrink-0">
        <div className="flex items-baseline justify-between gap-4 px-[4vw]">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">
            Your games
          </h2>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-white/40 sm:block">
            D-pad to browse · A to play
          </span>
        </div>
        <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-[4vw] pb-[6vh] pt-3 sm:gap-4">
          {GAMES.map((g) => (
            <Tile
              key={g.id}
              game={g}
              focused={padNav && focusId === g.id}
              onPreview={() => setFocusId(g.id)}
              onOpen={() => padMenuRumble("confirm")}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
