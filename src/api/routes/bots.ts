import { Router, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../../db";
import { config } from "../../config";
import { JwtPayload } from "../../types";
import {
  authMiddleware,
  AuthRequest,
  getBotFilter,
  requireBotAccess,
  adminOnlyMiddleware,
} from "../middleware/auth";
import { botManager } from "../../bot/BotManager";
import axios from "axios";

const router = Router();
router.use(authMiddleware);

// GET /api/bots
router.get("/", async (req: AuthRequest, res: Response) => {
  const filter = await getBotFilter(req);
  const where: any = filter.botId ? { id: filter.botId } : {};

  const bots = await prisma.bot.findMany({
    where,
    include: {
      languages: true,
      _count: { select: { candidates: true, questions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json(bots);
});

// POST /api/bots (admins can always create; org users only if they have no bot yet)
router.post("/", async (req: AuthRequest, res: Response) => {
  // Org users: check they don't already have a bot
  if (req.admin?.type === "organization") {
    if (req.admin.botId) {
      return res.status(400).json({ error: "Organization already has a bot assigned" });
    }
  }

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

    // Check if org has branches (for seeding the branch question)
    const orgId =
      req.admin?.type === "organization" ? req.admin.organizationId : undefined;
    let orgBranches: { id: string; name: string }[] = [];
    if (orgId) {
      orgBranches = await prisma.branch.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }

    // Branch question comes first (order 0) if org has branches;
    // other required questions shift accordingly.
    const branchOffset = orgBranches.length > 0 ? 1 : 0;

    const requiredQuestions: any[] = [];

    // Seed branch question first if org has branches
    if (orgBranches.length > 0) {
      requiredQuestions.push({
        type: "choice",
        order: 0,
        isRequired: true,
        fieldKey: "branch",
        translations: {
          create: [
            {
              lang: "uz",
              text: "Qaysi filialda ishlashni xohlaysiz?",
            },
          ],
        },
        options: {
          create: orgBranches.map((b, idx) => ({
            order: idx,
            branchId: b.id,
            translations: {
              create: [{ lang: "uz", text: b.name }],
            },
          })),
        },
      });
    }

    requiredQuestions.push(
      {
        type: "text",
        order: branchOffset + 0,
        isRequired: true,
        fieldKey: "fullName",
        translations: {
          create: [
            { lang: "uz", text: "Ismingiz va familiyangizni kiriting?" },
          ],
        },
      },
      {
        type: "text",
        order: branchOffset + 1,
        isRequired: true,
        fieldKey: "age",
        translations: {
          create: [{ lang: "uz", text: "Yoshingiz necchi?" }],
        },
      },
      {
        type: "text",
        order: branchOffset + 2,
        isRequired: true,
        fieldKey: "phone",
        translations: {
          create: [
            { lang: "uz", text: "Telefon raqamingizni kiriting?" },
          ],
        },
      },
      {
        type: "attachment",
        order: branchOffset + 3,
        isRequired: true,
        fieldKey: "profilePhoto",
        translations: {
          create: [
            { lang: "uz", text: "Iltimos, profil rasmingizni yuboring." },
          ],
        },
      },
      {
        type: "choice",
        order: branchOffset + 4,
        isRequired: true,
        fieldKey: "position",
        translations: {
          create: [
            {
              lang: "uz",
              text: "Qaysi lavozimga ariza topshirmoqdasiz?",
            },
          ],
        },
      },
    );

    const bot = await prisma.bot.create({
      data: {
        token,
        name: name || botInfo.first_name,
        username: botInfo.username,
        defaultLang: "uz",
        // If org user, assign bot to their organization
        ...(req.admin?.type === "organization" && req.admin.organizationId
          ? { organizationId: req.admin.organizationId }
          : {}),
        languages: {
          create: [{ code: "uz", name: "O'zbek", isDefault: true }],
        },
        questions: {
          create: requiredQuestions,
        },
      },
      include: { languages: true },
    });

    // Start the bot (non-fatal — bot is already persisted)
    try {
      await botManager.startBot(bot.id, token);
    } catch (startErr) {
      console.error("Failed to start bot after creation:", startErr);
    }

    // For org users: return a refreshed JWT with the new botId
    if (req.admin?.type === "organization") {
      // Destructure out JWT internal fields (iat, exp) before re-signing
      const { iat, exp, ...rest } = req.admin as any;
      const newPayload: JwtPayload = {
        ...rest,
        botId: bot.id,
      };
      const newToken = jwt.sign(newPayload, config.jwtSecret, { expiresIn: "7d" });
      return res.status(201).json({ ...bot, newToken });
    }

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
  if (!(await requireBotAccess(req, res, req.params.id))) return;
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
  if (!(await requireBotAccess(req, res, req.params.id))) return;
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
  if (!(await requireBotAccess(req, res, req.params.id))) return;
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

// DELETE /api/bots/:id (admin only)
router.delete("/:id", adminOnlyMiddleware, async (req: AuthRequest, res: Response) => {
  await botManager.stopBot(req.params.id);
  await prisma.bot.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

// --- Languages ---
// GET /api/bots/:id/languages
router.get("/:id/languages", async (req: AuthRequest, res: Response) => {
  if (!(await requireBotAccess(req, res, req.params.id))) return;
  const languages = await prisma.botLanguage.findMany({
    where: { botId: req.params.id },
  });
  return res.json(languages);
});

// POST /api/bots/:id/languages
router.post("/:id/languages", async (req: AuthRequest, res: Response) => {
  if (!(await requireBotAccess(req, res, req.params.id))) return;
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
    if (!(await requireBotAccess(req, res, req.params.id))) return;
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
