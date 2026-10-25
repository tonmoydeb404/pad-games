"use client";

/**
 * Canvas host for Jungle Jeep. Loaded via next/dynamic with SSR disabled
 * (three.js, WebGL and the Gamepad API need `window`). One effect owns the
 * whole engine lifetime so Strict Mode remounts and HMR never leave a second
 * WebGL context behind. Progress/state callbacks arrive through stable refs.
 */

import { useEffect, useRef, useState } from "react";
import type { JeepEngine } from "@/jeep/engine";

export interface JeepCanvasCallbacks {
  onEngine?: (engine: JeepEngine) => void;
  onProgress?: (pct: number, label: string) => void;
  onReady?: () => void;
  onPauseChange?: (paused: boolean) => void;
  onPadChange?: (connected: boolean, id: string) => void;
}

export default function JeepCanvas(callbacks: JeepCanvasCallbacks) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef(callbacks);
  useEffect(() => {
    cbRef.current = callbacks;
  }, [callbacks]);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let engine: JeepEngine | null = null;

    void (async () => {
      const { JeepEngine } = await import("@/jeep/engine");
      if (cancelled || !containerRef.current) return;
      try {
        engine = new JeepEngine({ container: containerRef.current });
        engine.onProgress = (pct, label) => cbRef.current.onProgress?.(pct, label);
        engine.onReady = () => cbRef.current.onReady?.();
        engine.onPauseChange = (paused) => cbRef.current.onPauseChange?.(paused);
        engine.onPadChange = (c, id) => cbRef.current.onPadChange?.(c, id);
        engine.attach();
        await engine.build();
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      if (cancelled) {
        engine.destroy();
        return;
      }
      cbRef.current.onEngine?.(engine);
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
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#0b0f0c] p-6 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-red-300">
            Couldn&apos;t start the engine
          </p>
          <p className="max-w-md font-mono text-xs text-white/60">{bootError}</p>
          <p className="max-w-md text-xs text-white/40">
            WebGL may be unavailable or blocked in this browser. The jungle
            needs hardware (or software) WebGL to render.
          </p>
        </div>
      )}
    </div>
  );
}
