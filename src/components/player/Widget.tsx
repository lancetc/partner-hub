"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { widgetDocument, type WidgetMessage } from "@/lib/widgetFrame";

/**
  A widget built for the card (an animated diagram, a calculator, a game), run in a sandboxed frame.
  `onUse` fires the first time the learner presses, types or drags inside it.
*/
export function Widget({ html, alt, onUse, className }: { html: string; alt: string; onUse?: () => void; className?: string }) {
  const token = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const doc = useMemo(() => widgetDocument(html, token), [html, token]);
  const used = useRef(onUse);
  useEffect(() => {
    used.current = onUse;
  }, [onUse]);

  useEffect(() => {
    const listen = (e: MessageEvent<WidgetMessage>) => {
      // Only this frame's own messages: the right window and the token we gave it.
      if (e.source !== frame.current?.contentWindow || e.data?.widget !== token) return;
      if (typeof e.data.height === "number") setHeight(Math.min(1400, Math.max(80, e.data.height)));
      if (e.data.used) used.current?.();
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [token]);

  return (
    <div className={className ?? "overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[rgb(16_42_67/0.14)]"}>
      <iframe
        ref={frame}
        title={alt || "Interactive widget"}
        sandbox="allow-scripts"
        srcDoc={doc}
        referrerPolicy="no-referrer"
        className="block w-full border-0"
        style={{ height }}
      />
    </div>
  );
}
