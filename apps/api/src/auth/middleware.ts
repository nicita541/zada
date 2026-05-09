import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../http";
import { verifyAccessToken } from "./tokens";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      userId: string;
      role: string;
    };
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    next(new HttpError(401, "Authentication required"));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired access token"));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== "admin" && req.auth?.role !== "developer") {
    next(new HttpError(403, "Admin access required"));
    return;
  }

  next();
}

export function currentUserId(req: Request): string {
  if (!req.auth?.userId) {
    throw new HttpError(401, "Authentication required");
  }

  return req.auth.userId;
}
