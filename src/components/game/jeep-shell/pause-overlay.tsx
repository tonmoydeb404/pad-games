import { MenuList } from "./menu-list";
import type { MenuNav } from "./menu-types";

export function PauseOverlay({ overlayRef, nav }: { overlayRef: React.RefObject<HTMLDivElement | null>; nav: MenuNav }) {
  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-30 flex items-center bg-[linear-gradient(90deg,rgba(4,8,5,.92),rgba(4,8,5,.55)_55%,rgba(4,8,5,.2))] pl-[7vw] backdrop-blur-sm"
    >
      <div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[#f2a33a]">Game paused</p>
        <h2 className="mt-2 mb-8 font-display text-[clamp(48px,6vw,96px)] leading-none font-black tracking-tight text-white uppercase">TinTin</h2>
        <MenuList nav={nav} size="md" />
        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">Start / Esc to resume</p>
      </div>
    </div>
  );
}
