import jwt from "jsonwebtoken";
import { env } from "../env";

export interface AccessTokenPayload {
  sub: string;
  role: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL });
}

export function signRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign({ sub: userId, sid: sessionId }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof payload !== "object" || !payload.sub || !payload.role) {
    throw new Error("Invalid access token");
  }

  return { sub: String(payload.sub), role: String(payload.role) };
}

export function verifyRefreshToken(token: string): { sub: string; sid: string } {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (typeof payload !== "object" || !payload.sub || !payload.sid) {
    throw new Error("Invalid refresh token");
  }

  return { sub: String(payload.sub), sid: String(payload.sid) };
}
