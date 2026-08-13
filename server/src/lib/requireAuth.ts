import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE, authCookieOptions, verifyToken, type AuthPayload } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// Gates every private data route behind a valid session cookie — without
// this, anyone with the API URL could read or wipe the farm's sales,
// expenses, and harvest records with no login required.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.user = payload;

  // Sliding session: the browser caps this cookie's lifetime at 400 days
  // from whenever it was last SET (see authCookieOptions), not from last
  // use — so without this, a user who logs in once and opens the app daily
  // would still be logged out ~400 days after that one login. Re-sending
  // the same token on every authenticated request resets the browser's
  // 400-day countdown, so an active user is never logged out; only someone
  // who stops using the app for 400 straight days is.
  res.cookie(AUTH_COOKIE, token, authCookieOptions(req.secure));

  next();
}
