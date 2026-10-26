import { useCallback, useEffect, useState } from "react";
import type { JeepEngine } from "@/game/core/engine";
import { getItemDef, type Stack } from "@/game/player/state";
import { padMenuRumble, useGamepadMenu, type PadMenuAction } from "@/hooks/use-gamepad-menu";

const COLS = 6;

/** Short label for a grid cell (the full name is in the detail pane). */
const abbrev = (name: string): string => (name.length > 9 ? `${name.slice(0, 8)}…` : name);

function Cell({ stack, selected, held, onClick }: { stack: Stack | null; selected: boolean; held: boolean; onClick: () => void }) {
  const def = stack ? getItemDef(stack.id) : null;
  return (
    <button
      onClick={onClick}
      aria-label={def ? `${def.name} ×${stack!.qty}` : "Empty slot"}
      className={`relative flex aspect-square flex-col items-center justify-center border px-1 text-center outline-none ${
        selected ? "border-bone bg-bone text-drab" : "border-bone/25 bg-drab-2/70 text-bone hover:border-bone/60"
      }`}
    >
      {def && (
        <>
          <span className="font-display text-[15px] leading-tight font-bold uppercase">{abbrev(def.name)}</span>
          {def.stackMax > 1 && <span className="mt-1 font-mono text-[11px]">×{stack!.qty}</span>}
          {held && <span className="absolute top-1 right-1 font-mono text-[9px] tracking-wider text-signal">HELD</span>}
        </>
      )}
    </button>
  );
}

/**
 * Inventory screen. The game is paused while it is open; every rule (use, equip, discard) is applied by the
 * engine through the player model, so this component only reads state and forwards the player's choice.
 */
export function InventoryPanel({ engine }: { engine: JeepEngine }) {
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState("");
  const [, bump] = useState(0);
  const p = engine.player;
  const stack = p.inventory.slots[sel] ?? null;
  const def = stack ? getItemDef(stack.id) : null;
  const refresh = (m: string) => {
    setMsg(m);
    bump((n) => n + 1);
  };

  const primary = useCallback(() => {
    if (!stack || !def) return;
    if (def.category === "consumable") refresh(engine.useInventoryItem(stack.id));
    else if (def.category === "weapon") refresh(engine.equipInventoryItem(stack.id));
  }, [engine, stack, def]);

  const move = useCallback(
    (dx: number, dy: number) => {
      const n = p.inventory.size;
      setSel((i) => Math.max(0, Math.min(n - 1, i + dx + dy * COLS)));
    },
    [p.inventory.size],
  );

  useGamepadMenu(true, (a: PadMenuAction) => {
    if (a === "confirm") primary();
    else if (a === "back") engine.resume();
    else {
      move(a === "left" ? -1 : a === "right" ? 1 : 0, a === "up" ? -1 : a === "down" ? 1 : 0);
      padMenuRumble("move");
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (dir[e.key]) {
        e.preventDefault();
        move(...dir[e.key]);
      } else if (e.key === "Enter") primary();
      else if ((e.key === "Delete" || e.key === "Backspace") && stack) refresh(engine.discardInventoryItem(sel, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, primary, stack, sel, engine]);

  const v = p.vitals;
  const held = p.held;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-6" onClick={() => engine.resume()}>
      <div
        role="dialog"
        aria-label="Inventory"
        onClick={(e) => e.stopPropagation()}
        className="grid w-full max-w-4xl gap-6 border border-bone/25 bg-drab/95 p-6 text-bone shadow-[0_30px_100px_rgba(0,0,0,.7)] md:grid-cols-[minmax(0,1fr)_17rem]"
      >
        <section>
          <h2 className="mb-3 font-display text-4xl leading-none font-extrabold uppercase">Inventory</h2>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
            {p.inventory.slots.map((s, i) => (
              <Cell key={i} stack={s} selected={i === sel} held={!!s && s.id === held} onClick={() => setSel(i)} />
            ))}
          </div>
        </section>
        <aside className="flex flex-col gap-4">
          <div className="min-h-[9.5rem] border-t border-bone/25 pt-3">
            {def ? (
              <>
                <h3 className="font-display text-2xl font-bold uppercase">{def.name}</h3>
                <p className="font-mono text-[11px] tracking-wider text-khaki uppercase">
                  {def.category}
                  {def.stackMax > 1 ? ` · ×${stack!.qty}` : ""}
                </p>
                <p className="mt-2 text-[14px] leading-snug text-bone/80">{def.description}</p>
                {def.use && (
                  <p className="mt-2 font-mono text-[12px] text-khaki">
                    {def.use.heal ? `+${def.use.heal} health ` : ""}
                    {def.use.stamina ? `+${def.use.stamina} stamina` : ""}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[14px] text-bone/50">Empty slot.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {def?.category === "consumable" && <Action onClick={primary}>Use</Action>}
            {def?.category === "weapon" && <Action onClick={primary}>{held === def.id ? "Holster" : "Equip"}</Action>}
            {stack && <Action onClick={() => refresh(engine.discardInventoryItem(sel, 1))}>Discard 1</Action>}
            {stack && stack.qty > 1 && <Action onClick={() => refresh(engine.discardInventoryItem(sel, stack.qty))}>Discard all</Action>}
          </div>
          <p aria-live="polite" className="min-h-5 font-mono text-[12px] text-signal">
            {msg}
          </p>
          <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-bone/25 pt-3 font-mono text-[12px] text-khaki">
            <dt>Health</dt>
            <dd className="text-bone">{Math.round(v.health)} / {v.cfg.maxHealth}</dd>
            <dt>Stamina</dt>
            <dd className="text-bone">{Math.round(v.stamina)} / {v.cfg.maxStamina}</dd>
          </dl>
          <p className="font-mono text-[11px] text-khaki/80">↑↓←→ select · Enter use / equip · Del discard · I / Esc / B close</p>
        </aside>
      </div>
    </div>
  );
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="border border-bone/60 px-3 py-1.5 font-display text-lg font-bold tracking-wide uppercase outline-none hover:bg-bone hover:text-drab focus-visible:bg-bone focus-visible:text-drab">
      {children}
    </button>
  );
}
