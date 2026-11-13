import type { Metadata } from "next";
import { PeopleAdmin } from "@/components/admin/PeopleAdmin";

export const metadata: Metadata = { title: "People and permissions" };

export default function AdminPeoplePage() {
  return <PeopleAdmin />;
}
