"use client";

/**
 * Canvas host for Racing. Loaded via next/dynamic with SSR disabled (three.js,
 * WebGL and the Gamepad API need `window`). One effect owns the whole engine
 * lifetime so Strict Mode remounts and HMR never leave a second WebGL context
 * behind. State callbacks arrive through a stable ref.
 */

import { useEffect, useRef, useState } from "react";
import type { HudFrame, RacingEngine } from "@/racing/engine";

export interface RacingCanvasCallbacks {
  onEngine?: (engine: RacingEngine) => void;
  onProgress?: (pct: number, label: string) => void;
  onReady?: () => void;
  onPauseChange?: (paused: boolean) => void;
  onPadChange?: (connected: boolean, id: string) => void;
  onHud?: (hud: HudFrame) => void;
  onToast?: (text: string) => void;
}

export default function RacingCanvas(callbacks: RacingCanvasCallbacks) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef(callbacks);
  useEffect(() => {
    cbRef.current = callbacks;
  }, [callbacks]);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let engine: RacingEngine | null = null;

    void (async () => {
      const { RacingEngine } = await import("@/racing/engine");
      if (cancelled || !containerRef.current) return;
      try {
        engine = new RacingEngine({ container: containerRef.current });
        engine.onProgress = (pct, label) => cbRef.current.onProgress?.(pct, label);
        engine.onReady = () => cbRef.current.onReady?.();
        engine.onPauseChange = (p) => cbRef.current.onPauseChange?.(p);
        engine.onPadChange = (c, id) => cbRef.current.onPadChange?.(c, id);
        engine.onHud = (h) => cbRef.current.onHud?.(h);
        engine.onToast = (t) => cbRef.current.onToast?.(t);
        engine.attach();
        if (window.location.search.includes("debug")) (window as unknown as { __racing?: RacingEngine }).__racing = engine;
        cbRef.current.onEngine?.(engine);
        await engine.build();
      } catch (err) {
        if (!cancelled) setBootError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      engine?.destroy();
      engine = null;
    };
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full">
      {bootError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#0b0d12] p-6 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-red-300">Couldn&apos;t start the engine</p>
          <p className="max-w-md font-mono text-xs text-white/60">{bootError}</p>
          <p className="max-w-md text-xs text-white/40">
            WebGL may be unavailable or blocked in this browser. The circuit needs hardware (or software) WebGL to render.
          </p>
        </div>
      )}
    </div>
  );
}
