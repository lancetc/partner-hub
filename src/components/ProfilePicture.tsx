"use client";

import { useId, useRef, useState } from "react";
import { api, type Me } from "@/lib/api";
import { Icon } from "./Icon";
import { UserAvatar } from "./UserAvatar";

/*
  Your profile picture, in Profile and settings: add one, replace it with another, or remove it and go
  back to your initials. The picture is cropped square on the server; the preview shows it the same way.
*/

const PICTURE_CHANGED = "profile-picture-changed";

export function ProfilePicture({ me, onChange }: { me: Me; onChange: (avatar: string | null) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const has = Boolean(me.user.avatar);

  async function upload(file: File) {
    setProblem(null);
    setNote(null);
    if (!file.type.startsWith("image/")) return setProblem("Choose a picture: a JPEG, PNG or WebP photo.");
    if (file.size > 10 * 1024 * 1024) return setProblem("That picture is over 10 MB. Try a smaller one.");
    setPreview(URL.createObjectURL(file));
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/me/picture", { method: "POST", body });
      const data = (await res.json()) as { avatar?: string; error?: string };
      if (!res.ok || !data.avatar) throw new Error(data.error ?? "Couldn’t save that picture.");
      onChange(data.avatar);
      window.dispatchEvent(new Event(PICTURE_CHANGED));
      setNote(has ? "Picture replaced." : "Picture added.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setPreview(null);
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setProblem(null);
    setBusy("remove");
    try {
      await api("/api/me/picture", { method: "DELETE" });
      onChange(null);
      window.dispatchEvent(new Event(PICTURE_CHANGED));
      setNote("Picture removed. Your initials show instead.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
          <img src={preview} alt="" className="size-24 rounded-full object-cover opacity-70" />
        ) : (
          <UserAvatar name={me.user.name} src={me.user.avatar} className="size-24 text-2xl" />
        )}
        {busy === "upload" && <span className="absolute inset-0 grid place-items-center rounded-full bg-black/30 text-xs font-semibold text-white">Saving…</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-semibold">Profile picture</p>
        <p className="text-sm text-ink-muted">Shown in the menu and the Community. A clear photo of your face works best; it’s cropped to a circle.</p>
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={id}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-[#008282] px-4 font-semibold text-white hover:bg-[#006b6b] has-[:disabled]:opacity-60"
          >
            <Icon name="camera" className="size-4" /> {has ? "Replace picture" : "Add a picture"}
            <input
              ref={input}
              id={id}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={busy !== null}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </label>
          {has && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={remove}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-semibold text-ink-muted hover:bg-muted hover:text-ink disabled:opacity-60"
            >
              <Icon name="trash" className="size-4" /> {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
        <p className="text-sm" role="status">
          {problem ? <span className="font-semibold text-danger">{problem}</span> : note && <span className="text-ink-muted">{note}</span>}
        </p>
      </div>
    </div>
  );
}

export { PICTURE_CHANGED };
