import type { Metadata } from "next";
import JeepShell from "@/components/jeep/JeepShell";

export const metadata: Metadata = {
  title: "Jungle Jeep — open-world 4×4 off-road simulator",
  description:
    "Explore an open-world jungle on foot as the explorer, then hop into a detailed 3D jeep: rocky climbs, deep ruts, a wooden bridge and a stream ford. Fully gamepad-compatible with rumble.",
};

export default function JeepPage() {
  return <JeepShell />;
}
