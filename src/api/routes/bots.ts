import { Router, Response } from "express";
import prisma from "../../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { botManager } from "../../bot/BotManager";
import axios from "axios";

const router = Router();
router.use(authMiddleware);

// GET /api/bots
router.get("/", async (req: AuthRequest, res: Response) => {
  const bots = await prisma.bot.findMany({
    include: {
      languages: true,
      _count: { select: { candidates: true, questions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json(bots);
});

// POST /api/bots
router.post("/", async (req: AuthRequest, res: Response) => {
  const { token, name } = req.body;
  if (!token || !name)
    return res.status(400).json({ error: "token and name required" });

  // Validate token with Telegram
  try {
    const tgRes = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
    const botInfo = tgRes.data.result;

    const existing = await prisma.bot.findUnique({ where: { token } });
    if (existing)
      return res
        .status(400)
        .json({ error: "Bot with this token already exists" });

    const bot = await prisma.bot.create({
      data: {
        token,
        name: name || botInfo.first_name,
        username: botInfo.username,
        languages: {
          create: [{ code: "en", name: "English", isDefault: true }],
        },
        // Seed the 4 required questions immediately
        questions: {
          create: [
            {
              type: "text",
              order: 0,
              isRequired: true,
              fieldKey: "fullName",
              translations: {
                create: [{ lang: "en", text: "What is your full name?" }],
              },
            },
            {
              type: "text",
              order: 1,
              isRequired: true,
              fieldKey: "age",
              translations: {
                create: [{ lang: "en", text: "How old are you?" }],
              },
            },
            {
              type: "text",
              order: 2,
              isRequired: true,
              fieldKey: "phone",
              translations: {
                create: [{ lang: "en", text: "What is your phone number?" }],
              },
            },
            {
              type: "attachment",
              order: 3,
              isRequired: true,
              fieldKey: "profilePhoto",
              translations: {
                create: [
                  { lang: "en", text: "Please upload your profile photo." },
                ],
              },
            },
            {
              type: "choice",
              order: 4,
              isRequired: true,
              fieldKey: "position",
              translations: {
                create: [
                  { lang: "en", text: "Which position are you applying for?" },
                ],
              },
            },
          ],
        },
      },
      include: { languages: true },
    });

    // Start the bot
    await botManager.startBot(bot.id, token);

    return res.status(201).json(bot);
  } catch (error: any) {
    if (error.response?.status === 401) {
      return res.status(400).json({ error: "Invalid bot token" });
    }
    return res.status(500).json({ error: "Failed to validate token" });
  }
});

// GET /api/bots/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const bot = await prisma.bot.findUnique({
    where: { id: req.params.id },
    include: {
      languages: true,
      _count: { select: { candidates: true, questions: true } },
    },
  });
  if (!bot) return res.status(404).json({ error: "Not found" });
  return res.json(bot);
});

// PUT /api/bots/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name, defaultLang, isActive } = req.body;
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (defaultLang !== undefined) updateData.defaultLang = defaultLang;
  if (isActive !== undefined) updateData.isActive = isActive;

  const bot = await prisma.bot.update({
    where: { id: req.params.id },
    data: updateData,
    include: { languages: true },
  });

  if (isActive === false) {
    await botManager.stopBot(bot.id);
  } else if (isActive === true && !botManager.getInstance(bot.id)) {
    await botManager.startBot(bot.id, bot.token);
  }

  return res.json(bot);
});

// PUT /api/bots/:id/token  — update bot token (restarts the bot)
router.put("/:id/token", async (req: AuthRequest, res: Response) => {
  const { token } = req.body;
  if (!token?.trim()) return res.status(400).json({ error: "token required" });

  // Validate new token with Telegram
  try {
    const tgRes = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
    const botInfo = tgRes.data.result;

    // Make sure it's not already used by another bot
    const conflict = await prisma.bot.findFirst({
      where: { token, id: { not: req.params.id } },
    });
    if (conflict)
      return res
        .status(400)
        .json({ error: "Token already in use by another bot" });

    // Stop old instance
    await botManager.stopBot(req.params.id);

    const bot = await prisma.bot.update({
      where: { id: req.params.id },
      data: { token, username: botInfo.username, updatedAt: new Date() },
      include: { languages: true },
    });

    // Restart with new token
    await botManager.startBot(bot.id, token);

    return res.json(bot);
  } catch (error: any) {
    if (error.response?.status === 401) {
      return res.status(400).json({ error: "Invalid bot token" });
    }
    return res.status(500).json({ error: "Failed to validate token" });
  }
});

// DELETE /api/bots/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  await botManager.stopBot(req.params.id);
  await prisma.bot.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

// --- Languages ---
// GET /api/bots/:id/languages
router.get("/:id/languages", async (req: AuthRequest, res: Response) => {
  const languages = await prisma.botLanguage.findMany({
    where: { botId: req.params.id },
  });
  return res.json(languages);
});

// POST /api/bots/:id/languages
router.post("/:id/languages", async (req: AuthRequest, res: Response) => {
  const { code, name, isDefault } = req.body;
  if (!code || !name)
    return res.status(400).json({ error: "code and name required" });

  const existing = await prisma.botLanguage.findUnique({
    where: { botId_code: { botId: req.params.id, code } },
  });
  if (existing)
    return res.status(400).json({ error: "Language already exists" });

  const lang = await prisma.botLanguage.create({
    data: { botId: req.params.id, code, name, isDefault: isDefault || false },
  });

  if (isDefault) {
    await prisma.botLanguage.updateMany({
      where: { botId: req.params.id, id: { not: lang.id } },
      data: { isDefault: false },
    });
    await prisma.bot.update({
      where: { id: req.params.id },
      data: { defaultLang: code },
    });
  }

  return res.status(201).json(lang);
});

// DELETE /api/bots/:id/languages/:langId
router.delete(
  "/:id/languages/:langId",
  async (req: AuthRequest, res: Response) => {
    const lang = await prisma.botLanguage.findUnique({
      where: { id: req.params.langId },
    });
    if (!lang || lang.isDefault) {
      return res.status(400).json({ error: "Cannot delete default language" });
    }
    await prisma.botLanguage.delete({ where: { id: req.params.langId } });
    return res.json({ success: true });
  },
);

export default router;
