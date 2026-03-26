import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../db";
import {
  authMiddleware,
  superAdminMiddleware,
  AuthRequest,
} from "../middleware/auth";
import { ensureBranchQuestion } from "./branches";

const router = Router();
router.use(authMiddleware);
router.use(superAdminMiddleware);

const ORG_INCLUDE = {
  branches: { orderBy: { name: "asc" } },
  bot: { select: { id: true, name: true, username: true } },
} as const;

// GET /api/organizations — active only; pass ?deleted=true for soft-deleted
router.get("/", async (req: AuthRequest, res: Response) => {
  const showDeleted = req.query.deleted === "true";
  const orgs = await prisma.organization.findMany({
    where: showDeleted ? { deletedAt: { not: null } } : { deletedAt: null },
    include: ORG_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return res.json(orgs);
});

// POST /api/organizations
router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, login, password, branches, botId } = req.body;
  if (!name || !login || !password) {
    return res
      .status(400)
      .json({ error: "Name, login, and password are required" });
  }

  // Check login uniqueness across Admin + Organization (including soft-deleted)
  const existingAdmin = await prisma.admin.findUnique({ where: { login } });
  if (existingAdmin)
    return res.status(400).json({ error: "Login already exists" });
  const existingOrg = await prisma.organization.findUnique({
    where: { login },
  });
  if (existingOrg)
    return res.status(400).json({ error: "Login already exists" });

  const hashed = await bcrypt.hash(password, 10);

  const org = await prisma.organization.create({
    data: {
      name,
      login,
      password: hashed,
      branches: branches?.length
        ? {
            create: (branches as string[]).map((b) => ({ name: b })),
          }
        : undefined,
    },
    include: ORG_INCLUDE,
  });

  // Assign bot if provided
  if (botId) {
    await prisma.bot.update({
      where: { id: botId },
      data: { organizationId: org.id },
    });
    // Sync branch question options for existing branches
    await ensureBranchQuestion(org.id);
  }

  const result = await prisma.organization.findUnique({
    where: { id: org.id },
    include: ORG_INCLUDE,
  });

  return res.status(201).json(result);
});

// GET /api/organizations/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    include: ORG_INCLUDE,
  });
  if (!org) return res.status(404).json({ error: "Not found" });
  return res.json(org);
});

// PUT /api/organizations/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name, login, isActive, password } = req.body;
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (login !== undefined) updateData.login = login;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (password) updateData.password = await bcrypt.hash(password, 10);

  const org = await prisma.organization.update({
    where: { id: req.params.id },
    data: updateData,
    include: ORG_INCLUDE,
  });
  return res.json(org);
});

// DELETE /api/organizations/:id — soft delete
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
  });
  if (!org) return res.status(404).json({ error: "Not found" });

  // Unlink bot so it becomes available again
  await prisma.bot.updateMany({
    where: { organizationId: req.params.id },
    data: { organizationId: null },
  });

  await prisma.organization.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date(), isActive: false },
  });

  return res.json({ ok: true });
});

// POST /api/organizations/:id/restore — undo soft delete
router.post("/:id/restore", async (req: AuthRequest, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
  });
  if (!org) return res.status(404).json({ error: "Not found" });
  if (!org.deletedAt)
    return res.status(400).json({ error: "Organization is not deleted" });

  const restored = await prisma.organization.update({
    where: { id: req.params.id },
    data: { deletedAt: null, isActive: true },
    include: ORG_INCLUDE,
  });

  return res.json(restored);
});

// PUT /api/organizations/:id/bot — assign a bot
router.put("/:id/bot", async (req: AuthRequest, res: Response) => {
  const { botId } = req.body;
  if (!botId) return res.status(400).json({ error: "botId required" });

  // Unlink any previously assigned bot
  await prisma.bot.updateMany({
    where: { organizationId: req.params.id },
    data: { organizationId: null },
  });

  await prisma.bot.update({
    where: { id: botId },
    data: { organizationId: req.params.id },
  });

  // Sync branch question options for existing branches
  await ensureBranchQuestion(req.params.id);

  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    include: ORG_INCLUDE,
  });
  return res.json(org);
});

// DELETE /api/organizations/:id/bot — unlink bot
router.delete("/:id/bot", async (req: AuthRequest, res: Response) => {
  await prisma.bot.updateMany({
    where: { organizationId: req.params.id },
    data: { organizationId: null },
  });
  return res.json({ ok: true });
});

export default router;
