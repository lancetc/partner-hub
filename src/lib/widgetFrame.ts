/*
  The page a widget runs in. It goes into an <iframe sandbox="allow-scripts"> as srcdoc, so the
  widget gets a blank origin of its own: no cookies, no access to the lesson page, the learner's
  account or the API. The Content-Security-Policy comes first so it applies before any widget code,
  and blocks every network request (scripts, styles, images, fetch) except what's inline.
*/

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:";

/** The brand colours widgets are asked to use (see server/widgetGen.ts). Fixed, so a widget looks the same in dark mode. */
const BASE_CSS = `
:root{--navy:#2d4875;--teal:#0e7c7b;--teal-light:#ddf2f3;--mist:#e8eef6;--ink:#102a43;--ink-muted:#3d5068;--line:rgb(16 42 67/.14);--white:#fff;--danger:#d32f2f;--radius:16px;
--font:Mulish,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color-scheme:light}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--ink);font:16px/1.5 var(--font)}
body{padding:16px;overflow-x:hidden;display:flow-root}
button,input,select,textarea{font:inherit}
:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
`;

/**
  Ours, before the widget's own code: tells the lesson how tall the widget is, and when the learner
  first uses it (for "Try the widget to continue"). Messages carry the frame's token.
*/
const bridge = (token: string) => `
(function(){var t=${JSON.stringify(token)},used=false,last=0;
function send(m){parent.postMessage(Object.assign({widget:t},m),"*")}
function size(){var b=document.body;if(!b)return;var h=Math.ceil(b.getBoundingClientRect().height);if(h!==last){last=h;send({height:h})}}
function use(){if(!used){used=true;send({used:true})}}
["pointerdown","keydown","input","change"].forEach(function(e){addEventListener(e,use,true)});
addEventListener("load",function(){size();new ResizeObserver(size).observe(document.body)});setInterval(size,1000);
})();`;

export function widgetDocument(html: string, token: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS}</style><script>${bridge(token)}</script></head><body>${html}</body></html>`;
}

export type WidgetMessage = { widget: string; height?: number; used?: boolean };
