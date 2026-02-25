import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import prisma from "../../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { config } from "../../config";
import { JwtPayload } from "../../types";

const router = Router();

// ─── Token-in-query-param middleware ─────────────────────────────────────────
//
// Browser <img src>, <audio src>, and <a href> cannot send Authorization
// headers.  For media/download endpoints we accept the JWT as a ?token= query
// param so the browser can load files directly.
//
const tokenQueryAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  // Prefer Authorization header (API calls); fall back to ?token= (browser URLs)
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : queryToken;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    req.admin = jwt.verify(token, config.jwtSecret) as JwtPayload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Multer storage (kept for future admin-upload endpoints)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(config.uploadDir, "admin-uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Routes that need normal auth only ───────────────────────────────────────

router.get(
  "/candidate/:candidateId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const files = await prisma.candidateFile.findMany({
      where: { candidateId: req.params.candidateId },
      orderBy: { createdAt: "desc" },
    });
    return res.json(files);
  },
);

// ─── Routes used directly by the browser (img/audio/anchor) ─────────────────
// These accept ?token= so no custom headers are needed.

// GET /api/files/serve/:messageId  – inline display (images, audio, etc.)
router.get(
  "/serve/:messageId",
  tokenQueryAuth,
  async (req: AuthRequest, res: Response) => {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
    });
    if (!message || !message.localPath)
      return res.status(404).json({ error: "Not found" });

    if (!fs.existsSync(message.localPath))
      return res.status(404).json({ error: "File not on disk" });

    // Inline: browsers display rather than download
    res.setHeader("Content-Disposition", "inline");
    if (message.mimeType) res.setHeader("Content-Type", message.mimeType);
    return res.sendFile(path.resolve(message.localPath));
  },
);

// GET /api/files/download/:fileId  – candidate uploaded files (force download)
router.get(
  "/download/:fileId",
  tokenQueryAuth,
  async (req: AuthRequest, res: Response) => {
    const file = await prisma.candidateFile.findUnique({
      where: { id: req.params.fileId },
    });
    if (!file) return res.status(404).json({ error: "File not found" });

    if (file.localPath && fs.existsSync(file.localPath)) {
      return res.download(file.localPath, file.fileName);
    }
    return res.status(404).json({ error: "File not found on disk" });
  },
);

// GET /api/files/message/:messageId  – message attachment download
router.get(
  "/message/:messageId",
  tokenQueryAuth,
  async (req: AuthRequest, res: Response) => {
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
    });
    if (!message) return res.status(404).json({ error: "Message not found" });

    if (message.localPath && fs.existsSync(message.localPath)) {
      return res.download(message.localPath, message.fileName || "file");
    }
    return res.status(404).json({ error: "File not found on disk" });
  },
);

export default router;
