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
import { DEFAULT_TRANSLATIONS } from "../constants/botDefaults";
import axios from "axios";

export class BotInstance {
  public bot: Bot;
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

    // 3. Hardcoded defaults (shared via constants/botDefaults.ts)
    return DEFAULT_TRANSLATIONS[lang]?.[key] || DEFAULT_TRANSLATIONS["en"]?.[key] || fallback;
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

        const queue = await this.getQueue(candidate as any);
        if (!queue.length) return;

        const question = await prisma.question.findUnique({
          where: { id: queue[0] },
          include: { translations: true },
        });
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
        await this.advanceQueue(candidate.id, queue, null);

        const ack = this.getQuestionMessage(
          question,
          candidate.lang,
          "success",
        );
        if (ack) await ctx.reply(ack);
        await ctx.reply("✅", { reply_markup: { remove_keyboard: true } });
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

  // ─── Queue helpers ────────────────────────────────────────────────────────

  /** Build initial queue from all top-level (non-branch) questions for a bot */
  private async buildInitialQueue(botId: string): Promise<string[]> {
    const questions = await prisma.question.findMany({
      where: { botId, isActive: true, parentOptionId: null },
      orderBy: [{ isRequired: "desc" }, { order: "asc" }],
      select: { id: true },
    });
    return questions.map((q: any) => q.id);
  }

  /** Get the candidate's question queue, reconstructing from currentStep if needed (backwards compat) */
  private async getQueue(candidate: {
    id: string;
    questionQueue: string | null;
    currentStep: number;
    botId: string;
  }): Promise<string[]> {
    if (candidate.questionQueue !== null) {
      try {
        return JSON.parse(candidate.questionQueue);
      } catch {
        return [];
      }
    }
    // Backwards compat: reconstruct from currentStep
    const questions = await prisma.question.findMany({
      where: { botId: candidate.botId, isActive: true, parentOptionId: null },
      orderBy: [{ isRequired: "desc" }, { order: "asc" }],
      select: { id: true },
    });
    const queue = questions.slice(candidate.currentStep).map((q: any) => q.id);
    await this.setQueue(candidate.id, queue);
    return queue;
  }

  /** Persist queue to DB */
  private async setQueue(candidateId: string, queue: string[]): Promise<void> {
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { questionQueue: JSON.stringify(queue), lastActivity: new Date() },
    });
  }

  /**
   * Advance queue: remove current question (queue[0]).
   * If selectedOptionId is provided, prepend that option's branch questions to remaining queue.
   */
  private async advanceQueue(
    candidateId: string,
    currentQueue: string[],
    selectedOptionId: string | null,
  ): Promise<void> {
    let remaining = currentQueue.slice(1);
    if (selectedOptionId) {
      const branchQs = await prisma.question.findMany({
        where: { parentOptionId: selectedOptionId, isActive: true },
        orderBy: { branchOrder: "asc" },
        select: { id: true },
      });
      remaining = [...branchQs.map((q: any) => q.id), ...remaining];
    }
    await this.setQueue(candidateId, remaining);
  }

  // ─── Survey start ──────────────────────────────────────────────────────────

  private async startSurvey(
    ctx: any,
    botId: string,
    lang: string,
    telegramId: string,
  ): Promise<void> {
    // Find the most recent incomplete application for this user, if any
    let candidate = await prisma.candidate.findFirst({
      where: { botId, telegramId, status: "incomplete" },
      orderBy: { updatedAt: "desc" },
    });

    if (!candidate) {
      // No incomplete application — start a fresh one (allows multiple submissions)
      const queue = await this.buildInitialQueue(botId);
      candidate = await prisma.candidate.create({
        data: {
          botId,
          telegramId,
          username: ctx.from?.username,
          lang,
          status: "incomplete",
          currentStep: 0,
          questionQueue: JSON.stringify(queue),
        },
      });
      wsManager.broadcast({
        type: "NEW_APPLICATION",
        payload: { candidateId: candidate.id, botId },
      });
    } else {
      // Re-init queue if missing (in case bot was restarted mid-survey)
      const updateData: any = { lang, lastActivity: new Date() };
      if (candidate.questionQueue === null) {
        updateData.questionQueue = JSON.stringify(
          await this.buildInitialQueue(botId),
        );
      }
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: updateData,
      });
      candidate = { ...candidate, ...updateData };
    }

    await this.sendNextQuestion(ctx, candidate!.id, lang, botId);
  }

  // Escape all MarkdownV2 reserved characters
  private escapeMd(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
  }

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

    const queue = await this.getQueue(candidate as any);

    if (queue.length === 0) {
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

    const question = await prisma.question.findUnique({
      where: { id: queue[0] },
      include: {
        translations: true,
        options: { include: { translations: true }, orderBy: { order: "asc" } },
      },
    });

    if (!question || !question.isActive) {
      // Skip missing/inactive question
      await this.advanceQueue(candidateId, queue, null);
      await this.sendNextQuestion(ctx, candidateId, lang, botId);
      return;
    }

    const botData = await prisma.bot.findUnique({ where: { id: botId } });
    const defaultLang = botData?.defaultLang || "uz";

    const translation =
      question.translations.find((t) => t.lang === lang) ||
      question.translations.find((t) => t.lang === defaultLang) ||
      question.translations[0];

    if (!translation) {
      await this.advanceQueue(candidateId, queue, null);
      await this.sendNextQuestion(ctx, candidateId, lang, botId);
      return;
    }

    const questionText = `*${this.escapeMd(translation.text)}*`;

    if (question.type === "choice" && question.options.length > 0) {
      // Filter out inactive options
      const activeOptions = question.options.filter((o: any) => o.isActive !== false);

      // For branch question: skip if <2 active options, auto-assign if exactly 1
      if (question.fieldKey === "branch") {
        if (activeOptions.length === 0) {
          await this.advanceQueue(candidateId, queue, null);
          await this.sendNextQuestion(ctx, candidateId, lang, botId);
          return;
        }
        if (activeOptions.length === 1) {
          // Auto-assign the single branch
          const singleOpt = activeOptions[0];
          await prisma.answer.upsert({
            where: { candidateId_questionId: { candidateId, questionId: question.id } },
            update: { optionId: singleOpt.id, textValue: null, updatedAt: new Date() },
            create: { candidateId, questionId: question.id, optionId: singleOpt.id },
          });
          if (singleOpt.branchId) {
            await prisma.candidate.update({
              where: { id: candidateId },
              data: { branchId: singleOpt.branchId },
            });
          }
          await this.advanceQueue(candidateId, queue, singleOpt.id);
          await this.sendNextQuestion(ctx, candidateId, lang, botId);
          return;
        }
      }

      const keyboard = new InlineKeyboard();
      for (const option of activeOptions) {
        const optTr =
          option.translations.find((t: any) => t.lang === lang) ||
          option.translations.find((t: any) => t.lang === defaultLang) ||
          option.translations[0];
        if (optTr) keyboard.text(optTr.text, `ans:${option.id}`).row();
      }
      await ctx.reply(questionText, {
        reply_markup: keyboard,
        parse_mode: "MarkdownV2",
      });
    } else if (question.type === "attachment") {
      if (question.fieldKey === "profilePhoto") {
        await ctx.reply(questionText, { parse_mode: "MarkdownV2" });
      } else {
        const hint = await this.getTranslation(
          botId,
          lang,
          "upload_file",
          "📎 Please send a file or photo.",
        );
        await ctx.reply(`${questionText}\n\n${this.escapeMd(hint)}`, {
          parse_mode: "MarkdownV2",
        });
      }
    } else if (question.fieldKey === "phone") {
      const buttonLabel =
        translation.phoneButtonText ||
        (lang === "ru"
          ? "📱 Поделиться номером"
          : lang === "uz"
            ? "📱 Raqamni ulashish"
            : "📱 Share phone number");
      const kb = new Keyboard().requestContact(buttonLabel).resized();
      await ctx.reply(questionText, {
        reply_markup: kb,
        parse_mode: "MarkdownV2",
      });
    } else {
      await ctx.reply(questionText, { parse_mode: "MarkdownV2" });
    }
  }

  // ─── Handle text answer ───────────────────────────────────────────────────

  private async handleTextAnswer(ctx: any, candidate: any): Promise<void> {
    const text = ctx.message?.text;
    if (!text) return;

    const queue = await this.getQueue(candidate);
    if (!queue.length) return;

    const question = await prisma.question.findUnique({
      where: { id: queue[0] },
      include: { translations: true },
    });
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

    await this.advanceQueue(candidate.id, queue, null);

    const ack = this.getQuestionMessage(question, candidate.lang, "success");
    if (ack) await ctx.reply(ack);

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

    // Validate the answered question matches the current queue head
    const queue = await this.getQueue(candidate as any);
    if (!queue.length || queue[0] !== questionId) {
      await ctx
        .answerCallbackQuery("This question has already been answered.")
        .catch(() => {});
      return;
    }

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

    // Auto-assign branch when branch question is answered
    if (question.fieldKey === "branch" && option.branchId) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { branchId: option.branchId },
      });
    }

    // Advance queue, injecting branch questions for the chosen option
    await this.advanceQueue(candidateId, queue, optionId);

    const ack = this.getQuestionMessage(question, candidate.lang, "success");
    if (ack) await ctx.reply(ack);

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
    const queue = await this.getQueue(candidate);
    if (!queue.length) return;

    const question = await prisma.question.findUnique({
      where: { id: queue[0] },
    });
    if (!question || question.type !== "attachment") {
      const msg = await this.getTranslation(
        candidate.botId,
        candidate.lang,
        "please_send_file",
        "📎 Please answer the current question.",
      );
      await ctx.reply(msg);
      return;
    }

    const msg = ctx.message;
    const media = await this.extractMediaInfo(msg, candidate.botId);

    if (!media.fileId) {
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

    const displayValue = media.fileName || "attachment";
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
        telegramFileId: media.fileId!,
        fileName: media.fileName || "attachment",
        mimeType: media.mimeType,
        localPath: media.localPath,
      },
    });

    if (question.fieldKey === "profilePhoto" && media.localPath) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { profilePhoto: media.localPath },
      });
    }

    await this.advanceQueue(candidate.id, queue, null);

    const ackMsg = this.getQuestionMessage(question, candidate.lang, "success");
    if (ackMsg) await ctx.reply(ackMsg);

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
    const allowedFields = ["fullName", "age", "phone", "email", "position"];
    if (allowedFields.includes(fieldKey)) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { [fieldKey]: value },
      });
    }
  }

  // ─── Extract media info from a Telegram message ─────────────────────────────

  private async extractMediaInfo(
    msg: any,
    botId: string,
  ): Promise<{
    type: string;
    text?: string;
    fileId?: string;
    fileName?: string;
    mimeType?: string;
    localPath?: string;
  }> {
    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      return {
        type: "photo",
        fileId: photo.file_id,
        localPath: await this.downloadFile(photo.file_id, botId, "photo.jpg"),
      };
    }
    if (msg.document) {
      const fileName = msg.document.file_name || "document";
      return {
        type: "document",
        fileId: msg.document.file_id,
        fileName,
        mimeType: msg.document.mime_type,
        localPath: await this.downloadFile(msg.document.file_id, botId, fileName),
      };
    }
    if (msg.voice) {
      return {
        type: "voice",
        fileId: msg.voice.file_id,
        localPath: await this.downloadFile(msg.voice.file_id, botId, "voice.ogg"),
      };
    }
    if (msg.video) {
      return {
        type: "video",
        fileId: msg.video.file_id,
        localPath: await this.downloadFile(msg.video.file_id, botId, "video.mp4"),
      };
    }
    if (msg.audio) {
      const fileName = msg.audio.file_name || "audio.mp3";
      return {
        type: "audio",
        fileId: msg.audio.file_id,
        localPath: await this.downloadFile(msg.audio.file_id, botId, fileName),
      };
    }
    return { type: "text", text: msg.text };
  }

  // ─── Inbound message from active candidate ────────────────────────────────

  private async handleInboundMessage(
    ctx: any,
    candidateId: string,
    botId: string,
  ): Promise<void> {
    const msg = ctx.message;
    if (!msg) return;

    const { type, text, fileId, fileName, mimeType, localPath } =
      await this.extractMediaInfo(msg, botId);

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

  async sendMeetingNotification(
    telegramId: string,
    lang: string,
    key: "meeting_scheduled" | "meeting_reminder" | "meeting_cancelled",
    vars: { date: string; time: string; minutes?: number; note?: string },
    options?: { candidateId?: string; adminId?: string },
  ): Promise<void> {
    try {
      let text = await this.getTranslation(this.botId, lang, key, "");
      text = text
        .replace("{date}", vars.date)
        .replace("{time}", vars.time)
        .replace("{minutes}", String(vars.minutes || ""))
        .replace("{note}", vars.note || "");
      const chatId = parseInt(telegramId);
      const sent = await this.bot.api.sendMessage(chatId, text.trim());

      // Save the notification as an outbound message so it appears in the chat
      if (options?.candidateId) {
        const message = await prisma.message.create({
          data: {
            candidateId: options.candidateId,
            adminId: options.adminId || null,
            direction: "outbound",
            type: "text",
            text: text.trim(),
            telegramMsgId: sent.message_id,
          },
          include: { admin: { select: { id: true, name: true } } },
        });

        wsManager.broadcast({
          type: "NEW_MESSAGE",
          payload: {
            candidateId: options.candidateId,
            message,
            direction: "outbound",
          },
        });
      }
    } catch (error) {
      console.error(`Error sending ${key} to ${telegramId}:`, error);
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
