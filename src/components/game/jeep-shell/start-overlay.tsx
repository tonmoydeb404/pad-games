import { MenuList } from "./menu-list";
import type { MenuNav } from "./menu-types";
import { CHARACTERS } from "./shell-data";

interface Props {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  nav: MenuNav;
  charIdx: number;
  ready: boolean;
  progress: { pct: number; label: string };
  padConnected: boolean;
}

/** Title screen: the live world behind, wordmark + menu on the left, the chosen explorer on the right. */
export function StartOverlay({ overlayRef, nav, charIdx, ready, progress, padConnected }: Props) {
  const ch = CHARACTERS[charIdx];
  return (
    <div ref={overlayRef} className="absolute inset-0 z-40 overflow-hidden">
      {/* readability scrims over the live scene */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(4,8,5,.9)_0%,rgba(4,8,5,.6)_34%,rgba(4,8,5,0)_62%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_220px_rgba(0,0,0,.55)]" />

      <main className="relative flex h-full flex-col justify-center pl-[7vw]">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.34em] text-[#f2a33a]">Open-world survival sandbox</p>
        <h1 className="mt-3 bg-gradient-to-b from-[#fff4dc] via-[#f6c46a] to-[#e2832d] bg-clip-text font-display text-[clamp(88px,13vw,220px)] leading-[0.86] font-black tracking-[-0.03em] text-transparent uppercase drop-shadow-[0_10px_40px_rgba(0,0,0,.55)]">
          TinTin
        </h1>
        <p className="mt-5 mb-10 max-w-[30rem] text-[clamp(14px,1.15vw,18px)] leading-relaxed text-white/70">
          Wake up in the wild. Roam the jungle, ride what you can tame, and make the wilderness your home.
        </p>
        <MenuList nav={nav} />
      </main>

      {/* explorer caption, under the live character */}
      <div className="pointer-events-none absolute right-[10vw] bottom-[12vh] w-[min(24rem,30vw)] text-right">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">Your explorer</p>
        <p className="mt-1 font-display text-[clamp(22px,2.2vw,34px)] font-bold tracking-wide text-white uppercase">{ch.label}</p>
        <p className="mt-1 text-[13px] text-white/55">{ch.blurb}</p>
      </div>

      <footer className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 px-[7vw] pb-7">
        <div className="w-[min(26rem,60vw)]">
          {!ready && (
            <>
              <div className="h-[3px] overflow-hidden rounded bg-white/10">
                <div className="h-full rounded bg-[#f2a33a] transition-[width] duration-300" style={{ width: `${progress.pct}%` }} />
              </div>
              <p className="mt-2 font-mono text-[10.5px] tracking-wide text-white/45">{progress.label}</p>
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 font-mono text-[10.5px] tracking-[0.14em] text-white/40 uppercase">
          <span className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${padConnected ? "bg-lime-300 shadow-[0_0_8px_#bef264]" : "bg-white/30"}`} />
            {padConnected ? "Gamepad connected" : "Keyboard · plug in a gamepad"}
          </span>
          <span>↑↓ select · ←→ change · enter / A confirm</span>
          <span className="text-white/25">Original concept by Ali Usman</span>
        </div>
      </footer>
    </div>
  );
}
