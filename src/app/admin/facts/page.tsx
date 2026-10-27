import type { Metadata } from "next";
import { FactsLibrary } from "@/components/admin/FactsLibrary";

export const metadata: Metadata = { title: "Facts" };

export default function AdminFactsPage() {
  return <FactsLibrary />;
}
