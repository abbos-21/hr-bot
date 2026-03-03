import { Router, Response } from "express";
import prisma from "../../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// Canonical message keys with English defaults
export const MESSAGE_KEYS: Record<string, { label: string; default: string }> =
  {
    welcome: {
      label: "Language selection prompt",
      default: "👋 Welcome! Please choose a language:",
    },
    survey_complete: {
      label: "Survey completed",
      default:
        "✅ Thank you! Your application has been submitted successfully.",
    },
    answer_saved: {
      label: "Answer saved (generic)",
      default: "✅ Answer saved.",
    },
    invalid_option: {
      label: "Invalid choice selected",
      default: "⚠️ Please select one of the provided options.",
    },
    upload_file: {
      label: "Prompt to send file",
      default: "📎 Please send a photo or file as your answer.",
    },
    please_send_file: {
      label: "File expected, not text",
      default: "📎 Please send a photo or file, not text.",
    },
    please_send_photo: {
      label: "Profile photo prompt",
      default: "📸 Please send a photo for your profile picture.",
    },
    message_received: {
      label: "New HR message notification",
      default: "✉️ New message from HR:",
    },
    invalid_date_format: {
      label: "Invalid birth date format",
      default:
        "⚠️ Please enter your birth date in the format DD.MM.YYYY (e.g. 15.03.1998)",
    },
    invalid_date_value: {
      label: "Birth date out of valid range",
      default: "⚠️ Please enter a valid birth date.",
    },
    phone_use_button: {
      label: "Prompt to use phone button",
      default: "📱 Please use the button below to share your phone number.",
    },
  };

// GET /api/bots/:id/bot-messages
router.get("/", async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
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
