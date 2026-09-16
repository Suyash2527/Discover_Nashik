import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Discover Nashik",
    short_name: "Nashik",
    description: "Digital companion for Kumbh pilgrims in Nashik — maps, voice assistant, works offline.",
    start_url: "/",
    display: "standalone",
    background_color: "#6F1824",
    theme_color: "#7B1B2A",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
