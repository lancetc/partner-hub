import type { Metadata } from "next";
import { ElearningAdmin } from "@/components/admin/ElearningAdmin";

export const metadata: Metadata = { title: "eLearning" };

export default function AdminElearningPage() {
  return <ElearningAdmin />;
}
