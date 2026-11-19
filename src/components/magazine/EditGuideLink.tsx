import Link from "next/link";
import { Icon } from "../Icon";

/** For authors reading a Magazine: a way straight into its editor (on the page they're reading). */
export function EditGuideLink({ id, pageId }: { id: string; pageId?: string }) {
  return (
    <div className="mx-auto flex max-w-7xl justify-end px-4 pt-4 sm:px-6">
      <Link
        href={`/admin/magazine/${encodeURIComponent(id)}${pageId ? `?page=${encodeURIComponent(pageId)}` : ""}`}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold hover:bg-muted"
      >
        <Icon name="pen" className="size-4" /> Edit
      </Link>
    </div>
  );
}
