import { cookies } from "next/headers";
import { getDb } from "@/server/db";
import { SESSION_COOKIE } from "@/server/auth";
import { backgroundFor } from "@/server/backgrounds";
import { Backdrop } from "./Backdrop";

/** The signed-in person's background, read on the server so it arrives with the page. Nothing for someone signed out. */
export async function BackdropLayer() {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  return <Backdrop initial={id ? backgroundFor(getDb(), id) : null} />;
}
