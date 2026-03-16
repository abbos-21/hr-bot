import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../../db";
import { config } from "../../config";
import { JwtPayload } from "../../types";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// POST /api/auth/login — unified login for admins and organizations
router.post("/login", async (req: Request, res: Response) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: "Login and password required" });
  }

  // Try admin first
  const admin = await prisma.admin.findUnique({ where: { login } });
  if (admin && admin.isActive) {
    const valid = await bcrypt.compare(password, admin.password);
    if (valid) {
      const payload: JwtPayload = {
        adminId: admin.id,
        login: admin.login,
        role: admin.role,
        type: "admin",
      };
      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
      return res.json({
        token,
        admin: {
          id: admin.id,
          login: admin.login,
          name: admin.name,
          role: admin.role,
          type: "admin" as const,
        },
      });
    }
  }

  // Try organization
  const org = await prisma.organization.findUnique({
    where: { login },
    include: { bot: { select: { id: true } } },
  });
  if (org && org.isActive) {
    const valid = await bcrypt.compare(password, org.password);
    if (valid) {
      const payload: JwtPayload = {
        adminId: org.id,
        login: org.login,
        role: "organization",
        type: "organization",
        organizationId: org.id,
        botId: org.bot?.id,
      };
      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
      return res.json({
        token,
        admin: {
          id: org.id,
          login: org.login,
          name: org.name,
          role: "organization",
          type: "organization" as const,
          organizationId: org.id,
          botId: org.bot?.id,
        },
      });
    }
  }

  return res.status(401).json({ error: "Invalid credentials" });
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  if (req.admin?.type === "organization") {
    const org = await prisma.organization.findUnique({
      where: { id: req.admin.organizationId },
      include: {
        branches: { orderBy: { name: "asc" } },
        bot: { select: { id: true, name: true, username: true } },
      },
    });
    if (!org) return res.status(404).json({ error: "Not found" });
    return res.json({
      id: org.id,
      login: org.login,
      name: org.name,
      role: "organization",
      type: "organization",
      organizationId: org.id,
      botId: org.bot?.id,
      branches: org.branches,
      bot: org.bot,
      createdAt: org.createdAt,
    });
  }

  const admin = await prisma.admin.findUnique({
    where: { id: req.admin!.adminId },
    select: { id: true, login: true, name: true, role: true, createdAt: true },
  });
  if (!admin) return res.status(404).json({ error: "Not found" });
  return res.json({ ...admin, type: "admin" });
});

// PUT /api/auth/profile
router.put(
  "/profile",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { name, currentPassword, newPassword } = req.body;

    if (req.admin?.type === "organization") {
      const org = await prisma.organization.findUnique({
        where: { id: req.admin.organizationId },
      });
      if (!org) return res.status(404).json({ error: "Not found" });

      const updateData: any = {};
      if (name) updateData.name = name;
      if (currentPassword && newPassword) {
        const valid = await bcrypt.compare(currentPassword, org.password);
        if (!valid)
          return res.status(400).json({ error: "Invalid current password" });
        updateData.password = await bcrypt.hash(newPassword, 10);
      }

      const updated = await prisma.organization.update({
        where: { id: org.id },
        data: updateData,
        select: { id: true, login: true, name: true },
      });
      return res.json({ ...updated, role: "organization", type: "organization" });
    }

    const adminId = req.admin!.adminId;
    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) return res.status(404).json({ error: "Not found" });

    const updateData: any = {};
    if (name) updateData.name = name;

    if (currentPassword && newPassword) {
      const valid = await bcrypt.compare(currentPassword, admin.password);
      if (!valid)
        return res.status(400).json({ error: "Invalid current password" });
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    const updated = await prisma.admin.update({
      where: { id: adminId },
      data: updateData,
      select: { id: true, login: true, name: true, role: true },
    });

    return res.json({ ...updated, type: "admin" });
  },
);

// GET /api/auth/admins (super admin only)
router.get(
  "/admins",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const admins = await prisma.admin.findMany({
      select: {
        id: true,
        login: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return res.json(admins);
  },
);

// POST /api/auth/admins (create new admin)
router.post(
  "/admins",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    if (req.admin!.role !== "super_admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { login, password, name, role } = req.body;
    if (!login || !password || !name) {
      return res.status(400).json({ error: "Login, password, name required" });
    }

    // Check uniqueness across both tables
    const existingAdmin = await prisma.admin.findUnique({ where: { login } });
    if (existingAdmin)
      return res.status(400).json({ error: "Login already exists" });
    const existingOrg = await prisma.organization.findUnique({
      where: { login },
    });
    if (existingOrg)
      return res.status(400).json({ error: "Login already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: { login, password: hashed, name, role: role || "admin" },
      select: {
        id: true,
        login: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.status(201).json(admin);
  },
);

// PUT /api/auth/admins/:id
router.put(
  "/admins/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    if (req.admin!.role !== "super_admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, role, isActive, password } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) updateData.password = await bcrypt.hash(password, 10);

    const admin = await prisma.admin.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        login: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    return res.json(admin);
  },
);

export default router;
