import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { JwtPayload } from "../../types";
import prisma from "../../db";

export interface AuthRequest extends Request {
  admin?: JwtPayload;
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const superAdminMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (req.admin?.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden: Super admin required" });
    return;
  }
  next();
};

/** Returns true if the user is an admin (not an organization user). */
export function isAdmin(req: AuthRequest): boolean {
  return req.admin?.type === "admin";
}

/** Returns a Prisma `where` filter scoping results to the org's bot. Admins get no filter. */
export async function getBotFilter(req: AuthRequest): Promise<{ botId?: string }> {
  if (req.admin?.type === "organization") {
    let botId = req.admin.botId;
    if (!botId && req.admin.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: req.admin.organizationId },
        include: { bot: { select: { id: true } } },
      });
      botId = org?.bot?.id;
      if (botId) req.admin.botId = botId;
    }
    // If org has no bot yet, return a non-matching id so the query returns nothing
    return { botId: botId ?? "none" };
  }
  return {};
}

/** Returns false (and sends 403) if an org user tries to access a bot they don't own. */
export async function requireBotAccess(
  req: AuthRequest,
  res: Response,
  botId: string,
): Promise<boolean> {
  if (req.admin?.type === "organization") {
    // If JWT has botId, use it directly
    let orgBotId = req.admin.botId;
    // If JWT botId is missing (bot assigned after login), look it up
    if (!orgBotId && req.admin.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: req.admin.organizationId },
        include: { bot: { select: { id: true } } },
      });
      orgBotId = org?.bot?.id;
      // Cache it on the request so subsequent checks in the same request don't re-query
      if (orgBotId) req.admin.botId = orgBotId;
    }
    if (orgBotId !== botId) {
      res.status(403).json({ error: "Access denied" });
      return false;
    }
  }
  return true;
}

/**
 * Returns the Admin table ID for FK references, or undefined for org users.
 * Use this wherever you write a record with an `adminId` FK to the Admin table.
 */
export function getAdminId(req: AuthRequest): string | undefined {
  if (req.admin?.type === "organization") return undefined;
  return req.admin?.adminId;
}

/** Middleware that blocks organization users — only admins pass through. */
export const adminOnlyMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (req.admin?.type === "organization") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
};
