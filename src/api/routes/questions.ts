import { Router, Response } from 'express';
import prisma from '../../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// GET /api/questions?botId=&jobId=
router.get('/', async (req: AuthRequest, res: Response) => {
  const { botId, jobId } = req.query;
  const where: any = {};
  if (botId) where.botId = botId as string;
  if (jobId) where.jobId = jobId as string;

  const questions = await prisma.question.findMany({
    where,
    include: {
      translations: true,
      options: {
        include: { translations: true },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
  });
  return res.json(questions);
});

// POST /api/questions
router.post('/', async (req: AuthRequest, res: Response) => {
  const { botId, jobId, type, order, fieldKey, translations, options, isActive } = req.body;
  if (!botId) return res.status(400).json({ error: 'botId required' });

  const question = await prisma.question.create({
    data: {
      botId,
      jobId: jobId || null,
      type: type || 'text',
      order: order || 0,
      fieldKey: fieldKey || null,
      isActive: isActive !== undefined ? isActive : true,
      translations: {
        create: (translations || []).map((t: any) => ({
          lang: t.lang,
          text: t.text,
        })),
      },
      options: {
        create: (options || []).map((opt: any, idx: number) => ({
          order: opt.order || idx,
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
      options: { include: { translations: true }, orderBy: { order: 'asc' } },
    },
  });

  return res.status(201).json(question);
});

// GET /api/questions/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const question = await prisma.question.findUnique({
    where: { id: req.params.id },
    include: {
      translations: true,
      options: {
        include: { translations: true },
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!question) return res.status(404).json({ error: 'Not found' });
  return res.json(question);
});

// PUT /api/questions/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { type, order, fieldKey, isActive, translations, options } = req.body;

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: req.params.id },
      data: {
        ...(type !== undefined && { type }),
        ...(order !== undefined && { order }),
        ...(fieldKey !== undefined && { fieldKey }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    if (translations) {
      for (const t of translations) {
        await tx.questionTranslation.upsert({
          where: { questionId_lang: { questionId: req.params.id, lang: t.lang } },
          update: { text: t.text },
          create: { questionId: req.params.id, lang: t.lang, text: t.text },
        });
      }
    }

    if (options) {
      // Delete existing options and recreate
      await tx.questionOption.deleteMany({ where: { questionId: req.params.id } });
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
      options: { include: { translations: true }, orderBy: { order: 'asc' } },
    },
  });

  return res.json(question);
});

// DELETE /api/questions/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.question.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

// PUT /api/questions/reorder - batch reorder
router.put('/batch/reorder', async (req: AuthRequest, res: Response) => {
  const { questions } = req.body; // [{id, order}]
  if (!Array.isArray(questions)) return res.status(400).json({ error: 'Invalid' });

  await prisma.$transaction(
    questions.map((q: { id: string; order: number }) =>
      prisma.question.update({ where: { id: q.id }, data: { order: q.order } })
    )
  );

  return res.json({ success: true });
});

export default router;
