// Temporary: deletes the "ZZ Test One Day map" course and everything recorded against it. Refuses anything not titled "ZZ Test".
import path from "node:path";
import { openDb } from "@/server/db";

const ID = "mag-4801cedf0f8b";
const db = openDb(path.join(process.cwd(), "data", "hub.sqlite"));
const g = db.prepare("SELECT id, title FROM magazine_guides WHERE id = ?").get(ID) as { id: string; title: string } | undefined;
if (!g) throw new Error("Not found");
if (!g.title.startsWith("ZZ Test")) throw new Error(`Refusing: "${g.title}" isn't a ZZ Test course.`);
const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
  .map((t) => t.name)
  .filter((t) => t !== "magazine_guides" && (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((c) => c.name === "guide_id"));
db.exec("BEGIN");
for (const t of tables) {
  const n = db.prepare(`DELETE FROM ${t} WHERE guide_id = ?`).run(ID).changes;
  if (n) console.log(`${t}: ${n}`);
}
db.prepare("DELETE FROM magazine_guides WHERE id = ?").run(ID);
db.exec("COMMIT");
console.log(`deleted ${g.title}`);
