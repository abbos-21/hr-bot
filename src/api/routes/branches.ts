import { Router, Response } from "express";
import prisma from "../../db";
import { authMiddleware, AuthRequest, isAdmin } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// GET /api/branches
router.get("/", async (req: AuthRequest, res: Response) => {
  const where: any = {};

  if (!isAdmin(req)) {
    // Org users see only their branches
    where.organizationId = req.admin!.organizationId;
  } else if (req.query.organizationId) {
    where.organizationId = req.query.organizationId;
  }

  const branches = await prisma.branch.findMany({
    where,
    include: { _count: { select: { candidates: true } } },
    orderBy: { name: "asc" },
  });
  return res.json(branches);
});

// POST /api/branches
router.post("/", async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  const organizationId = isAdmin(req)
    ? req.body.organizationId
    : req.admin!.organizationId;

  if (!organizationId) {
    return res.status(400).json({ error: "organizationId required" });
  }

  // Verify org user owns this org
  if (!isAdmin(req) && organizationId !== req.admin!.organizationId) {
    return res.status(403).json({ error: "Access denied" });
  }

  const branch = await prisma.branch.create({
    data: { name, organizationId },
    include: { _count: { select: { candidates: true } } },
  });
  return res.status(201).json(branch);
});

// PUT /api/branches/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const branch = await prisma.branch.findUnique({
    where: { id: req.params.id },
  });
  if (!branch) return res.status(404).json({ error: "Not found" });

  if (!isAdmin(req) && branch.organizationId !== req.admin!.organizationId) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { name, isActive } = req.body;
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updated = await prisma.branch.update({
    where: { id: req.params.id },
    data: updateData,
    include: { _count: { select: { candidates: true } } },
  });
  return res.json(updated);
});

// DELETE /api/branches/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const branch = await prisma.branch.findUnique({
    where: { id: req.params.id },
  });
  if (!branch) return res.status(404).json({ error: "Not found" });

  if (!isAdmin(req) && branch.organizationId !== req.admin!.organizationId) {
    return res.status(403).json({ error: "Access denied" });
  }

  await prisma.branch.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});

export default router;
