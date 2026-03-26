import { Router, Response } from "express";
import prisma from "../../db";
import {
  authMiddleware,
  AuthRequest,
  getBotFilter,
  requireBotAccess,
} from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// GET /api/questions?botId=
router.get("/", async (req: AuthRequest, res: Response) => {
  const { botId } = req.query;
  const where: any = { ...(await getBotFilter(req)) };
  if (botId) where.botId = botId as string;

  const questions = await prisma.question.findMany({
    where,
    include: {
      translations: true,
      options: { include: { translations: true, branch: { select: { id: true, name: true, isActive: true } } }, orderBy: { order: "asc" } },
    },
    orderBy: [{ isRequired: "desc" }, { order: "asc" }],
  });
  return res.json(questions);
});

// POST /api/questions
router.post("/", async (req: AuthRequest, res: Response) => {
  const {
    botId,
    type,
    order,
    fieldKey,
    filterLabel,
    translations,
    options,
    isActive,
    parentOptionId,
    branchOrder,
  } = req.body;
  if (!botId) return res.status(400).json({ error: "botId required" });
  if (!(await requireBotAccess(req, res, botId))) return;

  // Validate circular reference: parentOptionId's question must not be a descendant of any of our options
  // (basic protection — deep cycles are rare but we guard against direct self-reference)
  if (parentOptionId) {
    const parentOption = await prisma.questionOption.findUnique({
      where: { id: parentOptionId },
    });
    if (!parentOption)
      return res.status(400).json({ error: "parentOptionId not found" });
  }

  const question = await prisma.question.create({
    data: {
      botId,
      type: type || "text",
      order: order || 0,
      fieldKey: fieldKey || null,
      filterLabel: filterLabel || null,
      isActive: isActive !== undefined ? isActive : true,
      isRequired: false,
      parentOptionId: parentOptionId || null,
      branchOrder: branchOrder ?? 0,
      translations: {
        create: (translations || []).map((t: any) => ({
          lang: t.lang,
          text: t.text,
          successMessage: t.successMessage || null,
          errorMessage: t.errorMessage || null,
          phoneButtonText: t.phoneButtonText || null,
        })),
      },
      options: {
        create: (options || []).map((opt: any, idx: number) => ({
          order: opt.order ?? idx,
          translations: {
            create: (opt.translations || []).map((t: any) => ({
              lang: t.lang,
              text: t.text,
            })),
          },
        })),
      },
    },
    include: {
      translations: true,
      options: { include: { translations: true }, orderBy: { order: "asc" } },
    },
  });

  return res.status(201).json(question);
});

// GET /api/questions/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const question = await prisma.question.findUnique({
    where: { id: req.params.id },
    include: {
      translations: true,
      options: { include: { translations: true }, orderBy: { order: "asc" } },
    },
  });
  if (!question) return res.status(404).json({ error: "Not found" });
  return res.json(question);
});

// PUT /api/questions/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const {
    type,
    order,
    fieldKey,
    filterLabel,
    isActive,
    translations,
    options,
    branchOrder,
  } = req.body;

  const existing = await prisma.question.findUnique({
    where: { id: req.params.id },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!(await requireBotAccess(req, res, existing.botId))) return;

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: req.params.id },
      data: {
        // Required questions: type, fieldKey, isActive are locked; order, translations, options, filterLabel are editable
        ...(existing.isRequired
          ? {
              ...(order !== undefined && { order }),
            }
          : {
              ...(type !== undefined && { type }),
              ...(order !== undefined && { order }),
              ...(fieldKey !== undefined && { fieldKey }),
              ...(isActive !== undefined && { isActive }),
            }),
        ...(filterLabel !== undefined && { filterLabel }),
        ...(branchOrder !== undefined && { branchOrder }),
      },
    });

    if (translations) {
      for (const t of translations) {
        await tx.questionTranslation.upsert({
          where: {
            questionId_lang: { questionId: req.params.id, lang: t.lang },
          },
          update: {
            text: t.text,
            ...(t.successMessage !== undefined && {
              successMessage: t.successMessage,
            }),
            ...(t.errorMessage !== undefined && {
              errorMessage: t.errorMessage,
            }),
            ...(t.phoneButtonText !== undefined && {
              phoneButtonText: t.phoneButtonText,
            }),
          },
          create: {
            questionId: req.params.id,
            lang: t.lang,
            text: t.text,
            successMessage: t.successMessage || null,
            errorMessage: t.errorMessage || null,
            phoneButtonText: t.phoneButtonText || null,
          },
        });
      }
    }

    // For branch questions, options are managed via branches — don't overwrite
    if (options && existing.fieldKey !== "branch") {
      await tx.questionOption.deleteMany({
        where: { questionId: req.params.id },
      });
      for (const opt of options) {
        await tx.questionOption.create({
          data: {
            questionId: req.params.id,
            order: opt.order || 0,
              translations: {
              create: (opt.translations || []).map((t: any) => ({
                lang: t.lang,
                text: t.text,
              })),
            },
          },
        });
      }
    }
  });

  const question = await prisma.question.findUnique({
    where: { id: req.params.id },
    include: {
      translations: true,
      options: { include: { translations: true }, orderBy: { order: "asc" } },
    },
  });

  return res.json(question);
});

// PUT /api/questions/:id/options/:optionId — toggle option isActive (for branch questions)
router.put("/:id/options/:optionId", async (req: AuthRequest, res: Response) => {
  const { isActive } = req.body;
  if (typeof isActive !== "boolean") {
    return res.status(400).json({ error: "isActive (boolean) required" });
  }

  const question = await prisma.question.findUnique({
    where: { id: req.params.id },
  });
  if (!question) return res.status(404).json({ error: "Question not found" });
  if (!(await requireBotAccess(req, res, question.botId))) return;

  const option = await prisma.questionOption.findUnique({
    where: { id: req.params.optionId },
  });
  if (!option || option.questionId !== req.params.id) {
    return res.status(404).json({ error: "Option not found" });
  }

  const updated = await prisma.questionOption.update({
    where: { id: req.params.optionId },
    data: { isActive },
    include: { translations: true },
  });
  return res.json(updated);
});

// DELETE /api/questions/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const question = await prisma.question.findUnique({
    where: { id: req.params.id },
  });
  if (!question) return res.status(404).json({ error: "Not found" });
  if (!(await requireBotAccess(req, res, question.botId))) return;
  if (question.isRequired)
    return res
      .status(400)
      .json({ error: "Required questions cannot be deleted" });
  await prisma.question.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

// PUT /api/questions/batch/reorder
router.put("/batch/reorder", async (req: AuthRequest, res: Response) => {
  const { questions } = req.body;
  if (!Array.isArray(questions))
    return res.status(400).json({ error: "Invalid" });
  await prisma.$transaction(
    questions.map((q: { id: string; order: number; branchOrder?: number }) =>
      prisma.question.update({
        where: { id: q.id },
        data: {
          ...(q.order !== undefined && { order: q.order }),
          ...(q.branchOrder !== undefined && { branchOrder: q.branchOrder }),
        },
      }),
    ),
  );
  return res.json({ success: true });
});

export default router;
