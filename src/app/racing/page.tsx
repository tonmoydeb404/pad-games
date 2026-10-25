import type { Metadata } from "next";
import RacingShell from "@/components/racing/RacingShell";

export const metadata: Metadata = {
  title: "Racing — Free roam circuit",
  description:
    "Free-roam racing on a Kenney Racing Kit circuit: a bridge crossover, a jump, boost pads and a drift lot. Speed traps, drift scores and tokens. Fully gamepad-compatible with rumble.",
};

export default function RacingPage() {
  return <RacingShell />;
}
