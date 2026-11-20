import { Suspense } from "react";
import type { Metadata } from "next";
import { CharacterStory } from "@/components/admin/story/CharacterStory";

export const metadata: Metadata = { title: "Character" };

export default function Page({ params }: PageProps<"/admin/characters/[id]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: Pick<PageProps<"/admin/characters/[id]">, "params">) {
  const { id } = await params;
  return <CharacterStory id={id} />;
}
