import argon2 from "argon2";
import { addDays } from "../utils/date";
import { env } from "../env";
import { prisma } from "../prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../auth/tokens";
import { HttpError } from "../http";

export async function createAuthSession(user: { id: string; role: string }, context: { userAgent?: string; ip?: string }) {
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: "pending",
      userAgent: context.userAgent,
      ipAddress: context.ip,
      expiresAt: addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS)
    }
  });
  const refreshToken = signRefreshToken(user.id, session.id);
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshTokenHash: await argon2.hash(refreshToken) }
  });

  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken
  };
}

export async function rotateRefreshToken(refreshToken: string, context: { userAgent?: string; ip?: string }) {
  const payload = verifyRefreshToken(refreshToken);
  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: true }
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new HttpError(401, "Refresh session is not active");
  }

  const matches = await argon2.verify(session.refreshTokenHash, refreshToken);
  if (!matches || session.userId !== payload.sub) {
    throw new HttpError(401, "Invalid refresh token");
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() }
  });

  return createAuthSession(session.user, context);
}
