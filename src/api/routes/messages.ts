import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import prisma from "../../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
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

// GET /api/messages/:candidateId
router.get("/:candidateId", async (req: AuthRequest, res: Response) => {
  const messages = await prisma.message.findMany({
    where: { candidateId: req.params.candidateId },
    include: { admin: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return res.json(messages);
});

// POST /api/messages/:candidateId - send text message
router.post("/:candidateId", async (req: AuthRequest, res: Response) => {
  const { text, type } = req.body;
  const candidateId = req.params.candidateId;

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
  });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  if (candidate.status === "incomplete") {
    return res
      .status(400)
      .json({ error: "Cannot message candidate with incomplete status" });
  }

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
      adminId: req.admin!.adminId,
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

    if (candidate.status === "incomplete") {
      return res
        .status(400)
        .json({ error: "Cannot message candidate with incomplete status" });
    }

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
        adminId: req.admin!.adminId,
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
