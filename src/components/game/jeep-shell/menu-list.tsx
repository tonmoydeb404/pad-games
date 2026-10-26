import { padMenuRumble } from "@/hooks/use-gamepad-menu";
import type { MenuNav } from "./menu-types";

/** Vertical gamepad/keyboard menu. Buttons carry data-mb so the hook can focus them. */
export function MenuList({ nav, size = "lg" }: { nav: MenuNav; size?: "lg" | "md" }) {
  const { items, focusIdx, setFocusIdx, activate } = nav;
  const text = size === "lg" ? "text-[clamp(20px,2.3vw,34px)]" : "text-[clamp(18px,1.6vw,24px)]";
  return (
    <ul className="flex w-[min(30rem,86vw)] flex-col gap-1.5" role="menu">
      {items.map((it, i) => {
        const on = focusIdx === i;
        const select = it.value !== undefined;
        return (
          <li key={it.id} role="none">
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
              className={`group relative flex w-full items-center gap-4 rounded-lg py-2.5 pr-5 pl-6 text-left font-display font-bold uppercase tracking-[0.06em] outline-none transition-all duration-200 ${text} ${
                it.disabled ? "cursor-progress text-white/30" : on ? "bg-white/[0.07] text-white" : "text-white/55 hover:text-white"
              }`}
            >
              <span
                aria-hidden
                className={`absolute top-1/2 left-0 h-[70%] w-1 -translate-y-1/2 rounded-full transition-all duration-200 ${
                  on && !it.disabled ? "bg-[#f2a33a] shadow-[0_0_14px_#f2a33a]" : "scale-y-0 bg-transparent"
                }`}
              />
              <span className={it.primary && on && !it.disabled ? "text-[#f2a33a]" : ""}>{it.label}</span>
              {select && (
                <span className="ml-auto flex items-center gap-3 font-mono text-[0.5em] tracking-[0.12em] text-[#f2a33a]">
                  <Chevron dir={-1} onStep={() => activate(it.id, -1)} />
                  <span className="min-w-[5.5em] text-center text-white/90">{it.value}</span>
                  <Chevron dir={1} onStep={() => activate(it.id, 1)} />
                </span>
              )}
              {it.hint && <span className="ml-auto font-mono text-[0.45em] tracking-[0.16em] text-white/45">{it.hint}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Chevron({ dir, onStep }: { dir: 1 | -1; onStep: () => void }) {
  return (
    <span
      role="button"
      aria-label={dir < 0 ? "Previous" : "Next"}
      onClick={(e) => {
        e.stopPropagation();
        onStep();
        padMenuRumble("move");
      }}
      className="cursor-pointer px-1 text-white/50 transition hover:text-[#f2a33a]"
    >
      {dir < 0 ? "‹" : "›"}
    </span>
  );
}
