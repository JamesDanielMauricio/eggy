import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { AUTH_COOKIE, authCookieOptions, signToken, verifyPassword } from "../lib/auth.js";
import { requireAuth } from "../lib/requireAuth.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.username, username));
    // Compare against a fixed dummy hash when the user doesn't exist, so a
    // wrong username and a wrong password take the same amount of time —
    // otherwise the timing gap between "no such row" and "bcrypt.compare
    // failed" leaks which usernames are valid.
    const passwordHash = user?.passwordHash ?? "$2b$12$fGZ3Zaix67YS1/gGUTreAeWHH0GhbSVg44m2uiLj/14dF7ErWXmoG";
    const valid = await verifyPassword(password, passwordHash);

    if (!user || !valid) {
      res.status(401).json({ error: "invalid username or password" });
      return;
    }

    const token = signToken({ userId: user.id, username: user.username });
    res.cookie(AUTH_COOKIE, token, authCookieOptions(req.secure));
    res.json({ username: user.username });
  })
);

authRouter.post("/logout", (req, res) => {
  // clearCookie only needs the attributes that scope which cookie it's
  // clearing (path/secure/sameSite) — Express 5 deprecates passing maxAge
  // here since it now always expires the cookie immediately regardless.
  const { maxAge: _maxAge, ...clearOptions } = authCookieOptions(req.secure);
  res.clearCookie(AUTH_COOKIE, clearOptions);
  res.status(204).send();
});

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ username: req.user!.username });
  })
);
