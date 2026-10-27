import { Icon } from "../Icon";

/* On a lesson's start screen: important changes published since the version this person last did. */
export function ChangesNotice({ changes }: { changes: { version: string; notes: string; at: string }[] }) {
  return (
    <div role="status" className="rounded-2xl bg-gold/15 p-3 text-sm ring-1 ring-gold/60">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="refresh" className="size-4" /> Updated since you last did this lesson
      </p>
      <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-6">
        {changes.map((c) => (
          <li key={c.version}>{c.notes || `Version ${c.version} has important changes.`}</li>
        ))}
      </ul>
    </div>
  );
}
