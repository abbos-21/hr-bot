import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../../db";
import {
  authMiddleware,
  superAdminMiddleware,
  AuthRequest,
} from "../middleware/auth";

const router = Router();
router.use(authMiddleware);
router.use(superAdminMiddleware);

// GET /api/organizations
router.get("/", async (req: AuthRequest, res: Response) => {
  const orgs = await prisma.organization.findMany({
    include: {
      branches: { orderBy: { name: "asc" } },
      bot: { select: { id: true, name: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json(orgs);
});

// POST /api/organizations
router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, email, password, branches, botId } = req.body;
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "Name, email, and password are required" });
  }

  // Check email uniqueness across Admin + Organization
  const existingAdmin = await prisma.admin.findUnique({ where: { email } });
  if (existingAdmin)
    return res.status(400).json({ error: "Email already exists" });
  const existingOrg = await prisma.organization.findUnique({
    where: { email },
  });
  if (existingOrg)
    return res.status(400).json({ error: "Email already exists" });

  const hashed = await bcrypt.hash(password, 10);

  const org = await prisma.organization.create({
    data: {
      name,
      email,
      password: hashed,
      branches: branches?.length
        ? {
            create: (branches as string[]).map((b) => ({ name: b })),
          }
        : undefined,
    },
    include: {
      branches: { orderBy: { name: "asc" } },
      bot: { select: { id: true, name: true, username: true } },
    },
  });

  // Assign bot if provided
  if (botId) {
    await prisma.bot.update({
      where: { id: botId },
      data: { organizationId: org.id },
    });
  }

  // Re-fetch with bot included
  const result = await prisma.organization.findUnique({
    where: { id: org.id },
    include: {
      branches: { orderBy: { name: "asc" } },
      bot: { select: { id: true, name: true, username: true } },
    },
  });

  return res.status(201).json(result);
});

// GET /api/organizations/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    include: {
      branches: { orderBy: { name: "asc" } },
      bot: { select: { id: true, name: true, username: true } },
    },
  });
  if (!org) return res.status(404).json({ error: "Not found" });
  return res.json(org);
});

// PUT /api/organizations/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name, email, isActive, password } = req.body;
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (password) updateData.password = await bcrypt.hash(password, 10);

  const org = await prisma.organization.update({
    where: { id: req.params.id },
    data: updateData,
    include: {
      branches: { orderBy: { name: "asc" } },
      bot: { select: { id: true, name: true, username: true } },
    },
  });
  return res.json(org);
});

// DELETE /api/organizations/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  // Unlink bot first
  await prisma.bot.updateMany({
    where: { organizationId: req.params.id },
    data: { organizationId: null },
  });
  await prisma.organization.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
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

  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    include: {
      branches: { orderBy: { name: "asc" } },
      bot: { select: { id: true, name: true, username: true } },
    },
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
