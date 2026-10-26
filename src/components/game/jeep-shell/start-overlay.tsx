import type { JeepQuality } from "@/game/core/engine";
import { CharacterPicker } from "./character-picker";
import { ControlsList } from "./controls-list";
import { QualityStartBar } from "./quality-start-bar";
import { KEY_CONTROLS, PAD_CONTROLS } from "./shell-data";
import { StartHero } from "./start-hero";
import type { MenuFocus } from "./menu-types";

interface Props {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  padConnected: boolean;
  charIdx: number;
  quality: JeepQuality;
  qualityLocked: boolean;
  ready: boolean;
  progress: { pct: number; label: string };
  focus: MenuFocus;
}

export function StartOverlay({ overlayRef, padConnected, charIdx, quality, qualityLocked, ready, progress, focus }: Props) {
  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-40 overflow-y-auto bg-[linear-gradient(160deg,#070e08_0%,#0d160f_45%,#050906_100%)]"
    >
      <div className="flex min-h-full items-center justify-center p-5">
        <div className="w-full max-w-5xl rounded-3xl border border-white/15 bg-[#101611]/80 p-8 shadow-[0_40px_100px_rgba(0,0,0,.75)] backdrop-blur-xl sm:p-10">
          <div className="grid gap-9 lg:grid-cols-[1fr_1.05fr]">
            <StartHero padConnected={padConnected} />
            <CharacterPicker charIdx={charIdx} focus={focus} />
          </div>
          <QualityStartBar quality={quality} qualityLocked={qualityLocked} ready={ready} progress={progress} focus={focus} />
          <ControlsList pad={PAD_CONTROLS} keys={KEY_CONTROLS} />
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <p className="font-mono text-[10px] text-white/30">Original concept by Ali Usman · TinTin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
