"use client";

import { api } from "./api";

/*
  Makes one picture with the Hub's AI picture service (server/imageGen), with its house style and the Hub's default
  model, and waits for it: OpenAI answers in one go; ElevenLabs is checked every few seconds. The picture lands in the
  image library like any other, with its title and description. Used by the News writer for a story's poster and its
  suggested pictures (the owner, Nov 2026).
*/

export type MadePicture = { src: string; width: number; height: number };
type Check = { id: string; status: "pending" | "generating" | "completed" | "failed"; photo?: MadePicture; error?: string };

export async function makePicture(input: { prompt: string; aspect: "16:9" | "3:2" | "1:1"; title?: string; alt?: string }): Promise<MadePicture> {
  const options = await api<{ configured: boolean; defaultModel?: string; models: { id: string; aspects: string[] }[] }>("/api/admin/image-gen");
  if (!options.configured) throw new Error("Pictures with AI need an OpenAI or ElevenLabs key on this Hub.");
  const model = options.models.find((m) => m.id === options.defaultModel) ?? options.models[0];
  if (!model) throw new Error("No picture model is available.");
  const aspect = model.aspects.includes(input.aspect) ? input.aspect : (model.aspects.find((a) => a === "3:2" || a === "16:9") ?? model.aspects[0]);
  const first = await api<Check>("/api/admin/image-gen", {
    body: { prompt: input.prompt, model: model.id, aspect, houseStyle: true, quality: "medium", about: { title: input.title, alt: input.alt } },
  });
  if (first.status === "completed" && first.photo) return first.photo;
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const c = await api<Check>(`/api/admin/image-gen?id=${encodeURIComponent(first.id)}`);
    if (c.status === "completed" && c.photo) return c.photo;
    if (c.status === "failed") throw new Error(c.error ?? "The picture couldn’t be made.");
    if (Date.now() - started > 4 * 60_000) throw new Error("The picture is taking a long time. It may still arrive in the image library.");
  }
}
