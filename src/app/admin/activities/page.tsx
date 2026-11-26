import type { Metadata } from "next";
import { ActivityCatalogueAdmin } from "@/components/admin/ActivityCatalogueAdmin";

export const metadata: Metadata = { title: "Activity Catalogue" };

export default function AdminActivitiesPage() {
  return <ActivityCatalogueAdmin />;
}
