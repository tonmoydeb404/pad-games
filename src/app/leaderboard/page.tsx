import type { Metadata } from "next";
import LeaderboardView from "@/components/LeaderboardView";

export const metadata: Metadata = {
  title: "Leaderboard — Dune Glide",
  description: "Daily seed and free ride rankings.",
};

export default function LeaderboardPage() {
  return <LeaderboardView />;
}
