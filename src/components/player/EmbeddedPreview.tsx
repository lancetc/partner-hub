"use client";

import { EmbeddedClose } from "./Frame";

/** The player inside the lesson editor's preview window: closing it tells the editor to close the window. */
export function EmbeddedPreview({ children }: { children: React.ReactNode }) {
  const close = () => window.parent.postMessage({ type: "tc-preview-close" }, window.location.origin);
  return <EmbeddedClose.Provider value={close}>{children}</EmbeddedClose.Provider>;
}
