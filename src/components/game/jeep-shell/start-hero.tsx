export function StartHero({ padConnected }: { padConnected: boolean }) {
  return (
    <div>
      <span className="inline-flex items-center gap-2 rounded-full border border-[#e2452f]/40 bg-[#e2452f]/15 px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#ff8c7a]">
        ⚡ Open-world 4×4 Off-road Simulator
      </span>
      <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
        Jeep in{" "}
        <span className="bg-gradient-to-br from-[#ff7a63] to-[#ffaa00] bg-clip-text text-transparent">
          Jungle
        </span>
      </h1>
      <p className="mt-3.5 text-sm leading-relaxed text-white/70 sm:text-[15px]">
        An open-world jungle to explore on foot or behind the wheel.
        Start as the explorer — walk, sprint, jump, dodge, fight and shoot your way through dense
        tropical jungle — then hop into any of 26 rides for mud
        trails, a stream ford, a wooden bridge and a rocky climb.
        Fully playable with a gamepad, with rumble on every bump.
      </p>

      {/* pad status */}
      <div className="mt-5">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${
            padConnected
              ? "border-lime-300/40 bg-lime-300/10 text-lime-200"
              : "border-white/15 bg-white/5 text-white/50"
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              padConnected ? "bg-lime-300 shadow-[0_0_8px_#bef264]" : "bg-white/30"
            }`}
          />
          {padConnected ? "Gamepad connected" : "No gamepad — press any pad button"}
        </span>
      </div>
    </div>
  );
}
