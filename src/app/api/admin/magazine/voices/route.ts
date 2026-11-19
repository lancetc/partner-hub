import { handle } from "@/server/http";
import { narrationVoices } from "@/server/magazineNarration";

/** The ElevenLabs voices an Audio Guide can use, besides the Topic narrator. */
export async function GET() {
  return handle(async ({ user }) => narrationVoices(user));
}
