import type { Metadata } from "next";
import StoreView from "@/components/store/StoreView";

export const metadata: Metadata = {
  title: "Pad·Games — a gamepad-first browser arcade",
  description:
    "A tiny game store: Dune Glide, Arena and Jungle Jeep. Every game runs in the browser and is fully playable with a gamepad.",
};

export default function Home() {
  return (
    <main className="relative flex-1">
      <StoreView />
    </main>
  );
}
