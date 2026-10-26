import { KEY_CONTROLS, PAD_CONTROLS } from "./shell-data";

function Column({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <h3 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[#f2a33a]">{title}</h3>
      <ul className="space-y-1.5 text-[13px] text-white/65">
        {rows.map(([keys, action]) => (
          <li key={keys} className="flex items-center justify-between gap-4">
            <kbd className="shrink-0 rounded-md border border-white/15 bg-white/[0.08] px-2 py-0.5 font-mono text-[11px] font-bold text-white">{keys}</kbd>
            <span className="text-right">{action}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Full controls reference — a modal opened from the title and pause menus. */
export function ControlsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-md" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Controls"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0b100b]/95 p-8 shadow-[0_40px_120px_rgba(0,0,0,.8)]"
      >
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-3xl font-black uppercase tracking-wide text-white">Controls</h2>
          <button
            autoFocus
            onClick={onClose}
            className="rounded-md border border-white/15 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/70 outline-none hover:text-white focus-visible:border-[#f2a33a] focus-visible:text-[#f2a33a]"
          >
            Close · B / Esc
          </button>
        </div>
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          <Column title="Keyboard & mouse" rows={KEY_CONTROLS} />
          <Column title="Gamepad" rows={PAD_CONTROLS} />
        </div>
      </div>
    </div>
  );
}
