import { lessons } from "@/content/lessons";
import { storyBySlug } from "@/content/stories";

/*
  Newsletter emails. Table layout and inline styles, because that's what email clients render
  reliably. Every email carries who it's from and a one-click unsubscribe (Spam Act 2003).
*/

export type Block =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "story"; slug: string }
  | { id: string; type: "lesson"; slug: string }
  | { id: string; type: "webinar"; webinarId: string }
  | { id: string; type: "button"; label: string; url: string }
  | { id: string; type: "image"; src: string; alt: string }
  | { id: string; type: "divider" };

export type WebinarCard = { id: string; title: string; summary: string; presenter: string; minutes: number; thumbnail: string | null };
export type RenderContext = { firstName: string; baseUrl: string; unsubscribeUrl: string; webinars: Map<string, WebinarCard> };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const personal = (s: string, ctx: RenderContext) => s.replace(/\{\{\s*first_name\s*\}\}/g, ctx.firstName);
const abs = (url: string, base: string) => (/^https?:\/\//.test(url) ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`);
const NAVY = "#102a43";
const TEAL = "#0e7c7b";
const FONT = "font-family:Arial,Helvetica,sans-serif;";

function card(img: string | null, eyebrow: string, title: string, body: string, href: string, cta: string) {
  return `<tr><td style="padding:8px 24px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dfe7ef;border-radius:14px;overflow:hidden">
    ${img ? `<tr><td><a href="${esc(href)}"><img src="${esc(img)}" width="550" alt="" style="display:block;width:100%;max-width:550px;height:auto;border:0"></a></td></tr>` : ""}
    <tr><td style="padding:16px 18px 18px;${FONT}">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:${TEAL}">${esc(eyebrow)}</p>
      <p style="margin:0 0 8px;font-size:19px;line-height:1.3;font-weight:bold;color:${NAVY}">${esc(title)}</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155">${esc(body)}</p>
      <a href="${esc(href)}" style="font-size:15px;font-weight:bold;color:${TEAL};text-decoration:none">${esc(cta)} &rarr;</a>
    </td></tr>
  </table></td></tr>`;
}

export function renderEmail(c: { subject: string; preheader: string; blocks: Block[] }, ctx: RenderContext) {
  const rows: string[] = [];
  const text: string[] = [];
  for (const b of c.blocks) {
    switch (b.type) {
      case "heading":
        rows.push(
          `<tr><td style="padding:20px 24px 4px;${FONT}font-size:24px;line-height:1.25;font-weight:bold;color:${NAVY}">${esc(personal(b.text, ctx))}</td></tr>`,
        );
        text.push(personal(b.text, ctx).toUpperCase(), "");
        break;
      case "text":
        rows.push(
          `<tr><td style="padding:8px 24px;${FONT}font-size:16px;line-height:1.6;color:#1e293b">${esc(personal(b.text, ctx))
            .split(/\n{2,}/)
            .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`)
            .join("")}</td></tr>`,
        );
        text.push(personal(b.text, ctx), "");
        break;
      case "story": {
        const s = storyBySlug(b.slug);
        if (!s) break;
        const href = `${ctx.baseUrl}/news/${s.slug}`;
        rows.push(card(s.visual.photo ? abs(s.visual.photo.src, ctx.baseUrl) : null, "News", s.title, s.dek, href, "Read more"));
        text.push(`${s.title}\n${s.dek}\n${href}`, "");
        break;
      }
      case "lesson": {
        const l = lessons.find((x) => x.slug === b.slug);
        if (!l) break;
        const href = `${ctx.baseUrl}/learning/${l.slug}`;
        rows.push(
          card(l.visual.photo ? abs(l.visual.photo.src, ctx.baseUrl) : null, `Lesson · ${l.minutes} min`, l.title, l.summary, href, "Start the lesson"),
        );
        text.push(`${l.title} (${l.minutes} min lesson)\n${l.summary}\n${href}`, "");
        break;
      }
      case "webinar": {
        const w = ctx.webinars.get(b.webinarId);
        if (!w) break;
        const href = `${ctx.baseUrl}/webinars/${w.id}`;
        rows.push(
          card(
            w.thumbnail ? abs(w.thumbnail, ctx.baseUrl) : null,
            `Webinar · ${w.minutes} min${w.presenter ? ` · ${w.presenter}` : ""}`,
            w.title,
            w.summary,
            href,
            "Watch the recording",
          ),
        );
        text.push(`${w.title} (webinar recording)\n${w.summary}\n${href}`, "");
        break;
      }
      case "button":
        rows.push(
          `<tr><td style="padding:12px 24px 20px" align="center"><a href="${esc(abs(b.url, ctx.baseUrl))}" style="display:inline-block;background:${TEAL};color:#ffffff;${FONT}font-size:16px;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:999px">${esc(b.label)}</a></td></tr>`,
        );
        text.push(`${b.label}: ${abs(b.url, ctx.baseUrl)}`, "");
        break;
      case "image":
        rows.push(
          `<tr><td style="padding:8px 24px"><img src="${esc(abs(b.src, ctx.baseUrl))}" width="550" alt="${esc(b.alt)}" style="display:block;width:100%;max-width:550px;height:auto;border:0;border-radius:14px"></td></tr>`,
        );
        break;
      case "divider":
        rows.push(`<tr><td style="padding:12px 24px"><div style="border-top:1px solid #dfe7ef;font-size:0;line-height:0">&nbsp;</div></td></tr>`);
        text.push("----", "");
        break;
    }
  }

  const footer = `You’re receiving this because you work with Trilogy Care as a service partner or care coordinator.`;
  const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef4f9">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(c.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden">
  <tr><td style="background:${NAVY};padding:20px 24px;${FONT}color:#ffffff"><span style="font-size:20px;font-weight:bold">Trilogy Care</span> <span style="font-size:14px;opacity:.8">&nbsp;Partner Hub</span></td></tr>
  ${rows.join("\n")}
  <tr><td style="padding:24px;background:#f6f9fc;${FONT}font-size:12px;line-height:1.6;color:#64748b">
    ${esc(footer)}<br>Sent by Trilogy Care, Partner Hub team.<br>
    <a href="${esc(ctx.unsubscribeUrl)}" style="color:#64748b">Unsubscribe from newsletters</a> &middot; <a href="${esc(ctx.baseUrl)}" style="color:#64748b">Open the Partner Hub</a>
  </td></tr>
</table></td></tr></table></body></html>`;

  const body = [`${c.preheader}`, "", ...text, footer, "Sent by Trilogy Care, Partner Hub team.", `Unsubscribe: ${ctx.unsubscribeUrl}`].join("\n");
  return { html, text: body };
}
