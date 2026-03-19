import { Router, Response } from "express";
import prisma from "../../db";
import { authMiddleware, AuthRequest, isAdmin } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

/**
 * Find or create the branch question for an organization's bot.
 * Returns the question ID, or null if no bot is assigned.
 */
async function ensureBranchQuestion(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { bot: { select: { id: true, defaultLang: true, languages: true } } },
  });
  if (!org?.bot) return null;

  const botId = org.bot.id;

  // Check if branch question already exists
  let branchQ = await prisma.question.findFirst({
    where: { botId, fieldKey: "branch", isRequired: true },
  });

  if (!branchQ) {
    // Branch question goes first (order 0); shift all existing questions up by 1
    await prisma.question.updateMany({
      where: { botId },
      data: { order: { increment: 1 } },
    });

    // Create translations for all bot languages
    const langs = org.bot.languages;
    const defaultLang = org.bot.defaultLang || "uz";
    const translations = langs.map((l: any) => ({
      lang: l.code,
      text: l.code === "uz" ? "Qaysi filialda ishlashni xohlaysiz?" :
            l.code === "ru" ? "В каком филиале вы хотите работать?" :
            "Which branch do you want to work at?",
    }));
    if (translations.length === 0) {
      translations.push({ lang: defaultLang, text: "Qaysi filialda ishlashni xohlaysiz?" });
    }

    branchQ = await prisma.question.create({
      data: {
        botId,
        type: "choice",
        order: 0,
        isRequired: true,
        fieldKey: "branch",
        translations: { create: translations },
      },
    });
  }

  return branchQ.id;
}

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

  // Auto-add option to branch question
  const branchQId = await ensureBranchQuestion(organizationId);
  if (branchQId) {
    const maxOpt = await prisma.questionOption.findFirst({
      where: { questionId: branchQId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const bot = await prisma.bot.findFirst({
      where: { organizationId },
      include: { languages: true },
    });
    const langs = bot?.languages || [];
    await prisma.questionOption.create({
      data: {
        questionId: branchQId,
        order: (maxOpt?.order ?? -1) + 1,
        branchId: branch.id,
        translations: {
          create: langs.length > 0
            ? langs.map((l: any) => ({ lang: l.code, text: name }))
            : [{ lang: "uz", text: name }],
        },
      },
    });
  }

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

  // Sync option text if branch name changed
  if (name !== undefined) {
    const linkedOptions = await prisma.questionOption.findMany({
      where: { branchId: req.params.id },
      select: { id: true },
    });
    for (const opt of linkedOptions) {
      await prisma.questionOptionTranslation.updateMany({
        where: { optionId: opt.id },
        data: { text: name },
      });
    }
  }

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

  // Delete linked question options before deleting the branch
  await prisma.questionOption.deleteMany({ where: { branchId: req.params.id } });

  await prisma.branch.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});

export default router;
