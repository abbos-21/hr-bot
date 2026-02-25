import { Router, Response } from 'express';
import prisma from '../../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// GET /api/jobs?botId=
router.get('/', async (req: AuthRequest, res: Response) => {
  const { botId } = req.query;
  const where = botId ? { botId: botId as string } : {};

  const jobs = await prisma.job.findMany({
    where,
    include: {
      translations: true,
      _count: { select: { candidates: true, questions: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(jobs);
});

// POST /api/jobs
router.post('/', async (req: AuthRequest, res: Response) => {
  const { botId, translations, isActive } = req.body;
  if (!botId) return res.status(400).json({ error: 'botId required' });

  const job = await prisma.job.create({
    data: {
      botId,
      isActive: isActive !== undefined ? isActive : true,
      translations: {
        create: (translations || []).map((t: any) => ({
          lang: t.lang,
          title: t.title,
          description: t.description || '',
        })),
      },
    },
    include: { translations: true },
  });

  return res.status(201).json(job);
});

// GET /api/jobs/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    include: {
      translations: true,
      _count: { select: { candidates: true, questions: true } },
    },
  });
  if (!job) return res.status(404).json({ error: 'Not found' });
  return res.json(job);
});

// PUT /api/jobs/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { isActive, translations } = req.body;

  await prisma.$transaction(async (tx) => {
    if (isActive !== undefined) {
      await tx.job.update({
        where: { id: req.params.id },
        data: { isActive },
      });
    }

    if (translations) {
      for (const t of translations) {
        await tx.jobTranslation.upsert({
          where: { jobId_lang: { jobId: req.params.id, lang: t.lang } },
          update: { title: t.title, description: t.description || '' },
          create: { jobId: req.params.id, lang: t.lang, title: t.title, description: t.description || '' },
        });
      }
    }
  });

  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    include: { translations: true },
  });

  return res.json(job);
});

// DELETE /api/jobs/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.job.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

export default router;
