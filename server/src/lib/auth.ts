import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Copy .env.example to .env and fill it in.");
}
const JWT_SECRET = process.env.JWT_SECRET;

export const AUTH_COOKIE = "token";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type AuthPayload = { userId: string; username: string };

// No `expiresIn` — the token carries no `exp` claim, so verifyToken() below
// never rejects it for being "too old". This is a stateless JWT with no
// server-side session table, so there's also no way to revoke a token early
// (e.g. after a lost device) short of rotating JWT_SECRET, which logs
// everyone out at once. Acceptable here since this is a small private app
// with a handful of trusted admin users, not a public multi-user service.
export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET);
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

// In production the client and API are served from the same Vercel
// deployment (same-site), but None + Secure works fine same-site too, so
// there's no need to special-case it. Locally, client and server are both
// on localhost (different ports only, plain http), where Secure isn't
// available and None requires it — so Lax is used instead. `secure` is
// passed in per-request (via req.secure) rather than a fixed env check so
// both cases work without extra config.
export function authCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    // Chrome (and, following its lead, other Chromium browsers) hard-caps
    // any cookie's lifetime at 400 days from when it's set, no matter what
    // maxAge the server sends — there's no way to make a cookie truly last
    // forever. This sets it to that ceiling so the login survives as long
    // as the platform allows; after ~400 days of no new login, the browser
    // drops the cookie itself and the user has to sign in again.
    maxAge: 400 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}
