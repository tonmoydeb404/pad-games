import { padMenuRumble } from "@/hooks/use-gamepad-menu";
import type { MenuFocus, OverlayButton } from "./menu-types";

interface Props {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  buttons: OverlayButton[];
  clampedIdx: number;
  focus: MenuFocus;
}

export function PauseOverlay({ overlayRef, buttons, clampedIdx, focus }: Props) {
  const { ringCls, setFocusIdx, activate } = focus;
  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#050906]/70 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#101611]/90 p-8 text-center shadow-2xl">
        <h2 className="text-3xl font-black tracking-tight text-white">Paused</h2>
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
          Start / Esc to continue
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          {buttons.map((btn, i) => (
            <button
              key={btn.label}
              data-mb={i}
              onFocus={() => setFocusIdx(i)}
              onClick={() => {
                activate(btn.action);
                padMenuRumble("confirm");
              }}
              className={`rounded-xl border px-5 py-3 font-mono text-[13px] font-bold uppercase tracking-[0.14em] transition ${ringCls(i)} ${
                clampedIdx === i
                  ? "border-lime-300/80 bg-lime-300/15 text-lime-100"
                  : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
