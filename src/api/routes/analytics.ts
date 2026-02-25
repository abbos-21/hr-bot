import { Router, Response } from 'express';
import prisma from '../../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { CANDIDATE_STATUSES } from '../../config';

const router = Router();
router.use(authMiddleware);

// GET /api/analytics/overview?botId=
router.get('/overview', async (req: AuthRequest, res: Response) => {
  const { botId } = req.query;
  const where: any = botId ? { botId: botId as string } : {};

  const [totalCandidates, byStatus, totalBots, totalJobs] = await Promise.all([
    prisma.candidate.count({ where }),
    prisma.candidate.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    }),
    prisma.bot.count(),
    prisma.job.count({ where: botId ? { botId: botId as string } : {} }),
  ]);

  const statusMap: Record<string, number> = {};
  CANDIDATE_STATUSES.forEach((s) => (statusMap[s] = 0));
  byStatus.forEach((item) => {
    statusMap[item.status] = item._count.id;
  });

  return res.json({
    totalCandidates,
    totalBots,
    totalJobs,
    byStatus: statusMap,
    conversionRate:
      totalCandidates > 0
        ? Math.round(((statusMap.hired || 0) / totalCandidates) * 100)
        : 0,
  });
});

// GET /api/analytics/per-job?botId=
router.get('/per-job', async (req: AuthRequest, res: Response) => {
  const { botId } = req.query;
  const where: any = botId ? { botId: botId as string } : {};

  const jobs = await prisma.job.findMany({
    where,
    include: {
      translations: true,
      _count: { select: { candidates: true } },
      candidates: {
        select: { status: true },
      },
    },
  });

  const result = jobs.map((job) => {
    const counts: Record<string, number> = {};
    CANDIDATE_STATUSES.forEach((s) => (counts[s] = 0));
    job.candidates.forEach((c) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });

    return {
      jobId: job.id,
      title: job.translations[0]?.title || 'Untitled',
      total: job._count.candidates,
      byStatus: counts,
    };
  });

  return res.json(result);
});

// GET /api/analytics/activity?botId=&days=
router.get('/activity', async (req: AuthRequest, res: Response) => {
  const { botId, days = '30' } = req.query;
  const daysNum = parseInt(days as string, 10) || 30;

  const since = new Date();
  since.setDate(since.getDate() - daysNum);

  const where: any = {
    createdAt: { gte: since },
    ...(botId ? { botId: botId as string } : {}),
  };

  const candidates = await prisma.candidate.findMany({
    where,
    select: { createdAt: true, status: true },
  });

  // Group by day
  const byDay: Record<string, { applications: number; completed: number }> = {};
  candidates.forEach((c) => {
    const day = c.createdAt.toISOString().split('T')[0];
    if (!byDay[day]) byDay[day] = { applications: 0, completed: 0 };
    byDay[day].applications++;
    if (c.status !== 'incomplete') byDay[day].completed++;
  });

  // Fill missing days
  const result = [];
  for (let i = daysNum; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toISOString().split('T')[0];
    result.push({
      date: day,
      applications: byDay[day]?.applications || 0,
      completed: byDay[day]?.completed || 0,
    });
  }

  return res.json(result);
});

// GET /api/analytics/funnel?botId=
router.get('/funnel', async (req: AuthRequest, res: Response) => {
  const { botId } = req.query;
  const where: any = botId ? { botId: botId as string } : {};

  const byStatus = await prisma.candidate.groupBy({
    by: ['status'],
    where,
    _count: { id: true },
  });

  const statusMap: Record<string, number> = {};
  byStatus.forEach((item) => {
    statusMap[item.status] = item._count.id;
  });

  const funnel = CANDIDATE_STATUSES.filter((s) => s !== 'archived').map((status) => ({
    status,
    count: statusMap[status] || 0,
  }));

  return res.json(funnel);
});

// GET /api/analytics/completion-rate?botId=
router.get('/completion-rate', async (req: AuthRequest, res: Response) => {
  const { botId } = req.query;
  const where: any = botId ? { botId: botId as string } : {};

  const [total, completed] = await Promise.all([
    prisma.candidate.count({ where }),
    prisma.candidate.count({ where: { ...where, status: { not: 'incomplete' } } }),
  ]);

  return res.json({
    total,
    completed,
    rate: total > 0 ? Math.round((completed / total) * 100) : 0,
  });
});

export default router;
