import type { Metadata } from "next";

/* Administration is for Trilogy's authors and organisation admins: keep every page out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
