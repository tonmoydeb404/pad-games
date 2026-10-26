import type { Metadata } from "next";
import { JeepShell } from "@/components/game/jeep-shell";

export const metadata: Metadata = {
  title: "TinTin — open-world jungle survival",
  description:
    "Roam an open-world jungle on foot, ride animals or take the jeep out on the trail. Built for gamepad and keyboard.",
};

export default function JeepPage() {
  return <JeepShell />;
}
