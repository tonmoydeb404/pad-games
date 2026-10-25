import type { Metadata } from "next";
import GameShell from "@/components/GameShell";

export const metadata: Metadata = {
  title: "Play — Dune Glide",
  description: "Ride the daily seed or a random desert.",
};

export default function PlayPage() {
  return <GameShell />;
}
