import { handle } from "@/server/http";
import { canAuthor, canReport, isSuperadmin } from "@/server/auth";
import { demoUsers } from "@/server/db";
import { demoOffsetMs } from "@/server/clock";
import { pictureUrl } from "@/server/profilePictures";

export async function GET() {
  return handle(({ db, user }) => ({
    user: { id: user.id, name: user.name, role: user.role, audience: user.audience, serviceRole: user.service_role, language: user.language ?? "en", avatar: pictureUrl(user.avatar ?? null) },
    org: db.prepare("SELECT name FROM orgs WHERE id = ?").get(user.org_id),
    canAuthor: canAuthor(user),
    canReport: canReport(user),
    isSuperadmin: isSuperadmin(user),
    demoUsers: demoUsers.map((u) => ({ id: u.id, name: u.name, label: u.label })),
    demoClockOffsetDays: Math.round(demoOffsetMs(db) / 86_400_000),
  }));
}
