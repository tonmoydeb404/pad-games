"use client";

/**
 * The canvas host. Loaded via next/dynamic with SSR disabled (Pixi and the
 * Gamepad API need `window`/`navigator`). Creates/destroys the whole Game in
 * one effect, and gives every instance its own <canvas> element — two Pixi
 * apps must never share one WebGL context (React Strict Mode remount, HMR).
 */

import { useEffect, useRef, useState } from "react";
import type { Game } from "@/game/core/game";
import type { Settings } from "@/game/core/types";

export default function GameCanvas({
  onReady,
  settings,
}: {
  onReady: (game: Game) => void;
  settings: Settings;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Settings at creation time only — live updates flow through applySettings.
  const initialSettings = useRef(settings);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    let canvas: HTMLCanvasElement | null = null;

    void (async () => {
      const { createGame } = await import("@/game");
      if (cancelled || !containerRef.current) return;
      try {
        canvas = document.createElement("canvas");
        canvas.className = "block h-full w-full touch-none select-none";
        canvas.setAttribute("aria-label", "Dune Glide game canvas");
        containerRef.current.appendChild(canvas);
        game = await createGame({
          canvas,
          settings: initialSettings.current,
        });
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : String(err));
        }
        canvas?.remove();
        canvas = null;
        return;
      }
      if (cancelled) {
        game.destroy();
        canvas.remove();
        return;
      }
      onReady(game);
    })();

    return () => {
      cancelled = true;
      game?.destroy();
      canvas?.remove();
      game = null;
      canvas = null;
    };
  }, [onReady]);

  return (
    <div ref={containerRef} className="h-full w-full">
      {bootError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-red-300">
            Couldn&apos;t start the engine
          </p>
          <p className="max-w-md font-mono text-xs text-white/60">{bootError}</p>
          <p className="max-w-md text-xs text-white/40">
            WebGL may be unavailable or blocked in this browser. The game needs
            hardware (or software) WebGL to render.
          </p>
        </div>
      )}
    </div>
  );
}
