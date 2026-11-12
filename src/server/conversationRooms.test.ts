import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { cleanCode, hostRoom, moveRoom as moveAny, roomView, type RoomView } from "./conversationRooms";

/* Team sessions: the host moves through the deck and everyone with the code sees the same card. */

/** A move that leaves the session open returns the new view. */
const moveRoom = (...a: Parameters<typeof moveAny>) => moveAny(...a) as RoomView;

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const at = (h: number) => new Date(Date.UTC(2026, 10, 13, h));

describe("Care Conversations team sessions", () => {
  it("shows everyone who joins the same card, and only the host moves it", () => {
    const room = hostRoom(db, u("riley"), { theme: "empathy" }, at(0));
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(room).toMatchObject({ youHost: true, position: 0, total: 8, flipped: false, host: "Riley Morgan" });

    const seen = roomView(db, u("sam"), room.code.toLowerCase(), at(0));
    expect(seen).toMatchObject({ youHost: false, cardId: room.cardId });
    expect(seen.cardId.startsWith("empathy-")).toBe(true);
    expect(() => moveRoom(db, u("sam"), room.code, "next", at(0))).toThrow(/Only the person hosting/);

    const flipped = moveRoom(db, u("riley"), room.code, "flip", at(0));
    expect(flipped.flipped).toBe(true);
    const next = moveRoom(db, u("riley"), room.code, "next", at(0));
    expect(next).toMatchObject({ position: 1, flipped: false });
    expect(next.cardId).not.toBe(room.cardId);
    expect(roomView(db, u("sam"), room.code, at(0)).cardId).toBe(next.cardId);
    // Back from the first card stays on the first card.
    moveRoom(db, u("riley"), room.code, "back", at(0));
    expect(moveRoom(db, u("riley"), room.code, "back", at(0)).position).toBe(0);
  });

  it("finishes when the host ends it, or after 12 hours", () => {
    const a = hostRoom(db, u("riley"), {}, at(0));
    expect(a.total).toBe(48);
    moveRoom(db, u("riley"), a.code, "end", at(1));
    expect(() => roomView(db, u("sam"), a.code, at(1))).toThrow(/finished/);
    const b = hostRoom(db, u("riley"), {}, at(0));
    expect(() => roomView(db, u("sam"), b.code, at(13))).toThrow(/finished/);
    expect(() => roomView(db, u("sam"), "ZZZZZZ", at(0))).toThrow(/no session/);
  });

  it("tidies typed codes", () => {
    expect(cleanCode(" ab-c 2d9x ")).toBe("ABC2D9");
  });
});
