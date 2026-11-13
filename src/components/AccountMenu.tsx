"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { UserAvatar } from "./UserAvatar";
import { PICTURE_CHANGED } from "./ProfilePicture";
import { resetHub, setHub, useHub } from "@/lib/store";
import { api, useApi, type Me } from "@/lib/api";
import { LANGUAGES } from "@/lib/languages";
import { pendingFor } from "@/lib/outbox";
import { clearOfflineData } from "@/lib/offlineLessons";
import { confirmAction } from "@/lib/confirm";

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const flaky = useHub((s) => s.demo.flakyNetwork);
  const savedCount = useHub((s) => s.saved.length);
  const meApi = useApi<Me>("/api/me");
  const me = meApi.data;
  // A new or removed profile picture shows straight away.
  const reloadMe = meApi.reload;
  useEffect(() => {
    window.addEventListener(PICTURE_CHANGED, reloadMe);
    return () => window.removeEventListener(PICTURE_CHANGED, reloadMe);
  }, [reloadMe]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-muted";
  const initials = me
    ? me.user.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
    : "··";

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        className="ml-1 inline-flex size-11 items-center justify-center overflow-hidden rounded-full bg-navy font-mulish text-sm font-bold text-white ring-offset-2 ring-offset-bg hover:ring-2 hover:ring-action dark:bg-teal-bright dark:text-navy"
      >
        {me?.user.avatar ? <UserAvatar name={me.user.name} src={me.user.avatar} className="size-11" /> : initials}
      </button>
      {open && (
        <div
          id="account-menu"
          className="absolute right-0 top-14 max-h-[calc(100dvh-5rem)] w-80 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-xl"
        >
          <div className="px-3 py-2">
            <p className="font-semibold" translate="no">
              {me?.user.name ?? "Loading…"}
            </p>
            <p className="text-sm text-ink-muted">{me ? `${me.demoUsers.find((u) => u.id === me.user.id)?.label} · demo account` : ""}</p>
          </div>
          <hr className="my-1 border-line" />
          <Link href="/settings" className={item} onClick={() => setOpen(false)}>
            <Icon name="user" /> Profile and settings
            {me && me.user.language !== "en" && (
              <span className="ml-auto text-sm text-ink-muted" translate="no">
                {LANGUAGES.find((l) => l.code === me.user.language)?.native}
              </span>
            )}
          </Link>
          <Link href="/saved" className={item} onClick={() => setOpen(false)}>
            <Icon name="bookmark" /> Saved items {savedCount > 0 && <span className="ml-auto text-sm text-ink-muted">{savedCount}</span>}
          </Link>
          <Link href="/onboarding" className={item} onClick={() => setOpen(false)}>
            <Icon name="list" /> My onboarding
          </Link>
          {me?.canReport && (
            <Link href={me.canAuthor ? "/admin/lessons" : "/admin/learning-paths"} className={item} onClick={() => setOpen(false)}>
              <Icon name="route" /> Administration
            </Link>
          )}
          {/* Prototype: clears the sign-in and goes to the sign-in page, where any button signs in as the demo author. */}
          <button
            type="button"
            className={item}
            onClick={async () => {
              setOpen(false);
              // Nothing kept for offline use stays on the device for the next person.
              await clearOfflineData().catch(() => {});
              await api("/api/demo/session", { method: "DELETE" }).catch(() => {});
              // A full load, so nothing of the signed-out person stays in memory.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/login");
            }}
          >
            <Icon name="arrow-left" /> Sign out
          </button>
          <hr className="my-1 border-line" />
          <p className="px-3 pt-2 font-mulish text-xs font-bold uppercase tracking-wider text-ink-muted">Prototype controls</p>
          {me && (
            <label className="flex flex-col gap-1 px-3 py-2 text-sm">
              <span className="font-medium">Signed in as (demo)</span>
              <select
                value={me.user.id}
                onChange={async (e) => {
                  const next = e.target.value;
                  // Shared device: saves waiting to sync stay with this person (they send next time they sign in),
                  // and nothing kept for offline use is shown to the next person.
                  const waiting = (await pendingFor(me.user.id)).length;
                  if (
                    waiting &&
                    !(await confirmAction(
                      `${waiting} ${waiting === 1 ? "save hasn’t" : "saves haven’t"} synced yet. They’ll send next time ${me.user.name.split(" ")[0]} signs in on this device.`,
                      { title: "Switch account?", confirmLabel: "Switch anyway" },
                    ))
                  ) {
                    e.target.value = me.user.id;
                    return;
                  }
                  await clearOfflineData().catch(() => {});
                  await api("/api/demo/session", { body: { userId: next } });
                  window.location.reload();
                }}
                className="min-h-11 rounded-lg border border-line-strong bg-surface px-2 text-[0.95rem]"
              >
                {me.demoUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}: {u.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={item + " cursor-pointer"}>
            <input
              type="checkbox"
              checked={flaky}
              onChange={(e) => setHub((s) => ({ ...s, demo: { ...s.demo, flakyNetwork: e.target.checked } }))}
              className="size-5 accent-[var(--action)]"
            />
            Simulate weak connection
          </label>
          <button
            type="button"
            className={item}
            onClick={async () => {
              if (
                await confirmAction("Demo progress, saved items and onboarding stored in this browser are cleared. Server records are kept.", {
                  title: "Reset browser demo data?",
                  confirmLabel: "Reset",
                  danger: true,
                })
              ) {
                resetHub();
                setOpen(false);
              }
            }}
          >
            <Icon name="refresh" /> Reset browser demo data
          </button>
        </div>
      )}
    </div>
  );
}
