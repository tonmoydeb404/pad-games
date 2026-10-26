/** Flat olive-drab side panel shared by the title and pause menus. */
export function MenuPanel({ children }: { children: React.ReactNode }) {
  return (
    <aside className="absolute inset-y-0 left-0 flex w-[min(34rem,100vw)] flex-col border-r border-bone/25 bg-drab/95 px-[max(2rem,3vw)] py-10 text-bone">
      {children}
    </aside>
  );
}

/** Stamped wordmark with a small plate line, like the marking on a supply crate. */
export function Wordmark({ size = "lg", note }: { size?: "lg" | "sm"; note: string }) {
  return (
    <header>
      <h1
        className={`font-display leading-[0.82] font-extrabold tracking-[0.01em] text-bone uppercase ${
          size === "lg" ? "text-[clamp(96px,10.5vw,176px)]" : "text-[clamp(64px,6vw,96px)]"
        }`}
      >
        TinTin
      </h1>
      <p className="mt-4 flex justify-between border-y border-bone/30 py-2 font-mono text-[11px] tracking-[0.12em] text-khaki uppercase">
        <span>
          <span className="text-signal">4×4</span> {note}
        </span>
        <span>1.0 km sq.</span>
      </p>
    </header>
  );
}

/** Row of key caps and what they do. */
export function KeyHints({ hints }: { hints: [string, string][] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-khaki">
      {hints.map(([k, v]) => (
        <li key={k} className="flex items-center gap-2">
          <kbd className="rounded-[2px] border border-bone/40 px-1.5 py-px text-bone">{k}</kbd>
          {v}
        </li>
      ))}
    </ul>
  );
}
