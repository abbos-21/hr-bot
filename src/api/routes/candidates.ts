import { Router, Response } from "express";
import prisma from "../../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { wsManager } from "../../websocket";
import { CANDIDATE_STATUSES } from "../../config";

const router = Router();
router.use(authMiddleware);

// GET /api/candidates
router.get("/", async (req: AuthRequest, res: Response) => {
  const { botId, jobId, status, search, page, limit } = req.query;
  const where: any = {};
  if (botId) where.botId = botId as string;
  if (jobId) where.jobId = jobId as string;
  if (status) where.status = status as string;
  if (search) {
    where.OR = [
      { fullName: { contains: search as string } },
      { username: { contains: search as string } },
      { email: { contains: search as string } },
      { phone: { contains: search as string } },
    ];
  }

  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 20;
  const skip = (pageNum - 1) * limitNum;

  const [candidates, total] = await Promise.all([
    prisma.candidate.findMany({
      where,
      include: {
        job: { include: { translations: true } },
        _count: {
          select: {
            messages: true,
            files: true,
            comments: true,
          },
        },
      },
      orderBy: { lastActivity: "desc" },
      skip,
      take: limitNum,
    }),
    prisma.candidate.count({ where }),
  ]);

  // Attach unread inbound message count to each candidate.
  // Prisma filtered _count doesn't support `where` on relations in all versions,
  // so we do one aggregation query grouped by candidateId instead.
  const candidateIds = candidates.map((c: any) => c.id);
  const unreadRows = candidateIds.length
    ? await prisma.message.groupBy({
        by: ["candidateId"],
        where: {
          candidateId: { in: candidateIds },
          direction: "inbound",
          isRead: false,
        },
        _count: { id: true },
      })
    : [];

  const unreadMap: Record<string, number> = {};
  unreadRows.forEach((row: any) => {
    unreadMap[row.candidateId] = row._count.id;
  });

  const candidatesWithUnread = candidates.map((c: any) => ({
    ...c,
    unreadCount: unreadMap[c.id] || 0,
  }));

  return res.json({
    candidates: candidatesWithUnread,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
  });
});

// GET /api/candidates/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const candidate = await prisma.candidate.findUnique({
    where: { id: req.params.id },
    include: {
      job: { include: { translations: true } },
      answers: {
        include: {
          question: { include: { translations: true } },
          option: { include: { translations: true } },
        },
      },
      comments: {
        include: { admin: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      messages: {
        include: { admin: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      files: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!candidate) return res.status(404).json({ error: "Not found" });
  return res.json(candidate);
});

// PUT /api/candidates/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { fullName, age, phone, email, status, lang, currentStep, columnId } =
    req.body;
  const updateData: any = {};

  if (fullName !== undefined) updateData.fullName = fullName;
  if (age !== undefined) updateData.age = age;
  if (phone !== undefined) updateData.phone = phone;
  if (email !== undefined) updateData.email = email;
  if (lang !== undefined) updateData.lang = lang;
  if (currentStep !== undefined) updateData.currentStep = currentStep;
  if (columnId !== undefined) updateData.columnId = columnId || null;

  if (status !== undefined) {
    if (!CANDIDATE_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    updateData.status = status;
    if (status === "archived" || status === "hired") {
      // Keep columnId when archiving (so column-restore can find them back)
      // but clear it when hiring (hired candidates leave the board)
      if (status === "hired") updateData.columnId = null;
    } else if (status === "active") {
      // Individually restoring an archived candidate → put them in Unassigned
      // (they may have a stale columnId pointing to an archived column)
      updateData.columnId = null;
    }

    wsManager.broadcast({
      type: "STATUS_CHANGE",
      payload: { candidateId: req.params.id, status },
    });
  }

  const candidate = await prisma.candidate.update({
    where: { id: req.params.id },
    data: { ...updateData, lastActivity: new Date() },
    include: {
      job: { include: { translations: true } },
    },
  });

  wsManager.broadcast({ type: "CANDIDATE_UPDATE", payload: candidate });

  return res.json(candidate);
});

// PUT /api/candidates/:id/answers/:answerId
router.put(
  "/:id/answers/:answerId",
  async (req: AuthRequest, res: Response) => {
    const { textValue, optionId } = req.body;
    const answer = await prisma.answer.update({
      where: { id: req.params.answerId },
      data: {
        ...(textValue !== undefined && { textValue, optionId: null }),
        ...(optionId !== undefined && { optionId, textValue: null }),
        updatedAt: new Date(),
      },
    });
    return res.json(answer);
  },
);

// POST /api/candidates/:id/comments
router.post("/:id/comments", async (req: AuthRequest, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  const comment = await prisma.candidateComment.create({
    data: {
      candidateId: req.params.id,
      adminId: req.admin!.adminId,
      text,
    },
    include: { admin: { select: { id: true, name: true, email: true } } },
  });

  return res.status(201).json(comment);
});

// DELETE /api/candidates/:id/comments/:commentId
router.delete(
  "/:id/comments/:commentId",
  async (req: AuthRequest, res: Response) => {
    await prisma.candidateComment.delete({
      where: { id: req.params.commentId },
    });
    return res.json({ success: true });
  },
);

// GET /api/candidates/:id/files
router.get("/:id/files", async (req: AuthRequest, res: Response) => {
  const files = await prisma.candidateFile.findMany({
    where: { candidateId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  return res.json(files);
});

export default router;

// DELETE /api/candidates/:id  — permanently delete an archived candidate only
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const candidate = await prisma.candidate.findUnique({
    where: { id: req.params.id },
  });
  if (!candidate) return res.status(404).json({ error: "Not found" });
  if (candidate.status !== "archived") {
    return res
      .status(400)
      .json({ error: "Only archived candidates can be permanently deleted" });
  }
  await prisma.candidate.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});
