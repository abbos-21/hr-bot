import { Router, Response } from "express";
import prisma from "../../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const INCLUDE_FULL = {
  items: {
    include: {
      question: {
        include: {
          translations: true,
          options: {
            include: { translations: true },
            orderBy: { order: "asc" as const },
          },
        },
      },
    },
    orderBy: { order: "asc" as const },
  },
};

// ─── Helper: deep-copy one library question into a job ────────────────────────

async function copyQuestionToJob(
  source: any,
  jobId: string,
  templateId: string | null,
  order: number,
) {
  return prisma.question.create({
    data: {
      botId: source.botId,
      jobId,
      type: source.type,
      order,
      fieldKey: source.fieldKey || null,
      isActive: true,
      sourceTemplateId: templateId,
      sourceQuestionId: source.id,
      translations: {
        create: source.translations.map((t: any) => ({
          lang: t.lang,
          text: t.text,
        })),
      },
      options: {
        create: source.options.map((opt: any) => ({
          order: opt.order,
          translations: {
            create: opt.translations.map((t: any) => ({
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
}

// ─── Helper: distinct jobIds that are linked to a template ────────────────────

async function linkedJobIds(templateId: string): Promise<string[]> {
  const rows = await prisma.question.findMany({
    where: { sourceTemplateId: templateId, jobId: { not: null } },
    select: { jobId: true },
    distinct: ["jobId"],
  });
  return rows.map((r) => r.jobId as string);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

router.get("/", async (req: AuthRequest, res: Response) => {
  const { botId } = req.query;
  const where: any = {};
  if (botId) where.botId = botId as string;
  const templates = await prisma.questionTemplate.findMany({
    where,
    include: INCLUDE_FULL,
    orderBy: { createdAt: "asc" },
  });
  return res.json(templates);
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { botId, name } = req.body;
  if (!botId || !name)
    return res.status(400).json({ error: "botId and name required" });
  const template = await prisma.questionTemplate.create({
    data: { botId, name },
    include: INCLUDE_FULL,
  });
  return res.status(201).json(template);
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  const template = await prisma.questionTemplate.update({
    where: { id: req.params.id },
    data: { ...(name !== undefined && { name }), updatedAt: new Date() },
    include: INCLUDE_FULL,
  });
  return res.json(template);
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  // SetNull cascade clears sourceTemplateId on linked job questions.
  // Job questions themselves remain so admins keep their survey intact.
  await prisma.questionTemplate.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

// ─── Template items ───────────────────────────────────────────────────────────

// POST /api/templates/:id/items
// Add library question to template AND push to all linked jobs.
router.post("/:id/items", async (req: AuthRequest, res: Response) => {
  const templateId = req.params.id;
  const { questionId, order } = req.body;
  if (!questionId)
    return res.status(400).json({ error: "questionId required" });

  const source = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      translations: true,
      options: { include: { translations: true }, orderBy: { order: "asc" } },
    },
  });
  if (!source) return res.status(404).json({ error: "Question not found" });

  const maxItem = await prisma.questionTemplateItem.findFirst({
    where: { templateId },
    orderBy: { order: "desc" },
  });
  const nextOrder =
    order !== undefined ? order : maxItem ? maxItem.order + 1 : 0;

  const item = await prisma.questionTemplateItem.create({
    data: { templateId, questionId, order: nextOrder },
    include: {
      question: {
        include: {
          translations: true,
          options: {
            include: { translations: true },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  // Sync: push to every job already using this template
  const jobIds = await linkedJobIds(templateId);
  for (const jobId of jobIds) {
    const existing = await prisma.question.findFirst({
      where: {
        jobId,
        sourceTemplateId: templateId,
        sourceQuestionId: questionId,
      },
    });
    if (existing) continue;
    const lastQ = await prisma.question.findFirst({
      where: { jobId },
      orderBy: { order: "desc" },
    });
    await copyQuestionToJob(
      source,
      jobId,
      templateId,
      lastQ ? lastQ.order + 1 : 0,
    );
  }

  return res.status(201).json(item);
});

// DELETE /api/templates/:id/items/:itemId
// Remove from template AND delete matching job questions in all linked jobs.
router.delete("/:id/items/:itemId", async (req: AuthRequest, res: Response) => {
  const templateId = req.params.id;

  const item = await prisma.questionTemplateItem.findUnique({
    where: { id: req.params.itemId },
  });
  if (!item) return res.status(404).json({ error: "Item not found" });

  // Delete matching job questions first (answers cascade-delete via Prisma)
  await prisma.question.deleteMany({
    where: {
      sourceTemplateId: templateId,
      sourceQuestionId: item.questionId,
      jobId: { not: null },
    },
  });

  await prisma.questionTemplateItem.delete({
    where: { id: req.params.itemId },
  });

  return res.json({ success: true });
});

router.put("/:id/items/reorder", async (req: AuthRequest, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items))
    return res.status(400).json({ error: "items array required" });
  await prisma.$transaction(
    items.map((item: { id: string; order: number }) =>
      prisma.questionTemplateItem.update({
        where: { id: item.id },
        data: { order: item.order },
      }),
    ),
  );
  return res.json({ success: true });
});

// ─── Apply to job ─────────────────────────────────────────────────────────────

// POST /api/templates/:id/apply-to-job
router.post("/:id/apply-to-job", async (req: AuthRequest, res: Response) => {
  const templateId = req.params.id;
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: "jobId required" });

  const template = await prisma.questionTemplate.findUnique({
    where: { id: templateId },
    include: INCLUDE_FULL,
  });
  if (!template) return res.status(404).json({ error: "Template not found" });

  const lastQ = await prisma.question.findFirst({
    where: { jobId },
    orderBy: { order: "desc" },
  });
  let baseOrder = lastQ ? lastQ.order + 1 : 0;

  const created = await Promise.all(
    template.items.map((item) =>
      copyQuestionToJob(item.question, jobId, templateId, baseOrder++),
    ),
  );

  return res.status(201).json(created);
});

// POST /api/templates/apply-question-to-job
router.post(
  "/apply-question-to-job",
  async (req: AuthRequest, res: Response) => {
    const { questionId, jobId } = req.body;
    if (!questionId || !jobId)
      return res.status(400).json({ error: "questionId and jobId required" });

    const source = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        translations: true,
        options: { include: { translations: true }, orderBy: { order: "asc" } },
      },
    });
    if (!source) return res.status(404).json({ error: "Question not found" });

    const lastQ = await prisma.question.findFirst({
      where: { jobId },
      orderBy: { order: "desc" },
    });

    const created = await copyQuestionToJob(
      source,
      jobId,
      null,
      lastQ ? lastQ.order + 1 : 0,
    );
    return res.status(201).json(created);
  },
);

export default router;
