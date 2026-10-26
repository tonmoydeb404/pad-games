import { padMenuRumble } from "@/hooks/use-gamepad-menu";
import type { MenuNav } from "./menu-types";

/** Vertical gamepad/keyboard menu. Buttons carry data-mb so the hook can focus them. */
export function MenuList({ nav }: { nav: MenuNav }) {
  const { items, focusIdx, setFocusIdx, activate } = nav;
  return (
    <ul className="flex flex-col border-t border-bone/20" role="menu">
      {items.map((it, i) => {
        const on = focusIdx === i && !it.disabled;
        const select = it.value !== undefined;
        return (
          <li key={it.id} role="none" className="border-b border-bone/20">
            <button
              role="menuitem"
              data-mb={i}
              disabled={it.disabled}
              onFocus={() => setFocusIdx(i)}
              onMouseEnter={() => !it.disabled && setFocusIdx(i)}
              onClick={() => {
                activate(it.id);
                padMenuRumble("confirm");
              }}
              className={`flex h-[3.4rem] w-full items-center justify-between px-4 text-left font-display text-[2rem] font-bold tracking-[0.04em] uppercase outline-none ${
                it.disabled ? "text-bone/35" : on ? "bg-bone text-drab" : "text-bone"
              }`}
            >
              <span>{it.label}</span>
              {select && (
                <span className="flex items-center gap-2 font-mono text-[13px] font-medium tracking-[0.08em]">
                  <Step dir={-1} onStep={() => activate(it.id, -1)} />
                  <span className="min-w-[6.5em] text-center">{it.value}</span>
                  <Step dir={1} onStep={() => activate(it.id, 1)} />
                </span>
              )}
              {it.hint && <span className="font-mono text-[13px] tracking-[0.1em]">{it.hint}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Step({ dir, onStep }: { dir: 1 | -1; onStep: () => void }) {
  return (
    <span
      role="button"
      aria-label={dir < 0 ? "Previous" : "Next"}
      onClick={(e) => {
        e.stopPropagation();
        onStep();
        padMenuRumble("move");
      }}
      className="cursor-pointer px-1.5 text-lg leading-none opacity-60 hover:opacity-100"
    >
      {dir < 0 ? "‹" : "›"}
    </span>
  );
}
