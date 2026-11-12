import type { Metadata } from "next";
import { Explorer } from "@/components/explorer/Explorer";

export const metadata: Metadata = {
  title: "Neighbourhood Explorer",
  description: "Walk a pixel-art neighbourhood, visit clients and decide what to do in everyday aged care situations.",
  alternates: { canonical: "/explorer" },
};

export default function ExplorerPage() {
  return <Explorer />;
}
