import { Router, Response } from "express";
import prisma from "../../db";
import {
  authMiddleware,
  AuthRequest,
  requireBotAccess,
  getAdminId,
} from "../middleware/auth";
import { botManager } from "../../bot/BotManager";
import { wsManager } from "../../websocket";

const router = Router();
router.use(authMiddleware);

// GET /api/meetings?candidateId=
router.get("/", async (req: AuthRequest, res: Response) => {
  const { candidateId } = req.query;
  if (!candidateId)
    return res.status(400).json({ error: "candidateId required" });

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId as string },
    select: { botId: true },
  });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  if (!(await requireBotAccess(req, res, candidate.botId))) return;

  const meetings = await prisma.meeting.findMany({
    where: { candidateId: candidateId as string },
    orderBy: { scheduledAt: "desc" },
  });
  return res.json(meetings);
});

// POST /api/meetings
router.post("/", async (req: AuthRequest, res: Response) => {
  const { candidateId, scheduledAt, note, reminderMinutes } = req.body;
  if (!candidateId || !scheduledAt)
    return res
      .status(400)
      .json({ error: "candidateId and scheduledAt required" });

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
  });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  if (!(await requireBotAccess(req, res, candidate.botId))) return;

  const meeting = await prisma.meeting.create({
    data: {
      candidateId,
      scheduledAt: new Date(scheduledAt),
      note: note || null,
      reminderMinutes: reminderMinutes ?? 30,
    },
  });

  // Notify candidate via Telegram
  const botInstance = botManager.getInstance(candidate.botId);
  if (botInstance && candidate.telegramId) {
    const dt = new Date(scheduledAt);
    await botInstance.sendMeetingNotification(
      candidate.telegramId,
      candidate.lang,
      "meeting_scheduled",
      {
        date: dt.toLocaleDateString("en-GB"),
        time: dt.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        note: note || "",
      },
      { candidateId, adminId: getAdminId(req) },
    );
  }

  wsManager.broadcast(
    { type: "MEETING_CREATED", payload: { candidateId, meeting } },
    candidate.botId,
  );

  return res.status(201).json(meeting);
});

// PUT /api/meetings/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const existing = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: { candidate: { select: { botId: true } } },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!(await requireBotAccess(req, res, existing.candidate.botId))) return;

  const { scheduledAt, note, reminderMinutes, status } = req.body;
  const data: any = {};
  if (scheduledAt !== undefined) data.scheduledAt = new Date(scheduledAt);
  if (note !== undefined) data.note = note;
  if (reminderMinutes !== undefined) data.reminderMinutes = reminderMinutes;
  if (status !== undefined) data.status = status;
  // Reset reminder if time changed
  if (scheduledAt !== undefined) data.reminderSent = false;

  const meeting = await prisma.meeting.update({
    where: { id: req.params.id },
    data,
  });

  // Notify candidate if meeting was cancelled
  if (status === "cancelled" && existing.status !== "cancelled") {
    const candidate = await prisma.candidate.findUnique({
      where: { id: existing.candidateId },
    });
    const botInstance = botManager.getInstance(existing.candidate.botId);
    if (botInstance && candidate?.telegramId) {
      const dt = existing.scheduledAt;
      await botInstance.sendMeetingNotification(
        candidate.telegramId,
        candidate.lang,
        "meeting_cancelled",
        {
          date: dt.toLocaleDateString("en-GB"),
          time: dt.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
        { candidateId: existing.candidateId, adminId: getAdminId(req) },
      );
    }
  }

  wsManager.broadcast(
    {
      type: "MEETING_UPDATED",
      payload: { candidateId: meeting.candidateId, meeting },
    },
    existing.candidate.botId,
  );

  return res.json(meeting);
});

// DELETE /api/meetings/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const existing = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: { candidate: { select: { botId: true } } },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!(await requireBotAccess(req, res, existing.candidate.botId))) return;

  // Notify candidate before deleting
  const candidate = await prisma.candidate.findUnique({
    where: { id: existing.candidateId },
  });
  const botInstance = botManager.getInstance(existing.candidate.botId);
  if (botInstance && candidate?.telegramId && existing.status !== "cancelled") {
    const dt = existing.scheduledAt;
    await botInstance.sendMeetingNotification(
      candidate.telegramId,
      candidate.lang,
      "meeting_cancelled",
      {
        date: dt.toLocaleDateString("en-GB"),
        time: dt.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      { candidateId: existing.candidateId, adminId: getAdminId(req) },
    );
  }

  await prisma.meeting.delete({ where: { id: req.params.id } });

  wsManager.broadcast(
    {
      type: "MEETING_DELETED",
      payload: {
        candidateId: existing.candidateId,
        meetingId: req.params.id,
      },
    },
    existing.candidate.botId,
  );

  return res.json({ success: true });
});

export default router;
