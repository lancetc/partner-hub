"use client";

import { useEffect } from "react";
import { useApi, type Me } from "@/lib/api";

/*
  Google Translate for people who chose another language in Profile and settings. Nothing from
  Google loads for anyone reading in English. Google's widget reads the "googtrans" cookie and
  translates the page as it renders; the admin area is marked translate="no" so editing isn't disturbed.
*/

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: { translate?: { TranslateElement: new (opts: Record<string, unknown>, el: string) => unknown } };
  }
}

const COOKIE = "googtrans";

export function translationCookie() {
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.split("=")[1] ?? ""
  );
}

/** Points Google Translate at a language ("en" switches it off). The page needs a reload to apply it. */
export function setTranslation(code: string) {
  const host = location.hostname;
  // Google sets the cookie on the bare host and the parent domain; clear both, then set ours.
  for (const domain of ["", `; domain=${host}`, `; domain=.${host.split(".").slice(-2).join(".")}`])
    document.cookie = `${COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${domain}`;
  if (code !== "en") document.cookie = `${COOKIE}=/en/${code}; path=/; max-age=31536000; samesite=lax`;
}

/*
  Google Translate swaps text nodes for its own, which React doesn't expect: removing or inserting
  next to a node that has moved would throw. While translating, let those calls quietly succeed.
*/
let patched = false;
function tolerateTranslatedNodes() {
  if (patched || typeof Node === "undefined") return;
  patched = true;
  const remove = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return remove.call(this, child) as T;
  };
  const insert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return node;
    return insert.call(this, node, ref) as T;
  };
}

/*
  Google's own toolbar and hover popups are hidden: the language is chosen in the profile, and the
  toolbar would push the page down. Added here rather than in globals.css so it only exists while translating.
*/
const HIDE_GOOGLE_UI = `
iframe.skiptranslate, .goog-te-banner-frame, #goog-gt-tt, .goog-te-balloon-frame,
.VIpgJd-ZVi9od-ORHb-OEVmcd, .VIpgJd-ZVi9od-aZ2wEe-wOHMyf { display: none !important; }
body { top: 0 !important; position: static !important; }
.goog-text-highlight { background: none !important; box-shadow: none !important; }`;

function loadGoogle() {
  if (document.getElementById("google-translate-script")) return;
  tolerateTranslatedNodes();
  const style = document.createElement("style");
  style.id = "google-translate-hide";
  style.textContent = HIDE_GOOGLE_UI;
  document.head.appendChild(style);
  window.googleTranslateElementInit = () => {
    if (!window.google?.translate) return;
    new window.google.translate.TranslateElement({ pageLanguage: "en", autoDisplay: false }, "google-translate-host");
  };
  const s = document.createElement("script");
  s.id = "google-translate-script";
  s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  s.async = true;
  document.body.appendChild(s);
}

export function SiteTranslator() {
  const language = useApi<Me>("/api/me").data?.user.language;
  useEffect(() => {
    if (!language) return;
    const want = language === "en" ? "" : `/en/${language}`;
    // Keep this browser in step with the account's choice (it may have been set on another device).
    if (translationCookie() !== want) {
      setTranslation(language);
      // Reload only if the cookie took (a browser blocking cookies would otherwise reload forever).
      if (translationCookie() === want) location.reload();
      return;
    }
    if (language !== "en") loadGoogle();
  }, [language]);
  return <div id="google-translate-host" hidden />;
}
