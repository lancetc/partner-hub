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
