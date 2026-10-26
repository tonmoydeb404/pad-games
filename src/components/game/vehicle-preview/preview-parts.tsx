export type PreviewState = "loading" | "ready" | "failed";

export function PreviewPlaceholder() {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 text-center">
      <p className="text-3xl">🚙</p>
      <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
        Classic Jeep
      </p>
      <p className="mt-1 text-[11px] text-white/35">Warming up the engine…</p>
    </div>
  );
}

export function PreviewStatus({ state }: { state: PreviewState }) {
  return (
    <>
      {state !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-lg bg-black/55 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">
            {state === "loading" ? "Loading model…" : "Model unavailable"}
          </span>
        </div>
      )}
    </>
  );
}
