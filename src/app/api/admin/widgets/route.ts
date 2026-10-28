import { body, handle } from "@/server/http";
import { buildWidget, type WidgetInput } from "@/server/widgetGen";

/** Build a widget from a description, or change one: `{ request, html?, change?, lesson?, heading? }`. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => buildWidget(db, user, await body<WidgetInput>(req), now));
}
