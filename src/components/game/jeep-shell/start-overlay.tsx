import { KeyHints, MenuPanel, Wordmark } from "./menu-panel";
import { MenuList } from "./menu-list";
import type { MenuNav } from "./menu-types";

interface Props {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  nav: MenuNav;
  ready: boolean;
  progress: { pct: number; label: string };
  padConnected: boolean;
}

const CELLS = 32;

/** Title screen: the live world fills the view, the menu sits on a flat panel at the left. */
export function StartOverlay({ overlayRef, nav, ready, progress, padConnected }: Props) {
  const filled = Math.round((progress.pct / 100) * CELLS);
  return (
    <div ref={overlayRef} className="absolute inset-0 z-40">
      <MenuPanel>
        <Wordmark note="jungle expedition" />
        <div className="mt-auto mb-auto py-10">
          <MenuList nav={nav} />
        </div>
        <div className="flex flex-col gap-4">
          {ready ? (
            <KeyHints
              hints={
                padConnected
                  ? [["↕", "select"], ["↔", "change"], ["A", "confirm"]]
                  : [["↑↓", "select"], ["←→", "change"], ["Enter", "confirm"]]
              }
            />
          ) : (
            <div role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Loading the world">
              <div className="flex gap-[3px]">
                {Array.from({ length: CELLS }, (_, i) => (
                  <span key={i} className={`h-3 flex-1 ${i < filled ? "bg-bone" : "bg-bone/15"}`} />
                ))}
              </div>
              <p className="mt-2 font-mono text-[11px] text-khaki">{progress.label}</p>
            </div>
          )}
          <p className="font-mono text-[10px] tracking-[0.1em] text-khaki/70 uppercase">Original concept by Ali Usman</p>
        </div>
      </MenuPanel>
    </div>
  );
}
