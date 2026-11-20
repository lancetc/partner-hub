import type { Metadata } from "next";
import { RelayAdmin } from "@/components/admin/relay/RelayAdmin";

export const metadata: Metadata = { title: "Ava Relay" };

export default function Page() {
  return <RelayAdmin />;
}
