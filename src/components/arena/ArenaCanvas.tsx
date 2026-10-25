"use client";

/**
 * Canvas host for the arena. Loaded via next/dynamic with SSR disabled (three.js
 * and pointer lock need `window`). One effect owns the whole Arena lifetime so
 * Strict Mode remounts and HMR never leave a second WebGL context behind.
 */

import { useEffect, useRef } from "react";
import type { Arena, ArenaOptions } from "@/arena";

export default function ArenaCanvas({
  options,
  onReady,
}: {
  options: Omit<ArenaOptions, "container">;
  onReady: (arena: Arena) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initial = useRef(options);

  useEffect(() => {
    let cancelled = false;
    let arena: Arena | null = null;

    void (async () => {
      const { createArena } = await import("@/arena");
      if (cancelled || !containerRef.current) return;
      arena = await createArena({ ...initial.current, container: containerRef.current });
      if (cancelled) {
        arena.destroy();
        return;
      }
      onReady(arena);
      void arena.connect();
    })();

    return () => {
      cancelled = true;
      arena?.destroy();
      arena = null;
    };
  }, [onReady]);

  return <div ref={containerRef} className="h-full w-full" />;
}
