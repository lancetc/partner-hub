import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { removePicture, setPicture } from "@/server/profilePictures";

/** Upload your profile picture (form field "file"). It's cropped square and resized on the server. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a picture to upload.");
    return setPicture(db, user, file, now);
  });
}

/** Remove your profile picture: back to your initials. */
export async function DELETE() {
  return handle(({ db, user, now }) => removePicture(db, user, now));
}
