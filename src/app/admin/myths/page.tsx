import type { Metadata } from "next";
import { MythLibrary } from "@/components/admin/MythLibrary";

export const metadata: Metadata = { title: "Myth vs Reality" };

export default function AdminMythsPage() {
  return <MythLibrary />;
}
