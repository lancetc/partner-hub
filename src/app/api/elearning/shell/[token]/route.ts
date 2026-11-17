import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { contentClaims } from "@/server/elearning/content";

/*
  The player shell, on the content origin. The Hub page frames it; it frames the course. It runs the
  SCORM runtime (scorm-again) as window.API (SCORM 1.2) or window.API_1484_11 (SCORM 2004), so the
  course finds it the standard way, by looking up through its parent frames, and every call is answered
  at once from state restored before the course starts. Saves go to the Hub page by postMessage, to the
  Hub's origin only; the Hub page saves them with the learner's sign-in, which this origin never sees.
*/

const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export async function GET(req: Request, ctx: RouteContext<"/api/elearning/shell/[token]">) {
  await connection();
  const { token } = await ctx.params;
  const claims = contentClaims(req, token);
  if (claims instanceof Response) return claims;
  const v = getDb().prepare("SELECT standard, launch_href FROM scorm_package_versions WHERE id = ?").get(claims.version) as
    | { standard: "scorm12" | "scorm2004"; launch_href: string }
    | undefined;
  if (!v) return new Response("Not found", { status: 404 });
  const nonce = randomBytes(16).toString("base64");
  const launch = v.launch_href
    .split("?")
    .map((part, i) => (i === 0 ? part.split("/").map(encodeURIComponent).join("/") : part))
    .join("?");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Course</title>
<style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;display:block;width:100%;height:100%}</style>
<script nonce="${nonce}" src="/api/elearning/runtime/${v.standard}.js"></script>
</head><body>
<script nonce="${nonce}">
(function () {
  "use strict";
  var HUB = ${json(claims.hub)};
  var STD = ${json(v.standard)};
  var BASE = "/api/elearning/content/" + ${json(token)} + "/";
  var LAUNCH = ${json(launch)};
  var seq = 0, api = null, started = false;

  function post(msg) { window.parent.postMessage(msg, HUB); }

  // Commits arrive as nested { cmi: { core: {...} } } or already flattened; either way, send "cmi.core.x": "value".
  function flatten(obj, prefix, out) {
    Object.keys(obj).forEach(function (k) {
      var v = obj[k], key = prefix ? prefix + "." + k : k;
      if (v !== null && typeof v === "object") flatten(v, key, out);
      else if (v !== undefined && v !== null) out[key] = String(v);
    });
    return out;
  }

  // scorm-again's commit service: answers the course at once, and hands the data to the Hub page to save.
  var service = {
    processHttpRequest: function (url, params, immediate, apiLog, processListeners, metadata) {
      seq += 1;
      var data = params && typeof params === "object" && params.cmi && typeof params.cmi === "object" ? flatten(params.cmi, "cmi", {}) : flatten(params || {}, "", {});
      post({ type: "scorm:save", seq: seq, terminate: Boolean(metadata && metadata.isTerminateCommit), data: data });
      return { result: true, errorCode: 0 };
    },
    updateSettings: function () {}
  };

  function start(data) {
    if (started) return;
    started = true;
    var Api = STD === "scorm12" ? window.Scorm12API : window.Scorm2004API;
    api = new Api({
      lmsCommitUrl: "hub",
      autocommit: false,
      sendFullCommit: true,
      dataCommitFormat: "flattened",
      renderCommonCommitFields: false,
      autoCompleteLessonStatus: false,
      logLevel: 4,
      httpService: service
    });
    api.loadFromFlattenedJSON(data || {});
    if (STD === "scorm12") window.API = api; else window.API_1484_11 = api;
    api.on(STD === "scorm12" ? "LMSInitialize" : "Initialize", function () { post({ type: "scorm:initialized" }); });
    api.on(STD === "scorm12" ? "LMSFinish" : "Terminate", function () { post({ type: "scorm:finished" }); });
    var frame = document.createElement("iframe");
    frame.title = "Course content";
    frame.allow = "fullscreen; autoplay";
    frame.src = BASE + LAUNCH;
    document.body.appendChild(frame);
  }

  // The Hub asks the course to finish (Exit Course): end the session the SCORM way, which saves.
  function finish() {
    try {
      if (api && api.isInitialized() && !api.isTerminated()) {
        if (STD === "scorm12") api.LMSFinish(""); else api.Terminate("");
      }
    } catch (e) {}
    post({ type: "scorm:exited" });
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== HUB || e.source !== window.parent) return;
    var m = e.data || {};
    if (m.type === "hub:start") start(m.data);
    else if (m.type === "hub:exit") finish();
  });
  post({ type: "scorm:ready" });
})();
</script>
</body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      // Only the Hub may frame the shell; only the shell's own scripts run here.
      "content-security-policy": `frame-ancestors ${claims.hub}; script-src 'nonce-${nonce}' 'self'; object-src 'none'; base-uri 'none'`,
    },
  });
}
