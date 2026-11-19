import type { Metadata } from "next";
import { MagazineAdmin } from "@/components/admin/MagazineAdmin";

export const metadata: Metadata = { title: "Magazine" };

export default function AdminMagazinePage() {
  return <MagazineAdmin />;
}
