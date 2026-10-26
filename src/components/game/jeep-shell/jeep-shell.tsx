"use client";

/**
 * TinTin shell: owns the engine lifecycle, the gamepad-navigable title
 * screen (play, explorer, graphics, controls), and the pause menu. The engine renders its
 * own HUD inside the canvas root; React only draws these overlays.
 *
 * Menu navigation: rows carry data-mb indices; the hook moves DOM focus to the
 * highlighted row, so keyboard, mouse and pad all share one focus model.
 */

import dynamic from "next/dynamic";
import { ControlsPanel } from "./controls-panel";
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
    <div className="relative h-dvh w-full select-none overflow-hidden bg-drab text-bone">
      <JeepCanvas
        quality={s.quality}
        onEngine={onEngine}
        onProgress={onProgress}
        onReady={onReady}
        onPauseChange={onPauseChange}
        onPadChange={onPadChange}
      />

      {!s.started && (
        <StartOverlay
          overlayRef={s.startOverlayRef}
          nav={s.nav}
          ready={s.ready}
          progress={s.progress}
          padConnected={s.padConnected}
        />
      )}

      {s.started && s.paused && (
        <PauseOverlay overlayRef={s.pauseOverlayRef} nav={s.nav} />
      )}

      {s.controlsOpen && <ControlsPanel onClose={s.closeControls} />}
    </div>
  );
}
