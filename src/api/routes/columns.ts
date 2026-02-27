import { Router, Response } from "express";
import { cuid } from "@paralleldrive/cuid2";
import prisma from "../../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// GET /api/columns  — all active columns (ordered)
router.get("/", async (_req: AuthRequest, res: Response) => {
  const cols = await prisma.kanbanColumn.findMany({
    where: { isArchived: false },
    orderBy: { order: "asc" },
  });
  return res.json(cols);
});

// GET /api/columns/archived
router.get("/archived", async (_req: AuthRequest, res: Response) => {
  const cols = await prisma.kanbanColumn.findMany({
    where: { isArchived: true },
    orderBy: { updatedAt: "desc" },
  });
  return res.json(cols);
});

// POST /api/columns
router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, color, dot } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name required" });
  const last = await prisma.kanbanColumn.findFirst({
    orderBy: { order: "desc" },
  });
  const col = await prisma.kanbanColumn.create({
    data: {
      name: name.trim(),
      color: color || "bg-slate-50",
      dot: dot || "bg-slate-400",
      order: last ? last.order + 1 : 0,
    },
  });
  return res.status(201).json(col);
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

// POST /api/columns/:id/archive  — archive the stage AND all candidates inside it
router.post("/:id/archive", async (req: AuthRequest, res: Response) => {
  // Archive every active candidate that belongs to this column
  await prisma.candidate.updateMany({
    where: { columnId: req.params.id, status: "active" },
    data: { status: "archived" }, // keep columnId so restoring the stage can find them back
  });
  const col = await prisma.kanbanColumn.update({
    where: { id: req.params.id },
    data: { isArchived: true, updatedAt: new Date() },
  });
  return res.json(col);
});

// POST /api/columns/:id/restore  — restore stage and all its archived candidates
router.post("/:id/restore", async (req: AuthRequest, res: Response) => {
  // Re-activate all archived candidates that still reference this column
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

// DELETE /api/columns/:id  — permanent delete
// • Active column  → candidates move to Unassigned (status stays active, columnId cleared)
// • Archived column → candidates are permanently deleted along with the column
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const col = await prisma.kanbanColumn.findUnique({
    where: { id: req.params.id },
  });
  if (!col) return res.status(404).json({ error: "Column not found" });

  if (col.isArchived) {
    // Hard-delete all candidates that were archived with this column
    await prisma.candidate.deleteMany({ where: { columnId: req.params.id } });
  } else {
    // Move active candidates to Unassigned
    await prisma.candidate.updateMany({
      where: { columnId: req.params.id },
      data: { status: "active", columnId: null },
    });
  }

  await prisma.kanbanColumn.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

export default router;
