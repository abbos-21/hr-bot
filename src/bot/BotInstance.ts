import {
  Bot,
  GrammyError,
  HttpError,
  InlineKeyboard,
  InputFile,
  Keyboard,
} from "grammy";
import prisma from "../db";
import { wsManager } from "../websocket";
import path from "path";
import fs from "fs";
import { config } from "../config";
import axios from "axios";

type MyBot = Bot;

export class BotInstance {
  public bot: MyBot;
  public botId: string;
  private running = false;

  constructor(token: string, botId: string) {
    this.bot = new Bot(token);
    this.botId = botId;
    this.setupHandlers();
  }

  // ─── Translation helper ───────────────────────────────────────────────────

  private async getTranslation(
    botId: string,
    lang: string,
    key: string,
    fallback: string,
  ): Promise<string> {
    // 1. Try admin-configured DB message (exact lang)
    const dbMsg = await prisma.botMessage.findUnique({
      where: { botId_lang_key: { botId, lang, key } },
    });
    if (dbMsg) return dbMsg.value;

    // 2. Try DB message in English
    if (lang !== "en") {
      const dbEn = await prisma.botMessage.findUnique({
        where: { botId_lang_key: { botId, lang: "en", key } },
      });
      if (dbEn) return dbEn.value;
    }

    // 3. Hardcoded defaults
    const translations: Record<string, Record<string, string>> = {
      en: {
        welcome: "👋 Welcome! Please choose a language:",
        survey_complete:
          "✅ Thank you! Your application has been submitted successfully.",
        answer_saved: "✅ Answer saved.",
        invalid_option: "⚠️ Please select one of the provided options.",
        upload_file: "📎 Please send a photo or file as your answer.",
        please_send_file: "📎 Please send a photo or file, not text.",
        please_send_photo: "📸 Please send a photo for your profile picture.",
        message_received: "✉️ New message from HR:",
        invalid_date_format:
          "⚠️ Please enter your birth date in the format DD.MM.YYYY (e.g. 15.03.1998)",
        invalid_date_value: "⚠️ Please enter a valid birth date.",
        phone_use_button:
          "📱 Please use the button below to share your phone number.",
      },
      ru: {
        welcome: "👋 Добро пожаловать! Выберите язык:",
        survey_complete: "✅ Спасибо! Ваша заявка успешно отправлена.",
        answer_saved: "✅ Ответ сохранён.",
        invalid_option:
          "⚠️ Пожалуйста, выберите один из предложенных вариантов.",
        upload_file: "📎 Пожалуйста, отправьте фото или файл.",
        please_send_file: "📎 Пожалуйста, отправьте файл, а не текст.",
        please_send_photo: "📸 Пожалуйста, отправьте фото для профиля.",
        message_received: "✉️ Новое сообщение от HR:",
        invalid_date_format:
          "⚠️ Введите дату рождения в формате ДД.ММ.ГГГГ (например 15.03.1998)",
        invalid_date_value: "⚠️ Введите корректную дату рождения.",
        phone_use_button:
          "📱 Пожалуйста, используйте кнопку ниже, чтобы поделиться номером.",
      },
      uz: {
        welcome: "👋 Xush kelibsiz! Tilni tanlang:",
        survey_complete: "✅ Rahmat! Arizangiz muvaffaqiyatli yuborildi.",
        answer_saved: "✅ Javob saqlandi.",
        invalid_option:
          "⚠️ Iltimos, taklif etilgan variantlardan birini tanlang.",
        upload_file: "📎 Iltimos, rasm yoki fayl yuboring.",
        please_send_file: "📎 Iltimos, matn emas, fayl yuboring.",
        please_send_photo: "📸 Iltimos, profil uchun rasm yuboring.",
        message_received: "✉️ HR dan yangi xabar:",
        invalid_date_format:
          "⚠️ Tug'ilgan sanangizni KK.OO.YYYY formatida kiriting (masalan 15.03.1998)",
        invalid_date_value: "⚠️ Iltimos, to'g'ri tug'ilgan sanani kiriting.",
        phone_use_button:
          "📱 Raqamingizni ulashish uchun quyidagi tugmani bosing.",
      },
    };
    return translations[lang]?.[key] || translations["en"]?.[key] || fallback;
  }

  // Get per-lang success/error message from question translation
  private getQuestionMessage(
    question: any,
    lang: string,
    type: "success" | "error",
  ): string | undefined {
    const field = type === "success" ? "successMessage" : "errorMessage";
    const tr =
      question.translations?.find((t: any) => t.lang === lang) ||
      question.translations?.find((t: any) => t.lang === "en") ||
      question.translations?.[0];
    return tr?.[field] || undefined;
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  private setupHandlers(): void {
    const { bot, botId } = this;

    // /start command
    bot.command("start", async (ctx) => {
      try {
        const telegramId = ctx.from?.id.toString() || "";
        const botData = await prisma.bot.findUnique({
          where: { id: botId },
          include: { languages: true },
        });
        if (!botData || !botData.isActive) return;

        const languages = botData.languages;

        if (languages.length <= 1) {
          const lang = languages[0]?.code || botData.defaultLang;
          await this.startSurvey(ctx, botId, lang, telegramId);
          return;
        }

        const keyboard = new InlineKeyboard();
        languages.forEach((lang) => {
          keyboard.text(lang.name, `lang:${lang.code}`).row();
        });
        await ctx.reply(
          await this.getTranslation(
            botId,
            botData.defaultLang,
            "welcome",
            "👋 Welcome!",
          ),
          { reply_markup: keyboard },
        );
      } catch (error) {
        console.error("Error in /start handler:", error);
      }
    });

    // Callback queries
    bot.on("callback_query:data", async (ctx) => {
      try {
        const data = ctx.callbackQuery.data;
        const telegramId = ctx.from.id.toString();

        if (data.startsWith("lang:")) {
          const lang = data.replace("lang:", "");
          await ctx.answerCallbackQuery();
          await this.startSurvey(ctx, botId, lang, telegramId);
          return;
        }

        if (data.startsWith("ans:")) {
          const optionId = data.slice(4);
          await ctx.answerCallbackQuery();
          const option = await prisma.questionOption.findUnique({
            where: { id: optionId },
            include: { question: true },
          });
          if (!option) return;
          const candidate = await prisma.candidate.findFirst({
            where: { botId, telegramId, status: "incomplete" },
            orderBy: { updatedAt: "desc" },
          });
          if (!candidate) return;
          await this.handleChoiceAnswer(
            ctx,
            candidate.id,
            option.question.id,
            optionId,
          );
          return;
        }

        await ctx.answerCallbackQuery();
      } catch (error) {
        console.error("Error in callback_query handler:", error);
        await ctx.answerCallbackQuery("An error occurred").catch(() => {});
      }
    });

    // Text messages
    bot.on("message:text", async (ctx) => {
      try {
        const telegramId = ctx.from?.id.toString() || "";
        const candidate = await prisma.candidate.findFirst({
          where: {
            botId,
            telegramId,
            status: { in: ["incomplete", "active"] },
          },
          orderBy: { updatedAt: "desc" },
        });
        if (!candidate) return;
        if (candidate.status !== "incomplete") {
          await this.handleInboundMessage(ctx, candidate.id, candidate.botId);
          return;
        }
        await this.handleTextAnswer(ctx, candidate);
      } catch (error) {
        console.error("Error in message handler:", error);
      }
    });

    // Contact message (phone number sharing)
    bot.on("message:contact", async (ctx) => {
      try {
        const telegramId = ctx.from?.id.toString() || "";
        const candidate = await prisma.candidate.findFirst({
          where: { botId, telegramId, status: "incomplete" },
        });
        if (!candidate) return;

        const questions = await prisma.question.findMany({
          where: { botId, isActive: true },
          include: { translations: true },
          orderBy: [{ isRequired: "desc" }, { order: "asc" }],
        });
        const question = questions[candidate.currentStep];
        if (!question || question.fieldKey !== "phone") return;

        const phone = ctx.message.contact.phone_number;

        await prisma.answer.upsert({
          where: {
            candidateId_questionId: {
              candidateId: candidate.id,
              questionId: question.id,
            },
          },
          update: { textValue: phone, optionId: null, updatedAt: new Date() },
          create: {
            candidateId: candidate.id,
            questionId: question.id,
            textValue: phone,
          },
        });
        await this.updateCandidateField(candidate.id, "phone", phone);
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            currentStep: candidate.currentStep + 1,
            lastActivity: new Date(),
          },
        });

        const ack =
          this.getQuestionMessage(question, candidate.lang, "success") ||
          (await this.getTranslation(
            botId,
            candidate.lang,
            "answer_saved",
            "✅ Answer saved.",
          ));
        // Send ack and remove the contact keyboard in one message
        await ctx.reply(ack, { reply_markup: { remove_keyboard: true } });
        await this.sendNextQuestion(ctx, candidate.id, candidate.lang, botId);
      } catch (err) {
        console.error("contact handler error", err);
      }
    });

    // Media messages
    bot.on(":photo", async (ctx) => {
      await this.handleMediaMessage(ctx, "photo");
    });
    bot.on(":document", async (ctx) => {
      await this.handleMediaMessage(ctx, "document");
    });
    bot.on(":voice", async (ctx) => {
      await this.handleMediaMessage(ctx, "voice");
    });
    bot.on(":video", async (ctx) => {
      await this.handleMediaMessage(ctx, "video");
    });
    bot.on(":audio", async (ctx) => {
      await this.handleMediaMessage(ctx, "audio");
    });

    bot.catch((err) => {
      const { error } = err;
      if (error instanceof GrammyError)
        console.error("grammY error:", error.description);
      else if (error instanceof HttpError)
        console.error("HTTP error:", error.message);
      else console.error("Unknown error:", error);
    });
  }

  // ─── Survey start ──────────────────────────────────────────────────────────

  private async startSurvey(
    ctx: any,
    botId: string,
    lang: string,
    telegramId: string,
  ): Promise<void> {
    // One candidate per (bot, telegram user) — no job concept
    let candidate = await prisma.candidate.findUnique({
      where: { botId_telegramId: { botId, telegramId } },
    });

    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          botId,
          telegramId,
          username: ctx.from?.username,
          lang,
          status: "incomplete",
          currentStep: 0,
        },
      });
      wsManager.broadcast({
        type: "NEW_APPLICATION",
        payload: { candidateId: candidate.id, botId },
      });
    } else if (candidate.status !== "incomplete") {
      await ctx.reply("You have already submitted your application.");
      return;
    } else {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { lang, lastActivity: new Date() },
      });
    }

    await this.sendNextQuestion(ctx, candidate.id, lang, botId);
  }

  // ─── Send next question ────────────────────────────────────────────────────

  private async sendNextQuestion(
    ctx: any,
    candidateId: string,
    lang: string,
    botId: string,
  ): Promise<void> {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) return;

    const questions = await prisma.question.findMany({
      where: { botId, isActive: true },
      include: {
        translations: true,
        options: { include: { translations: true }, orderBy: { order: "asc" } },
      },
      orderBy: [{ isRequired: "desc" }, { order: "asc" }], // required questions first
    });

    const currentStep = candidate.currentStep;

    if (currentStep >= questions.length) {
      // Survey complete
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { status: "active", lastActivity: new Date() },
      });
      const msg = await this.getTranslation(
        botId,
        lang,
        "survey_complete",
        "✅ Thank you! Your application has been submitted.",
      );
      await ctx.reply(msg);
      wsManager.broadcast({
        type: "NEW_APPLICATION",
        payload: { candidateId, status: "active", botId },
      });
      return;
    }

    const question = questions[currentStep];
    const botData = await prisma.bot.findUnique({ where: { id: botId } });
    const defaultLang = botData?.defaultLang || "en";

    const translation =
      question.translations.find((t) => t.lang === lang) ||
      question.translations.find((t) => t.lang === defaultLang) ||
      question.translations[0];

    if (!translation) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { currentStep: currentStep + 1 },
      });
      await this.sendNextQuestion(ctx, candidateId, lang, botId);
      return;
    }

    const questionText = `(${currentStep + 1}/${questions.length}) ${translation.text}`;

    if (question.type === "choice" && question.options.length > 0) {
      const keyboard = new InlineKeyboard();
      for (const option of question.options) {
        const optTr =
          option.translations.find((t) => t.lang === lang) ||
          option.translations.find((t) => t.lang === defaultLang) ||
          option.translations[0];
        if (optTr) keyboard.text(optTr.text, `ans:${option.id}`).row();
      }
      await ctx.reply(questionText, { reply_markup: keyboard });
    } else if (question.type === "attachment") {
      const hint =
        question.fieldKey === "profilePhoto"
          ? await this.getTranslation(
              botId,
              lang,
              "please_send_photo",
              "📸 Please send your profile photo.",
            )
          : await this.getTranslation(
              botId,
              lang,
              "upload_file",
              "📎 Please send a file or photo.",
            );
      await ctx.reply(`${questionText}\n\n${hint}`);
    } else if (question.fieldKey === "phone") {
      // Phone: send request_contact keyboard
      const buttonLabel =
        translation.phoneButtonText ||
        (candidate.lang === "ru"
          ? "📱 Поделиться номером"
          : candidate.lang === "uz"
            ? "📱 Raqamni ulashish"
            : "📱 Share phone number");
      const kb = new Keyboard().requestContact(buttonLabel).resized();
      await ctx.reply(questionText, { reply_markup: kb });
    } else {
      await ctx.reply(questionText);
    }
  }

  // ─── Handle text answer ───────────────────────────────────────────────────

  private async handleTextAnswer(ctx: any, candidate: any): Promise<void> {
    const text = ctx.message?.text;
    if (!text) return;

    const questions = await prisma.question.findMany({
      where: { botId: candidate.botId, isActive: true },
      orderBy: [{ isRequired: "desc" }, { order: "asc" }],
    });

    const question = questions[candidate.currentStep];
    if (!question) return;

    if (question.type === "choice") {
      await ctx.reply(
        await this.getTranslation(
          candidate.botId,
          candidate.lang,
          "invalid_option",
          "Please select one of the options.",
        ),
      );
      return;
    }

    if (question.type === "attachment") {
      const msg =
        this.getQuestionMessage(question, candidate.lang, "error") ||
        (await this.getTranslation(
          candidate.botId,
          candidate.lang,
          "please_send_file",
          "📎 Please send a file or photo, not text.",
        ));
      await ctx.reply(msg);
      return;
    }

    if (question.fieldKey === "phone") {
      await ctx.reply(
        await this.getTranslation(
          candidate.botId,
          candidate.lang,
          "phone_use_button",
          "📱 Please use the button below to share your phone number.",
        ),
      );
      return;
    }

    // Age field: expect dd.mm.yyyy, validate and calculate age
    let storedText = text;
    if (question.fieldKey === "age") {
      const match = text.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (!match) {
        const errMsg =
          this.getQuestionMessage(question, candidate.lang, "error") ||
          (await this.getTranslation(
            candidate.botId,
            candidate.lang,
            "invalid_date_format",
            "⚠️ Please enter your birth date in the format DD.MM.YYYY (e.g. 15.03.1998)",
          ));
        await ctx.reply(errMsg);
        return;
      }
      const [, dd, mm, yyyy] = match;
      const birth = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      const now = new Date();
      let years = now.getFullYear() - birth.getFullYear();
      const mDiff = now.getMonth() - birth.getMonth();
      if (mDiff < 0 || (mDiff === 0 && now.getDate() < birth.getDate()))
        years--;
      if (years < 14 || years > 80) {
        await ctx.reply(
          await this.getTranslation(
            candidate.botId,
            candidate.lang,
            "invalid_date_value",
            "⚠️ Please enter a valid birth date.",
          ),
        );
        return;
      }
      storedText = `${text.trim()} (${years} years old)`;
    }

    await prisma.answer.upsert({
      where: {
        candidateId_questionId: {
          candidateId: candidate.id,
          questionId: question.id,
        },
      },
      update: { textValue: storedText, optionId: null, updatedAt: new Date() },
      create: {
        candidateId: candidate.id,
        questionId: question.id,
        textValue: storedText,
      },
    });

    if (question.fieldKey) {
      await this.updateCandidateField(
        candidate.id,
        question.fieldKey,
        storedText,
      );
    }

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        currentStep: candidate.currentStep + 1,
        lastActivity: new Date(),
      },
    });

    const ack =
      this.getQuestionMessage(question, candidate.lang, "success") ||
      (await this.getTranslation(
        candidate.botId,
        candidate.lang,
        "answer_saved",
        "✅ Answer saved.",
      ));
    await ctx.reply(ack);

    await this.sendNextQuestion(
      ctx,
      candidate.id,
      candidate.lang,
      candidate.botId,
    );
  }

  // ─── Handle choice answer ─────────────────────────────────────────────────

  private async handleChoiceAnswer(
    ctx: any,
    candidateId: string,
    questionId: string,
    optionId: string,
  ): Promise<void> {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate || candidate.status !== "incomplete") return;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { options: { include: { translations: true } } },
    });
    if (!question) return;

    const option = question.options.find((o) => o.id === optionId);
    if (!option) {
      await ctx.reply("Invalid option.");
      return;
    }

    await prisma.answer.upsert({
      where: { candidateId_questionId: { candidateId, questionId } },
      update: { optionId, textValue: null, updatedAt: new Date() },
      create: { candidateId, questionId, optionId },
    });

    if (question.fieldKey) {
      const optTr =
        option.translations.find((t) => t.lang === candidate.lang) ||
        option.translations[0];
      await this.updateCandidateField(
        candidateId,
        question.fieldKey,
        optTr?.text || "",
      );
    }

    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        currentStep: candidate.currentStep + 1,
        lastActivity: new Date(),
      },
    });

    const ack =
      this.getQuestionMessage(question, candidate.lang, "success") ||
      (await this.getTranslation(
        candidate.botId,
        candidate.lang,
        "answer_saved",
        "✅ Answer saved.",
      ));
    await ctx.reply(ack);

    await this.sendNextQuestion(
      ctx,
      candidateId,
      candidate.lang,
      candidate.botId,
    );
  }

  // ─── Handle media message ─────────────────────────────────────────────────

  private async handleMediaMessage(ctx: any, mediaType: string): Promise<void> {
    const telegramId = ctx.from?.id.toString() || "";
    const candidate = await prisma.candidate.findFirst({
      where: {
        botId: this.botId,
        telegramId,
        status: { in: ["incomplete", "active"] },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!candidate) return;

    if (candidate.status === "incomplete") {
      await this.handleAttachmentAnswer(ctx, candidate);
      return;
    }

    await this.handleInboundMessage(ctx, candidate.id, this.botId);
  }

  // ─── Handle attachment answer ─────────────────────────────────────────────

  private async handleAttachmentAnswer(
    ctx: any,
    candidate: any,
  ): Promise<void> {
    const questions = await prisma.question.findMany({
      where: { botId: candidate.botId, isActive: true },
      orderBy: [{ isRequired: "desc" }, { order: "asc" }],
    });

    const question = questions[candidate.currentStep];
    if (!question || question.type !== "attachment") {
      const msg =
        this.getQuestionMessage(question, candidate.lang, "error") ||
        (await this.getTranslation(
          candidate.botId,
          candidate.lang,
          "please_send_file",
          "📎 Please answer the current question.",
        ));
      await ctx.reply(msg);
      return;
    }

    const msg = ctx.message;
    let fileId: string | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    let localPath: string | undefined;
    let isPhoto = false;

    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      fileId = photo.file_id;
      fileName = "photo.jpg";
      mimeType = "image/jpeg";
      localPath = await this.downloadFile(fileId, candidate.botId, "photo.jpg");
      isPhoto = true;
    } else if (msg.document) {
      fileId = msg.document.file_id;
      fileName = msg.document.file_name || "document";
      mimeType = msg.document.mime_type;
      localPath = await this.downloadFile(
        fileId,
        candidate.botId,
        fileName || "document",
      );
    } else if (msg.voice) {
      fileId = msg.voice.file_id;
      fileName = "voice.ogg";
      mimeType = "audio/ogg";
      localPath = await this.downloadFile(fileId, candidate.botId, "voice.ogg");
    } else if (msg.video) {
      fileId = msg.video.file_id;
      fileName = "video.mp4";
      mimeType = "video/mp4";
      localPath = await this.downloadFile(fileId, candidate.botId, "video.mp4");
    }

    if (!fileId) {
      const errMsg =
        this.getQuestionMessage(question, candidate.lang, "error") ||
        (await this.getTranslation(
          candidate.botId,
          candidate.lang,
          "upload_file",
          "📎 Please send a file or photo.",
        ));
      await ctx.reply(errMsg);
      return;
    }

    const displayValue = fileName || "attachment";
    await prisma.answer.upsert({
      where: {
        candidateId_questionId: {
          candidateId: candidate.id,
          questionId: question.id,
        },
      },
      update: {
        textValue: displayValue,
        optionId: null,
        updatedAt: new Date(),
      },
      create: {
        candidateId: candidate.id,
        questionId: question.id,
        textValue: displayValue,
      },
    });

    await prisma.candidateFile.create({
      data: {
        candidateId: candidate.id,
        telegramFileId: fileId,
        fileName: fileName || "attachment",
        mimeType,
        localPath,
      },
    });

    // If this is the profile photo question, save the localPath to candidate
    if (question.fieldKey === "profilePhoto" && localPath) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { profilePhoto: localPath },
      });
    }

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        currentStep: candidate.currentStep + 1,
        lastActivity: new Date(),
      },
    });

    const ackMsg =
      this.getQuestionMessage(question, candidate.lang, "success") ||
      (await this.getTranslation(
        candidate.botId,
        candidate.lang,
        "answer_saved",
        "✅ File received!",
      ));
    await ctx.reply(ackMsg);

    await this.sendNextQuestion(
      ctx,
      candidate.id,
      candidate.lang,
      candidate.botId,
    );
  }

  // ─── Update candidate field from fieldKey ─────────────────────────────────

  private async updateCandidateField(
    candidateId: string,
    fieldKey: string,
    value: string,
  ): Promise<void> {
    const allowedFields = ["fullName", "age", "phone", "email"];
    if (allowedFields.includes(fieldKey)) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { [fieldKey]: value },
      });
    }
  }

  // ─── Inbound message from active candidate ────────────────────────────────

  private async handleInboundMessage(
    ctx: any,
    candidateId: string,
    botId: string,
  ): Promise<void> {
    const msg = ctx.message;
    if (!msg) return;

    let type = "text";
    let text: string | undefined = msg.text;
    let fileId: string | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    let localPath: string | undefined;

    if (msg.photo) {
      type = "photo";
      const photo = msg.photo[msg.photo.length - 1];
      fileId = photo.file_id;
      localPath = await this.downloadFile(fileId, botId, "photo.jpg");
    } else if (msg.document) {
      type = "document";
      fileId = msg.document.file_id;
      fileName = msg.document.file_name || "document";
      mimeType = msg.document.mime_type;
      localPath = await this.downloadFile(fileId, botId, fileName);
    } else if (msg.voice) {
      type = "voice";
      fileId = msg.voice.file_id;
      localPath = await this.downloadFile(fileId, botId, "voice.ogg");
    } else if (msg.video) {
      type = "video";
      fileId = msg.video.file_id;
      localPath = await this.downloadFile(fileId, botId, "video.mp4");
    } else if (msg.audio) {
      type = "audio";
      fileId = msg.audio.file_id;
      localPath = await this.downloadFile(
        fileId,
        botId,
        msg.audio.file_name || "audio.mp3",
      );
    }

    const message = await prisma.message.create({
      data: {
        candidateId,
        direction: "inbound",
        type,
        text,
        fileId,
        fileName,
        mimeType,
        localPath,
        telegramMsgId: msg.message_id,
        isRead: false,
      },
    });

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { lastActivity: new Date() },
    });

    if (type === "document" && fileId) {
      await prisma.candidateFile.create({
        data: {
          candidateId,
          telegramFileId: fileId,
          fileName: fileName || "document",
          mimeType,
          localPath,
        },
      });
    }

    const unreadCount = await prisma.message.count({
      where: { candidateId, direction: "inbound", isRead: false },
    });

    wsManager.broadcast({
      type: "NEW_MESSAGE",
      payload: { candidateId, message, direction: "inbound", unreadCount },
    });
  }

  // ─── Download file from Telegram ──────────────────────────────────────────

  private async downloadFile(
    fileId: string,
    botId: string,
    fileName: string,
  ): Promise<string | undefined> {
    try {
      const file = await this.bot.api.getFile(fileId);
      const filePath = file.file_path;
      if (!filePath) return undefined;

      const botToken = this.bot.token;
      const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

      const dir = path.join(config.uploadDir, botId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const ext = path.extname(fileName) || path.extname(filePath) || "";
      const localFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
      const localPath = path.join(dir, localFileName);

      const response = await axios.get(url, { responseType: "stream" });
      const writer = fs.createWriteStream(localPath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      return localPath;
    } catch (error) {
      console.error("Error downloading file:", error);
      return undefined;
    }
  }

  // ─── Send message from admin to candidate ─────────────────────────────────

  async sendMessageToCandidate(
    telegramId: string,
    message: {
      type: string;
      text?: string;
      localPath?: string;
      fileId?: string;
      caption?: string;
      fileName?: string;
    },
  ): Promise<number | undefined> {
    try {
      let sentMsg: any;
      const chatId = parseInt(telegramId);

      if (message.type === "text" && message.text) {
        sentMsg = await this.bot.api.sendMessage(chatId, message.text);
      } else if (message.type === "photo") {
        if (message.fileId) {
          sentMsg = await this.bot.api.sendPhoto(chatId, message.fileId, {
            caption: message.caption,
          });
        } else if (message.localPath && fs.existsSync(message.localPath)) {
          sentMsg = await this.bot.api.sendPhoto(
            chatId,
            new InputFile(message.localPath),
            { caption: message.caption },
          );
        }
      } else if (message.type === "document") {
        if (message.fileId) {
          sentMsg = await this.bot.api.sendDocument(chatId, message.fileId, {
            caption: message.caption,
          });
        } else if (message.localPath && fs.existsSync(message.localPath)) {
          sentMsg = await this.bot.api.sendDocument(
            chatId,
            new InputFile(
              message.localPath,
              message.fileName || path.basename(message.localPath),
            ),
            { caption: message.caption },
          );
        }
      } else if (message.type === "voice") {
        if (message.fileId)
          sentMsg = await this.bot.api.sendVoice(chatId, message.fileId);
        else if (message.localPath && fs.existsSync(message.localPath))
          sentMsg = await this.bot.api.sendVoice(
            chatId,
            new InputFile(message.localPath),
          );
      } else if (message.type === "audio") {
        if (message.fileId)
          sentMsg = await this.bot.api.sendAudio(chatId, message.fileId);
        else if (message.localPath && fs.existsSync(message.localPath))
          sentMsg = await this.bot.api.sendAudio(
            chatId,
            new InputFile(message.localPath),
          );
      }

      return sentMsg?.message_id;
    } catch (error) {
      console.error("Error sending message to candidate:", error);
      return undefined;
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.bot.start({
      onStart: (info) => {
        console.log(`Bot @${info.username} started (id: ${this.botId})`);
      },
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    await this.bot.stop();
    console.log(`Bot stopped (id: ${this.botId})`);
  }

  isRunning(): boolean {
    return this.running;
  }
}
