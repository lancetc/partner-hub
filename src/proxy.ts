import { NextResponse, type NextRequest } from "next/server";

/*
  Sign-in first: anyone without a sign-in cookie is sent to /login, which brings them back to the page
  they asked for afterwards (?next=). Prototype only: it checks that someone has signed in, not who; the
  API still checks every permission itself (server/auth). Real sign-in will come from each organisation.

  Left open: the sign-in page, links shared with people outside the hub (topic and path reviews,
  public learning paths, unsubscribe), the offline page, the API, and files.
*/

const SESSION_COOKIE = "tc-demo-user";
const OPEN = [/^\/login$/, /^\/review\//, /^\/open\//, /^\/unsubscribe/, /^\/offline$/];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (OPEN.some((p) => p.test(pathname)) || request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Pages only: not the API, Next's own files, or anything with a file extension (images, icons, the manifest).
  matcher: ["/((?!api/|_next/|.*\\.[\\w]+$).*)"],
};
