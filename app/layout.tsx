import type { Metadata, Viewport } from "next";
import { Mukta, Tiro_Devanagari_Marathi } from "next/font/google";
import Splash from "@/components/Splash";
import "./globals.css";

const mukta = Mukta({
  variable: "--font-mukta",
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const tiro = Tiro_Devanagari_Marathi({
  variable: "--font-tiro",
  subsets: ["devanagari", "latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Discover Nashik — Kumbh Pilgrim Companion",
  description:
    "Map-first voice guide for Nashik Kumbh pilgrims. Find temples, ghats, food, hospitals and more — in Marathi, Hindi or English.",
  keywords: ["Nashik", "Kumbh", "pilgrimage", "temples", "ghats", "Panchavati"],
  manifest: "/manifest.webmanifest",
  applicationName: "Discover Nashik",
  appleWebApp: { capable: true, title: "Nashik", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7B1B2A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the splash script sets data-splash before React hydrates.
    <html lang="en" className={`${mukta.variable} ${tiro.variable} h-full`} suppressHydrationWarning>
      <body className="h-full overflow-hidden">
        <Splash />
        {children}
      </body>
    </html>
  );
}
