import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Copy .env.example to .env and fill it in.");
}
const JWT_SECRET = process.env.JWT_SECRET;

const TOKEN_TTL = "7d";
export const AUTH_COOKIE = "token";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type AuthPayload = { userId: string; username: string };

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

// The client (Vercel) and API (Render) live on different domains in
// production, so the browser treats this as a cross-site request — that
// requires SameSite=None + Secure or the browser silently drops the
// cookie. Locally, client and server are both on localhost (different
// ports only), which counts as same-site, so Lax works and Secure isn't
// available anyway over plain http. `secure` is passed in per-request
// (via req.secure) rather than a fixed env check so both cases work
// without extra config.
export function authCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}
