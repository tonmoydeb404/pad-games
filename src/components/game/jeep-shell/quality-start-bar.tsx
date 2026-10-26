import type { JeepQuality } from "@/game/core/engine";
import { padMenuRumble } from "@/hooks/use-gamepad-menu";
import { QUALITIES, START_BTN } from "./shell-data";
import type { MenuFocus } from "./menu-types";

interface Props {
  quality: JeepQuality;
  qualityLocked: boolean;
  ready: boolean;
  progress: { pct: number; label: string };
  focus: MenuFocus;
}

/** Graphics quality picker, Start button and the loading bar. */
export function QualityStartBar({ quality, qualityLocked, ready, progress, focus }: Props) {
  const { ringCls, setFocusIdx, activate } = focus;
  return (
    <>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
            Graphics quality {qualityLocked && <span className="text-white/30">· locked</span>}
          </p>
          <div className="flex overflow-hidden rounded-xl border border-white/10 bg-black/25">
            {QUALITIES.map((q, i) => (
              <button
                key={q.id}
                data-mb={i}
                disabled={qualityLocked}
                onFocus={() => setFocusIdx(i)}
                onClick={() => {
                  activate(`quality:${q.id}`);
                  padMenuRumble("move");
                }}
                className={`px-5 py-3 font-mono text-[13px] font-bold transition disabled:opacity-50 ${ringCls(i)} ${
                  quality === q.id
                    ? "bg-gradient-to-b from-[#e2452f] to-[#b82d19] text-white"
                    : "text-white/55 hover:bg-white/10 hover:text-white"
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
        <button
          data-mb={START_BTN}
          disabled={!ready}
          onFocus={() => setFocusIdx(START_BTN)}
          onClick={() => activate("start")}
          className={`rounded-2xl px-10 py-4 font-mono text-[16px] font-black uppercase tracking-wide transition ${ringCls(START_BTN)} ${
            ready
              ? "bg-gradient-to-br from-[#ff543d] to-[#e2452f] text-white shadow-[0_12px_36px_rgba(226,69,47,.45)] hover:scale-[1.02] hover:shadow-[0_18px_48px_rgba(226,69,47,.6)]"
              : "cursor-progress bg-white/10 text-white/40"
          }`}
        >
          {ready ? "Start Experience" : `Preparing… ${progress.pct}%`}
        </button>
      </div>

      {/* progress */}
      {!ready && (
        <div className="mt-5">
          <div className="h-1 overflow-hidden rounded bg-white/10">
            <div
              className="h-full rounded bg-gradient-to-r from-[#e2452f] to-[#ff7a5c] transition-[width] duration-300"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] tracking-wide text-white/45">{progress.label}</p>
        </div>
      )}
    </>
  );
}
