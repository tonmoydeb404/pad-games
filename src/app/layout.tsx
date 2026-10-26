import type { Metadata, Viewport } from "next";
import { Big_Shoulders_Stencil, IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";

// Stencil caps like the lettering on jerry cans and supply crates, a condensed
// grotesque for reading, and a plain mono for readouts.
const stencil = Big_Shoulders_Stencil({ variable: "--font-stencil", subsets: ["latin"] });
const body = IBM_Plex_Sans_Condensed({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600"] });
const data = IBM_Plex_Mono({ variable: "--font-data", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "TinTin — open-world jungle survival",
  description:
    "An open-world jungle survival sandbox in the browser: roam, ride, and build a home in the wild. Fully playable with a gamepad.",
};

export const viewport: Viewport = {
  themeColor: "#070b1c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${stencil.variable} ${body.variable} ${data.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
