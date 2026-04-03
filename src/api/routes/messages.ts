import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import prisma from "../../db";
import {
  authMiddleware,
  AuthRequest,
  getBotFilter,
  requireBotAccess,
  getAdminId,
} from "../middleware/auth";
import { botManager } from "../../bot/BotManager";
import { wsManager } from "../../websocket";
import { config } from "../../config";

const router = Router();
router.use(authMiddleware);

// Multer config for message file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(config.uploadDir, "messages");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/messages/conversations - list all candidates with messages, latest first
router.get("/conversations", async (req: AuthRequest, res: Response) => {
  // Get all candidates that have at least one message
  const candidates = await prisma.candidate.findMany({
    where: { messages: { some: {} }, ...(await getBotFilter(req)) },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      bot: { select: { name: true } },
    },
    orderBy: { lastActivity: "desc" },
  });

  const unreadCounts = await prisma.message.groupBy({
    by: ["candidateId"],
    where: {
      candidateId: { in: candidates.map((c) => c.id) },
      direction: "inbound",
      isRead: false,
    },
    _count: { id: true },
  });

  const unreadMap: Record<string, number> = {};
  unreadCounts.forEach((r) => {
    unreadMap[r.candidateId] = r._count.id;
  });

  return res.json(
    candidates.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      username: c.username,
      profilePhoto: c.profilePhoto,
      botId: c.botId,
      botName: c.bot?.name,
      lastMessage: c.messages[0] || null,
      unreadCount: unreadMap[c.id] || 0,
      lastActivity: c.lastActivity,
    })),
  );
});

// GET /api/messages/:candidateId
router.get("/:candidateId", async (req: AuthRequest, res: Response) => {
  const candidate = await prisma.candidate.findUnique({
    where: { id: req.params.candidateId },
    select: { botId: true },
  });
  if (candidate && !(await requireBotAccess(req, res, candidate.botId))) return;
  const messages = await prisma.message.findMany({
    where: { candidateId: req.params.candidateId },
    include: { admin: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return res.json(messages);
});

// POST /api/messages/broadcast — send the same text to many candidates at once
router.post("/broadcast", async (req: AuthRequest, res: Response) => {
  const { candidateIds, text } = req.body;
  if (!Array.isArray(candidateIds) || !candidateIds.length)
    return res.status(400).json({ error: "candidateIds array required" });
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  const candidates = await prisma.candidate.findMany({
    where: { id: { in: candidateIds } },
  });

  // Track (botId:telegramId) pairs already sent so the same Telegram user
  // doesn't receive multiple copies when they have more than one candidate
  // record in the same column (allowed since multiple applications are enabled).
  const telegramSent = new Set<string>();

  // --- Phase 1: Send Telegram messages with concurrency limit (25 at a time) ---
  const CONCURRENCY = 25;
  const telegramResults = new Map<string, number | undefined>();

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (candidate) => {
        const botInstance = botManager.getInstance(candidate.botId);
        const telegramKey = `${candidate.botId}:${candidate.telegramId}`;
        if (botInstance && candidate.telegramId && !telegramSent.has(telegramKey)) {
          telegramSent.add(telegramKey);
          try {
            const msgId = await botInstance.sendMessageToCandidate(
              candidate.telegramId,
              { type: "text", text: text.trim() },
            );
            telegramResults.set(candidate.id, msgId);
          } catch {
            // Telegram send failed — will still record the DB message
          }
        }
      }),
    );
  }

  // --- Phase 2: Persist messages + update activity in parallel ---
  let sent = 0;
  let failed = 0;
  const adminId = getAdminId(req);

  const results = await Promise.allSettled(
    candidates.map(async (candidate) => {
      const telegramMsgId = telegramResults.get(candidate.id);
      const message = await prisma.message.create({
        data: {
          candidateId: candidate.id,
          adminId,
          direction: "outbound",
          type: "text",
          text: text.trim(),
          telegramMsgId,
        },
        include: { admin: { select: { id: true, name: true } } },
      });
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { lastActivity: new Date() },
      });
      wsManager.broadcast({
        type: "NEW_MESSAGE",
        payload: { candidateId: candidate.id, message },
      });
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") sent++;
    else failed++;
  }

  return res.json({ sent, failed, total: candidates.length });
});

// POST /api/messages/:candidateId - send text message
router.post("/:candidateId", async (req: AuthRequest, res: Response) => {
  const { text, type } = req.body;
  const candidateId = req.params.candidateId;

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
  });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const msgType = type || "text";
  if (msgType === "text" && !text) {
    return res.status(400).json({ error: "text required for text message" });
  }

  const botInstance = botManager.getInstance(candidate.botId);
  let telegramMsgId: number | undefined;

  if (botInstance) {
    telegramMsgId = await botInstance.sendMessageToCandidate(
      candidate.telegramId,
      {
        type: msgType,
        text,
      },
    );
  }

  const message = await prisma.message.create({
    data: {
      candidateId,
      adminId: getAdminId(req),
      direction: "outbound",
      type: msgType,
      text,
      telegramMsgId,
    },
    include: { admin: { select: { id: true, name: true } } },
  });

  await prisma.candidate.update({
    where: { id: candidateId },
    data: { lastActivity: new Date() },
  });

  wsManager.broadcast({
    type: "NEW_MESSAGE",
    payload: { candidateId, message, direction: "outbound" },
  });

  return res.status(201).json(message);
});

// POST /api/messages/:candidateId/media - send media message
router.post(
  "/:candidateId/media",
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    const candidateId = req.params.candidateId;
    const { messageType, caption } = req.body;

    if (!req.file) return res.status(400).json({ error: "File required" });

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate)
      return res.status(404).json({ error: "Candidate not found" });

    const localPath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;

    // Determine type from MIME or messageType param
    let type = messageType || "document";
    if (mimeType.startsWith("image/")) type = "photo";
    else if (mimeType.startsWith("video/")) type = "video";
    else if (mimeType.startsWith("audio/")) {
      type = mimeType.includes("ogg") ? "voice" : "audio";
    }

    const botInstance = botManager.getInstance(candidate.botId);
    let telegramMsgId: number | undefined;
    let fileId: string | undefined;

    if (botInstance) {
      telegramMsgId = await botInstance.sendMessageToCandidate(
        candidate.telegramId,
        {
          type,
          localPath,
          caption,
          fileName, // pass original name so Telegram shows it instead of the munged disk name
        },
      );
    }

    const message = await prisma.message.create({
      data: {
        candidateId,
        adminId: getAdminId(req),
        direction: "outbound",
        type,
        text: caption,
        fileId,
        fileName,
        mimeType,
        localPath,
        telegramMsgId,
      },
      include: { admin: { select: { id: true, name: true } } },
    });

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { lastActivity: new Date() },
    });

    wsManager.broadcast({
      type: "NEW_MESSAGE",
      payload: { candidateId, message },
    });

    return res.status(201).json(message);
  },
);

// POST /api/messages/:candidateId/read
// Marks all unread inbound messages for this candidate as read.
// Returns the updated unread count (always 0 on success).
router.post("/:candidateId/read", async (req: AuthRequest, res: Response) => {
  const { candidateId } = req.params;

  await prisma.message.updateMany({
    where: {
      candidateId,
      direction: "inbound",
      isRead: false,
    },
    data: { isRead: true },
  });

  // Broadcast so all open admin tabs update their badge instantly.
  wsManager.broadcast({
    type: "MESSAGES_READ",
    payload: { candidateId, unreadCount: 0 },
  });

  return res.json({ unreadCount: 0 });
});

export default router;
