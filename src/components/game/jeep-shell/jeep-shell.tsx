"use client";

/**
 * Jungle Jeep shell: owns the engine lifecycle, the gamepad-navigable start
 * overlay (quality + start), and the pause overlay. The engine renders its
 * own HUD inside the canvas root; React only draws these overlays.
 *
 * Pad navigation: buttons carry data-mb indices; focus is applied by querying
 * the active overlay, and the ring is driven by focusIdx state so it renders
 * identically in every browser.
 */

import dynamic from "next/dynamic";
import { PauseOverlay } from "./pause-overlay";
import { StartOverlay } from "./start-overlay";
import { useJeepShell } from "./use-jeep-shell";

// SSR disabled: the engine touches window/navigator/WebGL at construction.
const JeepCanvas = dynamic(() => import("../jeep-canvas").then((m) => m.JeepCanvas), {
  ssr: false,
});

export function JeepShell() {
  const s = useJeepShell();
  const { onEngine, onProgress, onReady, onPauseChange, onPadChange } = s.engineCallbacks;

  return (
    <div className="relative h-dvh w-full select-none overflow-hidden bg-[#0a0f0a] text-[#f3efe6]">
      <JeepCanvas
        onEngine={onEngine}
        onProgress={onProgress}
        onReady={onReady}
        onPauseChange={onPauseChange}
        onPadChange={onPadChange}
      />

      {!s.started && (
        <StartOverlay
          overlayRef={s.startOverlayRef}
          padConnected={s.padConnected}
          charIdx={s.charIdx}
          quality={s.quality}
          qualityLocked={s.qualityLocked}
          ready={s.ready}
          progress={s.progress}
          focus={s.focus}
        />
      )}

      {s.started && s.paused && (
        <PauseOverlay
          overlayRef={s.pauseOverlayRef}
          buttons={s.overlayButtons}
          clampedIdx={s.clampedIdx}
          focus={s.focus}
        />
      )}
    </div>
  );
}
