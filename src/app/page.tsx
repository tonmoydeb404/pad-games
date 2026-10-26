import type { Metadata } from "next";
import { JeepShell } from "@/components/game/jeep-shell";

export const metadata: Metadata = {
  title: "TinTin — open-world 4×4 jungle adventure",
  description:
    "Explore an open-world jungle on foot as the explorer, then hop into a detailed 3D jeep: rocky climbs, deep ruts, a wooden bridge and a stream ford. Fully gamepad-compatible with rumble.",
};

export default function JeepPage() {
  return <JeepShell />;
}
