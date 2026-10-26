import { KeyHints, MenuPanel, Wordmark } from "./menu-panel";
import { MenuList } from "./menu-list";
import type { MenuNav } from "./menu-types";

export function PauseOverlay({ overlayRef, nav }: { overlayRef: React.RefObject<HTMLDivElement | null>; nav: MenuNav }) {
  return (
    <div ref={overlayRef} className="absolute inset-0 z-30 bg-black/45">
      <MenuPanel>
        <Wordmark size="sm" note="paused" />
        <div className="mt-auto mb-auto py-10">
          <MenuList nav={nav} />
        </div>
        <KeyHints hints={[["Esc", "resume"], ["P", "resume"]]} />
      </MenuPanel>
    </div>
  );
}
