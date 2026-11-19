import type { Metadata } from "next";
import { ImageLibraryAdmin } from "@/components/admin/ImageLibraryAdmin";

export const metadata: Metadata = { title: "Image library" };

export default function AdminImagesPage() {
  return <ImageLibraryAdmin />;
}
