import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE, verifyToken, type AuthPayload } from "./auth.js";

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
  next();
}
