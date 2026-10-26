function ControlsColumn({ title, titleCls, rows }: { title: string; titleCls: string; rows: [string, string][] }) {
  return (
    <div>
      <p className={`mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] ${titleCls}`}>{title}</p>
      <ul className="space-y-1 text-[12px] text-white/60">
        {rows.map(([keys, action]) => (
          <li key={keys} className="flex justify-between gap-3">
            <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-white">
              {keys}
            </kbd>
            <span className="text-right">{action}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ControlsList({ pad, keys }: { pad: [string, string][]; keys: [string, string][] }) {
  return (
    <div className="mt-8 grid gap-x-6 gap-y-5 border-t border-white/10 pt-6 sm:grid-cols-2">
      <ControlsColumn title="🎮 Gamepad" titleCls="text-[#ff8c7a]" rows={pad} />
      <ControlsColumn title="⌨️ Keyboard" titleCls="text-white/45" rows={keys} />
    </div>
  );
}
