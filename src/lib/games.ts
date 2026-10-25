/**
 * The store catalog: one entry per game. The landing page renders cards from
 * this list, so adding a game is a data change, not a page rewrite.
 */

export interface GameEntry {
  id: string;
  title: string;
  href: string;
  tagline: string;
  description: string;
  genres: string[];
  badge?: string;
  /** Tailwind gradient classes for the card art panel. */
  art: string;
  /** Tailwind text color for the accent title. */
  accent: string;
  cta: string;
  controls: [string, string][];
}

export const GAMES: GameEntry[] = [
  {
    id: "racing",
    title: "Racing",
    href: "/racing",
    tagline: "Free-roam circuit racing",
    description:
      "Open-road racing on a Kenney Racing Kit circuit — a bridge crossover, a jump, boost pads, a pit lane and a drift lot. Four cars with their own grip and speed, speed traps, drift scores and collectible tokens. Online rooms are coming next.",
    genres: ["3D", "Racing", "Free roam"],
    badge: "New",
    art: "bg-[radial-gradient(120%_100%_at_20%_0%,#38bdf8_0%,#1e3a8a_45%,#070b1c_100%)]",
    accent: "text-sky-300",
    cta: "Hit the road",
    controls: [
      ["RT / W", "Accelerate"],
      ["LT / S", "Brake · reverse"],
      ["Stick / A D", "Steer"],
      ["B / Space", "Handbrake"],
      ["Y / C", "Camera"],
    ],
  },
  {
    id: "jungle-jeep",
    title: "Jungle Jeep",
    href: "/jeep",
    tagline: "Open-world jungle — explore on foot, drive anywhere",
    description:
      "An open-world jungle: start as the on-foot explorer (Kenney animated character) — walk, sprint and jump through the undergrowth — then hop into a detailed 3D jeep and drive off. Rocky climbs, deep ruts, a wooden bridge, a stream ford, a steam train on a jungle railway and the suburban town of Port Marin past the rim — reachable by a paved mountain road with a level crossing. 26 selectable rides (Kenney Car Kit) and wildlife that scatters as you thunder past.",
    genres: ["3D", "Driving", "Open World"],
    badge: "New",
    art: "bg-[radial-gradient(120%_100%_at_20%_0%,#2f7d32_0%,#134615_45%,#071f0a_100%)]",
    accent: "text-lime-300",
    cta: "Explore",
    controls: [
      ["F / E / Y", "Enter · exit vehicle"],
      ["RT / A / W", "Accelerate · walk"],
      ["LT / S", "Brake · reverse"],
      ["Stick / WASD", "Steer · walk"],
      ["Shift / Space", "Sprint · jump (on foot)"],
      ["Y / C", "Camera"],
    ],
  },
  {
    id: "dune-glide",
    title: "Dune Glide",
    href: "/play",
    tagline: "Endless seeded sandboarding",
    description:
      "Carve an endless desert on a sandboard. Charge jumps off dune lips, spin mid-air and stick the landing — clean landings build the combo, a crash ends the run.",
    genres: ["2D", "Arcade", "Endless"],
    art: "bg-[radial-gradient(120%_100%_at_20%_0%,#f2b06b_0%,#8a5844_45%,#2a1530_100%)]",
    accent: "text-amber-300",
    cta: "Ride now",
    controls: [
      ["A hold", "Charge jump"],
      ["Stick X / LT RT", "Spin"],
      ["RB / X", "Boost"],
      ["Start", "Pause"],
    ],
  },
];
