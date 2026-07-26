import type { NextFunction, Request, Response } from "express";

// Express 4 doesn't catch rejected promises from async route handlers —
// without this, a thrown DB error leaves the request hanging instead of
// reaching the error-handling middleware.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
