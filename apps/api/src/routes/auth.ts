import argon2 from "argon2";
import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { asyncHandler, HttpError } from "../http";
import { createAuthSession, rotateRefreshToken } from "../services/authService";
import { currentUserId, requireAuth } from "../auth/middleware";

const router = Router();
const resetTokens = new Map<string, { email: string; expiresAt: Date }>();

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80).optional()
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = authSchema.parse(req.body);
    const passwordHash = await argon2.hash(input.password);

    const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) {
      throw new HttpError(409, "Email is already registered");
    }

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        name: input.name,
        workspaces: { create: { name: "Personal" } },
        settings: { create: {} },
        subscriptions: { create: { plan: "free", status: "inactive", source: "system" } }
      }
    });

    const tokens = await createAuthSession(user, {
      userAgent: getUserAgent(req.headers["user-agent"]),
      ip: req.ip
    });

    res.status(201).json({ user: publicUser(user), ...tokens });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = authSchema.pick({ email: true, password: true }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new HttpError(401, "Invalid email or password");
    }

    const tokens = await createAuthSession(user, {
      userAgent: getUserAgent(req.headers["user-agent"]),
      ip: req.ip
    });

    res.json({ user: publicUser(user), ...tokens });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const input = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
    const tokens = await rotateRefreshToken(input.refreshToken, {
      userAgent: getUserAgent(req.headers["user-agent"]),
      ip: req.ip
    });
    res.json(tokens);
  })
);

router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {});
    if (input.refreshToken) {
      const sessions = await prisma.session.findMany({ where: { userId: currentUserId(req), revokedAt: null } });
      for (const session of sessions) {
        if (await argon2.verify(session.refreshTokenHash, input.refreshToken).catch(() => false)) {
          await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
        }
      }
    }

    res.status(204).end();
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: currentUserId(req) },
      include: { workspaces: true, settings: true }
    });
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    res.json({ user: publicUser(user), workspaces: user.workspaces, settings: user.settings });
  })
);

router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const input = z.object({ email: z.string().email() }).parse(req.body);
    const email = input.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      res.json({ ok: true });
      return;
    }

    const resetToken = crypto.randomUUID();
    resetTokens.set(resetToken, {
      email,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30)
    });

    res.json({ ok: true, resetToken });
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        email: z.string().email(),
        resetToken: z.string().min(1),
        password: z.string().min(8)
      })
      .parse(req.body);

    const token = resetTokens.get(input.resetToken);
    const email = input.email.toLowerCase();

    if (!token || token.email !== email || token.expiresAt.getTime() < Date.now()) {
      resetTokens.delete(input.resetToken);
      throw new HttpError(400, "Invalid or expired reset token");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      resetTokens.delete(input.resetToken);
      throw new HttpError(400, "Invalid or expired reset token");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2.hash(input.password) }
      }),
      prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);

    resetTokens.delete(input.resetToken);
    res.json({ ok: true });
  })
);

function publicUser(user: { id: string; email: string; name: string | null; role: string }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

function getUserAgent(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(" ") : value;
}

export default router;
