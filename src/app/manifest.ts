import type { MetadataRoute } from "next";

/* Lets people install the hub on their phone's home screen, so it opens like an app and keeps its offline lessons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trilogy Care Partner Hub",
    short_name: "Partner Hub",
    description: "News, practical learning and onboarding for Trilogy Care service partners and care coordinators.",
    start_url: "/learning",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#102a43",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
