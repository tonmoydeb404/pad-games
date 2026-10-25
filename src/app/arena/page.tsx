import type { Metadata } from "next";
import ArenaShell from "@/components/arena/ArenaShell";

export const metadata: Metadata = {
  title: "Arena — multiplayer FPS",
  description: "Low-poly free-for-all deathmatch. Jump in, shoot first.",
};

export default function ArenaPage() {
  return <ArenaShell />;
}
