import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/** This Mac's network addresses: Wi-Fi and wired can both be connected at once. */
const localAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a!.address);

const nextConfig: NextConfig = {
  /* config options here */
  // Lets reviewers on the office network open the dev server at any of this Mac's addresses (Wi-Fi
  // and wired), read when the server starts. Without it the page never starts in their browser.
  allowedDevOrigins: localAddresses(),
  cacheComponents: true,
  partialPrefetching: true,
  // Topics used to live at /learning. Old links keep working: shared and QR links (/learning/s/…),
  // emails, Inbox items, bookmarks and search results all land on the same page under /topics.
  async redirects() {
    return [
      { source: "/learning", destination: "/topics", permanent: true },
      { source: "/learning/:path*", destination: "/topics/:path*", permanent: true },
    ];
  },
  experimental: {
    // The dev server's build cache, kept on disk between restarts, kept coming back in a state where
    // it told every open page to reload over and over (the page never finished loading). Without it
    // the first load after a restart takes a few seconds longer, and the loop doesn't return.
    turbopackFileSystemCacheForDev: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
