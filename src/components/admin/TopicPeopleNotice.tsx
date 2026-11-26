"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import type { TopicPerson } from "@/server/peopleInContent";
import { Icon } from "../Icon";

/*
  In the Topic editor's publish step: the people this Topic introduces to the character library, and where their
  portraits stand (docs/character-photos.md). A note only: it never holds up publishing.
*/

const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

export function TopicPeopleNotice({ slug }: { slug: string }) {
  const data = useApi<{ people: TopicPerson[] }>(`/api/admin/characters/people?slug=${encodeURIComponent(slug)}`).data;
  const people = data?.people ?? [];
  const names = (s: TopicPerson["state"]) => people.filter((p) => p.state === s).map((p) => p.name);
  const lines = [
    names("will-make").length > 0 &&
      `This Topic introduces ${list(names("will-make"))}. ${names("will-make").length === 1 ? "Their character photo is" : "Their character photos are"} made when it’s published.`,
    names("making").length > 0 && `${list(names("making"))}: ${names("making").length === 1 ? "their character photo is" : "character photos are"} being made.`,
    names("needs-description").length > 0 &&
      `${list(names("needs-description"))} ${names("needs-description").length === 1 ? "needs" : "need"} a description before a character photo can be made: the Topic doesn’t say whether they’re a man or a woman.`,
    names("failed").length > 0 && `${list(names("failed"))}: the character photo didn’t generate. Try again from Character photos.`,
  ].filter((x): x is string => Boolean(x));
  if (!lines.length) return null;
  return (
    <div role="status" className="flex gap-3 rounded-2xl bg-tealtint p-4 text-sm">
      <Icon name="people" className="mt-0.5 size-5 shrink-0 text-accent" />
      <div className="flex flex-col gap-1">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <p>
          <Link href="/admin/images/characters" className="text-accent underline">
            Character photos
          </Link>{" "}
          keeps one portrait of each person, used whenever a new picture of them is made. Publishing doesn’t wait for it.
        </p>
      </div>
    </div>
  );
}
