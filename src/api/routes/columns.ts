import { Router, Response } from "express";
import prisma from "../../db";
import { authMiddleware, AuthRequest, getBotFilter } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

/** Resolves the botId to scope columns to.
 *  - Org users: their assigned bot (from JWT / DB lookup)
 *  - Admin users: explicit ?botId query param (required for scoping)
 */
async function getColumnBotId(req: AuthRequest): Promise<string | undefined> {
  if (req.admin?.type === "organization") {
    const filter = await getBotFilter(req);
    return filter.botId !== "none" ? filter.botId : undefined;
  }
  return (req.query.botId as string) || (req.body?.botId as string) || undefined;
}

// GET /api/columns?botId=...
router.get("/", async (req: AuthRequest, res: Response) => {
  const botId = await getColumnBotId(req);
  const cols = await prisma.kanbanColumn.findMany({
    where: { isArchived: false, ...(botId ? { botId } : {}) },
    orderBy: { order: "asc" },
  });
  return res.json(cols);
});

// GET /api/columns/archived?botId=...
router.get("/archived", async (req: AuthRequest, res: Response) => {
  const botId = await getColumnBotId(req);
  const cols = await prisma.kanbanColumn.findMany({
    where: { isArchived: true, ...(botId ? { botId } : {}) },
    orderBy: { updatedAt: "desc" },
  });
  return res.json(cols);
});

// POST /api/columns
router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, color, dot } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name required" });

  const botId = await getColumnBotId(req);
  if (!botId) return res.status(400).json({ error: "botId required" });

  const last = await prisma.kanbanColumn.findFirst({
    where: { botId },
    orderBy: { order: "desc" },
  });
  const col = await prisma.kanbanColumn.create({
    data: {
      botId,
      name: name.trim(),
      color: color || "bg-slate-50",
      dot: dot || "bg-slate-400",
      order: last ? last.order + 1 : 0,
    },
  });
  return res.status(201).json(col);
});

// PUT /api/columns/reorder  — [{id, order}]
router.put("/reorder", async (req: AuthRequest, res: Response) => {
  const { columns } = req.body;
  if (!Array.isArray(columns))
    return res.status(400).json({ error: "columns array required" });
  await prisma.$transaction(
    columns.map((c: { id: string; order: number }) =>
      prisma.kanbanColumn.update({
        where: { id: c.id },
        data: { order: c.order },
      }),
    ),
  );
  return res.json({ success: true });
});

// PUT /api/columns/:id  — rename or recolor
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name, color, dot, order } = req.body;
  const col = await prisma.kanbanColumn.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(color !== undefined && { color }),
      ...(dot !== undefined && { dot }),
      ...(order !== undefined && { order }),
      updatedAt: new Date(),
    },
  });
  return res.json(col);
});

// POST /api/columns/:id/archive
router.post("/:id/archive", async (req: AuthRequest, res: Response) => {
  await prisma.candidate.updateMany({
    where: { columnId: req.params.id, status: "active" },
    data: { status: "archived" },
  });
  const col = await prisma.kanbanColumn.update({
    where: { id: req.params.id },
    data: { isArchived: true, updatedAt: new Date() },
  });
  return res.json(col);
});

// POST /api/columns/:id/restore
router.post("/:id/restore", async (req: AuthRequest, res: Response) => {
  await prisma.candidate.updateMany({
    where: { columnId: req.params.id, status: "archived" },
    data: { status: "active" },
  });
  const col = await prisma.kanbanColumn.update({
    where: { id: req.params.id },
    data: { isArchived: false, updatedAt: new Date() },
  });
  return res.json(col);
});

// DELETE /api/columns/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const col = await prisma.kanbanColumn.findUnique({
    where: { id: req.params.id },
  });
  if (!col) return res.status(404).json({ error: "Column not found" });

  if (col.isArchived) {
    await prisma.candidate.deleteMany({ where: { columnId: req.params.id } });
  } else {
    await prisma.candidate.updateMany({
      where: { columnId: req.params.id },
      data: { status: "active", columnId: null },
    });
  }

  await prisma.kanbanColumn.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

export default router;
