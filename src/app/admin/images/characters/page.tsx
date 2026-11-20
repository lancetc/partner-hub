import type { Metadata } from "next";
import { CharacterLibraryAdmin } from "@/components/admin/CharacterLibraryAdmin";

export const metadata: Metadata = { title: "Character photos" };

export default function AdminCharacterPhotosPage() {
  return <CharacterLibraryAdmin />;
}
