import type { Metadata } from "next";
import { PocketToolPage } from "@/components/pocket/PocketToolPage";

// A staff tool for live calls (docs/pocket-playbook.md): kept out of search engines.
export const metadata: Metadata = { title: "Incident first steps", robots: { index: false, follow: false } };

/** The canonical page of a Live Call Pocket Playbook tool. The same tool opens in the Companion Drawer. */
export default function Page() {
  return <PocketToolPage id="incident-first-steps" />;
}
