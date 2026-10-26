import { padMenuRumble } from "@/hooks/use-gamepad-menu";
import { CharacterPreview } from "../character-preview";
import { CHARACTERS, CHAR_NEXT_BTN, CHAR_PREV_BTN } from "./shell-data";
import type { MenuFocus } from "./menu-types";

const ARROW_CLS = "px-4 py-3 font-mono text-[13px] font-bold text-white/55 transition hover:bg-white/10 hover:text-white";

export function CharacterPicker({ charIdx, focus }: { charIdx: number; focus: MenuFocus }) {
  const { ringCls, setFocusIdx, activate } = focus;
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
        Choose your explorer <span className="text-white/30">· {CHARACTERS.length} characters</span>
      </p>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-black/25">
        <button
          data-mb={CHAR_PREV_BTN}
          aria-label="Previous character"
          onFocus={() => setFocusIdx(CHAR_PREV_BTN)}
          onClick={() => {
            activate("character:prev");
            padMenuRumble("move");
          }}
          className={`${ARROW_CLS} ${ringCls(CHAR_PREV_BTN)}`}
        >
          ◀
        </button>
        <span className="flex flex-1 items-center justify-center px-5 py-3 font-mono text-[13px] font-bold text-white">
          {CHARACTERS[charIdx].label}
        </span>
        <button
          data-mb={CHAR_NEXT_BTN}
          aria-label="Next character"
          onFocus={() => setFocusIdx(CHAR_NEXT_BTN)}
          onClick={() => {
            activate("character:next");
            padMenuRumble("move");
          }}
          className={`${ARROW_CLS} ${ringCls(CHAR_NEXT_BTN)}`}
        >
          ▶
        </button>
      </div>
      <div className="mt-4">
        <CharacterPreview skin={CHARACTERS[charIdx].id} />
      </div>
      <p className="mt-2.5 text-[12px] text-white/50">{CHARACTERS[charIdx].blurb}</p>
    </div>
  );
}
