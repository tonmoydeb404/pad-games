import { KEY_CONTROLS, PAD_CONTROLS } from "./shell-data";

function Column({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section>
      <h3 className="mb-3 border-b-2 border-drab pb-1 font-display text-xl font-bold tracking-wide uppercase">{title}</h3>
      <ul className="text-[14px]">
        {rows.map(([keys, action]) => (
          <li key={keys} className="flex items-center justify-between gap-4 border-b border-drab/15 py-1.5">
            <span>{action}</span>
            <kbd className="shrink-0 rounded-[2px] border border-drab bg-white/50 px-1.5 py-px font-mono text-[12px] font-medium">{keys}</kbd>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Controls reference, set as a paper field card over the dimmed game. */
export function ControlsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Controls"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-5xl overflow-y-auto bg-bone p-8 text-drab shadow-[0_24px_80px_rgba(0,0,0,.6)]"
      >
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="font-display text-5xl leading-none font-extrabold uppercase">Controls</h2>
          <button
            autoFocus
            onClick={onClose}
            className="border border-drab px-3 py-1.5 font-mono text-[12px] outline-none hover:bg-drab hover:text-bone focus-visible:bg-drab focus-visible:text-bone"
          >
            Close · B / Esc
          </button>
        </div>
        <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
          <Column title="Keyboard & mouse" rows={KEY_CONTROLS} />
          <Column title="Gamepad" rows={PAD_CONTROLS} />
        </div>
      </div>
    </div>
  );
}
