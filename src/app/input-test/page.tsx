import type { Metadata } from "next";
import InputTestView from "@/components/InputTestView";

export const metadata: Metadata = {
  title: "Input test — Dune Glide",
  description: "Gamepad mapping, axes, buttons and rumble check.",
};

export default function InputTestPage() {
  return <InputTestView />;
}
