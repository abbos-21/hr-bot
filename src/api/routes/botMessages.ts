import { Router, Response } from "express";
import prisma from "../../db";
import { authMiddleware, AuthRequest, requireBotAccess } from "../middleware/auth";
import { MESSAGE_KEYS } from "../../constants/botDefaults";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

export { MESSAGE_KEYS };

// GET /api/bots/:id/bot-messages
router.get("/", async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await requireBotAccess(req, res, id))) return;
  const rows = await prisma.botMessage.findMany({ where: { botId: id } });
  // Return as nested: { [lang]: { [key]: value } }
  const result: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    if (!result[row.lang]) result[row.lang] = {};
    result[row.lang][row.key] = row.value;
  }
  return res.json(result);
});

// PUT /api/bots/:id/bot-messages
// Body: { lang: string, key: string, value: string }[]
router.put("/", async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!(await requireBotAccess(req, res, id))) return;
  const items: { lang: string; key: string; value: string }[] = req.body;
  if (!Array.isArray(items))
    return res.status(400).json({ error: "Expected array" });

  await prisma.$transaction(
    items.map(({ lang, key, value }) =>
      prisma.botMessage.upsert({
        where: { botId_lang_key: { botId: id, lang, key } },
        update: { value },
        create: { botId: id, lang, key, value },
      }),
    ),
  );
  return res.json({ ok: true });
});

export default router;
