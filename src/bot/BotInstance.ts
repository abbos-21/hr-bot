import { Bot, GrammyError, HttpError, InlineKeyboard, InputFile } from "grammy";
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

  private async getTranslation(
    botId: string,
    lang: string,
    key: string,
    fallback: string,
  ): Promise<string> {
    // Simple built-in translations
    const translations: Record<string, Record<string, string>> = {
      en: {
        welcome: "👋 Welcome! Please choose a language:",
        choose_job: "📋 Please select a position to apply for:",
        no_jobs: "No positions available at the moment.",
        survey_complete:
          "✅ Thank you! Your application has been submitted successfully.",
        answer_saved: "✅ Answer saved.",
        invalid_option: "⚠️ Please select one of the provided options.",
        type_answer: "Please type your answer:",
        upload_file: "Please upload your file (resume, document, etc.):",
        back: "◀️ Back",
        start_over: "🔄 Start over",
        message_received: "✉️ New message from HR:",
        application_status: "📊 Your current status:",
      },
      ru: {
        welcome: "👋 Добро пожаловать! Выберите язык:",
        choose_job: "📋 Выберите вакансию:",
        no_jobs: "В данный момент нет доступных вакансий.",
        survey_complete: "✅ Спасибо! Ваша заявка успешно отправлена.",
        answer_saved: "✅ Ответ сохранён.",
        invalid_option:
          "⚠️ Пожалуйста, выберите один из предложенных вариантов.",
        type_answer: "Введите ваш ответ:",
        upload_file: "Пожалуйста, загрузите файл (резюме, документ и т.д.):",
        back: "◀️ Назад",
        start_over: "🔄 Начать заново",
        message_received: "✉️ Новое сообщение от HR:",
        application_status: "📊 Ваш текущий статус:",
      },
      uz: {
        welcome: "👋 Xush kelibsiz! Tilni tanlang:",
        choose_job: "📋 Vakansiyani tanlang:",
        no_jobs: "Hozirda mavjud vakansiyalar yo'q.",
        survey_complete: "✅ Rahmat! Arizangiz muvaffaqiyatli yuborildi.",
        answer_saved: "✅ Javob saqlandi.",
        invalid_option:
          "⚠️ Iltimos, taklif etilgan variantlardan birini tanlang.",
        type_answer: "Javobingizni kiriting:",
        upload_file: "Iltimos, fayl yuklang (rezyume, hujjat va boshqalar):",
        back: "◀️ Orqaga",
        start_over: "🔄 Qayta boshlash",
        message_received: "✉️ HR dan yangi xabar:",
        application_status: "📊 Joriy statusingiz:",
      },
    };

    return translations[lang]?.[key] || translations["en"]?.[key] || fallback;
  }

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

        if (languages.length === 0) {
          // Use default language
          await this.showJobList(ctx, botId, botData.defaultLang, telegramId);
          return;
        }

        if (languages.length === 1) {
          await this.showJobList(ctx, botId, languages[0].code, telegramId);
          return;
        }

        // Show language selection
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
          await this.showJobList(ctx, botId, lang, telegramId);
          return;
        }

        if (data.startsWith("job:")) {
          const [, jobId, lang] = data.split(":");
          await ctx.answerCallbackQuery();
          await this.startSurvey(ctx, botId, jobId, lang, telegramId);
          return;
        }

        if (data.startsWith("ans:")) {
          // callback data is just ans:${optionId} to stay within Telegram's 64-byte limit
          const optionId = data.slice(4);
          await ctx.answerCallbackQuery();

          // Look up the option to get its questionId
          const option = await prisma.questionOption.findUnique({
            where: { id: optionId },
            include: { question: true },
          });
          if (!option) return;

          // Find the active incomplete candidate for this user on this bot
          const candidate = await prisma.candidate.findFirst({
            where: {
              botId,
              telegramId,
              status: "incomplete",
            },
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

    // Text-only messages. Using 'message:text' instead of 'message' is critical:
    // bot.on('message') would intercept ALL message types (photos, documents,
    // voice, etc.) and since the handler never calls next(), the specific media
    // handlers below would never fire for survey candidates.  'message:text'
    // only matches messages where ctx.message.text is present, so media
    // messages fall through to :photo / :document / :voice / :video / :audio.
    bot.on("message:text", async (ctx) => {
      try {
        const telegramId = ctx.from?.id.toString() || "";

        // Find active candidates for this user and bot (most recent)
        const candidate = await prisma.candidate.findFirst({
          where: {
            botId,
            telegramId,
            status: {
              in: [
                "incomplete",
                "applied",
                "screening",
                "interviewing",
                "offered",
              ],
            },
          },
          include: {
            job: { include: { translations: true } },
          },
          orderBy: { updatedAt: "desc" },
        });

        if (!candidate) {
          // New user or no active application
          return;
        }

        // If candidate is past incomplete, handle as inbound message
        if (candidate.status !== "incomplete") {
          await this.handleInboundMessage(ctx, candidate.id, candidate.botId);
          return;
        }

        // Handle survey response
        await this.handleTextAnswer(ctx, candidate);
      } catch (error) {
        console.error("Error in message handler:", error);
      }
    });

    // Media messages (photos, documents, voice, etc.)
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
      if (error instanceof GrammyError) {
        console.error("grammY error:", error.description);
      } else if (error instanceof HttpError) {
        console.error("HTTP error:", error.message);
      } else {
        console.error("Unknown error:", error);
      }
    });
  }

  private async showJobList(
    ctx: any,
    botId: string,
    lang: string,
    telegramId: string,
  ): Promise<void> {
    const jobs = await prisma.job.findMany({
      where: { botId, isActive: true },
      include: {
        translations: true,
      },
    });

    if (jobs.length === 0) {
      const msg = await this.getTranslation(
        botId,
        lang,
        "no_jobs",
        "No positions available.",
      );
      await ctx.reply(msg);
      return;
    }

    const botData = await prisma.bot.findUnique({ where: { id: botId } });
    const defaultLang = botData?.defaultLang || "en";

    const keyboard = new InlineKeyboard();
    jobs.forEach((job) => {
      const translation =
        job.translations.find((t) => t.lang === lang) ||
        job.translations.find((t) => t.lang === defaultLang) ||
        job.translations[0];
      if (translation) {
        keyboard.text(translation.title, `job:${job.id}:${lang}`).row();
      }
    });

    const msg = await this.getTranslation(
      botId,
      lang,
      "choose_job",
      "Please choose a position:",
    );
    await ctx.reply(msg, { reply_markup: keyboard });
  }

  private async startSurvey(
    ctx: any,
    botId: string,
    jobId: string,
    lang: string,
    telegramId: string,
  ): Promise<void> {
    // Find or create candidate
    let candidate = await prisma.candidate.findUnique({
      where: {
        botId_telegramId_jobId: { botId, telegramId, jobId },
      },
    });

    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          botId,
          jobId,
          telegramId,
          username: ctx.from?.username,
          lang,
          status: "incomplete",
          currentStep: 0,
        },
      });

      // Broadcast new application started
      wsManager.broadcast({
        type: "NEW_APPLICATION",
        payload: { candidateId: candidate.id, botId, jobId },
      });
    } else if (candidate.status !== "incomplete") {
      await ctx.reply("You have already applied for this position.");
      return;
    } else {
      // Resume application
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { lang, lastActivity: new Date() },
      });
    }

    await this.sendNextQuestion(ctx, candidate.id, lang, botId, jobId);
  }

  private async sendNextQuestion(
    ctx: any,
    candidateId: string,
    lang: string,
    botId: string,
    jobId: string,
  ): Promise<void> {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) return;

    const questions = await prisma.question.findMany({
      where: { botId, jobId, isActive: true },
      include: {
        translations: true,
        options: {
          include: { translations: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    });

    const currentStep = candidate.currentStep;

    if (currentStep >= questions.length) {
      // Survey complete
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { status: "applied", lastActivity: new Date() },
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
        payload: { candidateId, status: "applied", botId, jobId },
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
      // Skip question with no translations
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { currentStep: currentStep + 1 },
      });
      await this.sendNextQuestion(ctx, candidateId, lang, botId, jobId);
      return;
    }

    const questionText = `(${currentStep + 1}/${questions.length}) ${translation.text}`;

    if (question.type === "choice" && question.options.length > 0) {
      const keyboard = new InlineKeyboard();
      for (const option of question.options) {
        const optionTranslation =
          option.translations.find((t) => t.lang === lang) ||
          option.translations.find((t) => t.lang === defaultLang) ||
          option.translations[0];
        if (optionTranslation) {
          keyboard.text(optionTranslation.text, `ans:${option.id}`).row();
        }
      }
      await ctx.reply(questionText, { reply_markup: keyboard });
    } else if (question.type === "attachment") {
      // Prompt the user to upload a file or image
      const uploadHint = await this.getTranslation(
        botId,
        lang,
        "upload_file",
        "📎 Please send a file, photo, or document as your answer.",
      );
      await ctx.reply(`${questionText}

${uploadHint}`);
    } else {
      await ctx.reply(questionText);
    }
  }

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
      include: {
        options: { include: { translations: true } },
      },
    });

    if (!question) return;

    const option = question.options.find((o) => o.id === optionId);
    if (!option) {
      await ctx.reply("Invalid option.");
      return;
    }

    // Save or update answer
    await prisma.answer.upsert({
      where: { candidateId_questionId: { candidateId, questionId } },
      update: { optionId, textValue: null, updatedAt: new Date() },
      create: { candidateId, questionId, optionId },
    });

    // Update field on candidate if fieldKey set
    if (question.fieldKey) {
      const optTrans =
        option.translations.find((t) => t.lang === candidate.lang) ||
        option.translations[0];
      await this.updateCandidateField(
        candidateId,
        question.fieldKey,
        optTrans?.text || "",
      );
    }

    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        currentStep: candidate.currentStep + 1,
        lastActivity: new Date(),
      },
    });

    await this.sendNextQuestion(
      ctx,
      candidateId,
      candidate.lang,
      candidate.botId,
      candidate.jobId,
    );
  }

  private async handleTextAnswer(ctx: any, candidate: any): Promise<void> {
    const text = ctx.message?.text;
    if (!text) return;

    const questions = await prisma.question.findMany({
      where: { botId: candidate.botId, jobId: candidate.jobId, isActive: true },
      orderBy: { order: "asc" },
    });

    const question = questions[candidate.currentStep];
    if (!question) return;

    if (question.type === "choice") {
      const msg = await this.getTranslation(
        candidate.botId,
        candidate.lang,
        "invalid_option",
        "Please select one of the provided options.",
      );
      await ctx.reply(msg);
      return;
    }

    if (question.type === "attachment") {
      const msg = await this.getTranslation(
        candidate.botId,
        candidate.lang,
        "please_send_file",
        "📎 Please send a file or photo, not text.",
      );
      await ctx.reply(msg);
      return;
    }

    // Save text answer
    await prisma.answer.upsert({
      where: {
        candidateId_questionId: {
          candidateId: candidate.id,
          questionId: question.id,
        },
      },
      update: { textValue: text, optionId: null, updatedAt: new Date() },
      create: {
        candidateId: candidate.id,
        questionId: question.id,
        textValue: text,
      },
    });

    if (question.fieldKey) {
      await this.updateCandidateField(candidate.id, question.fieldKey, text);
    }

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        currentStep: candidate.currentStep + 1,
        lastActivity: new Date(),
      },
    });

    await this.sendNextQuestion(
      ctx,
      candidate.id,
      candidate.lang,
      candidate.botId,
      candidate.jobId,
    );
  }

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
        isRead: false, // unread until admin opens the chat
      },
    });

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { lastActivity: new Date() },
    });

    // Store as file if document type
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

    // Count all unread inbound messages for this candidate after saving
    const unreadCount = await prisma.message.count({
      where: { candidateId, direction: "inbound", isRead: false },
    });

    wsManager.broadcast({
      type: "NEW_MESSAGE",
      payload: { candidateId, message, direction: "inbound", unreadCount },
    });
  }

  private async handleMediaMessage(ctx: any, mediaType: string): Promise<void> {
    const telegramId = ctx.from?.id.toString() || "";
    const candidate = await prisma.candidate.findFirst({
      where: {
        botId: this.botId,
        telegramId,
        status: {
          in: ["incomplete", "applied", "screening", "interviewing", "offered"],
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!candidate) return;

    if (candidate.status === "incomplete") {
      // Check if current question is an attachment type
      await this.handleAttachmentAnswer(ctx, candidate);
      return;
    }

    // Post-survey inbound message from candidate
    await this.handleInboundMessage(ctx, candidate.id, this.botId);
  }

  private async handleAttachmentAnswer(
    ctx: any,
    candidate: any,
  ): Promise<void> {
    const questions = await prisma.question.findMany({
      where: { botId: candidate.botId, jobId: candidate.jobId, isActive: true },
      orderBy: { order: "asc" },
    });

    const question = questions[candidate.currentStep];
    if (!question || question.type !== "attachment") {
      // Not an attachment step — ignore the media upload
      const msg = await this.getTranslation(
        candidate.botId,
        candidate.lang,
        "type_answer",
        "Please answer the current question in text.",
      );
      await ctx.reply(msg);
      return;
    }

    const msg = ctx.message;
    let fileId: string | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    let localPath: string | undefined;

    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      fileId = photo.file_id;
      fileName = "photo.jpg";
      mimeType = "image/jpeg";
      localPath = await this.downloadFile(fileId, candidate.botId, "photo.jpg");
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

    if (!fileId) return; // Unknown media type

    // Store the human-readable fileName as the answer value so the admin panel
    // can display it meaningfully. The fileId lives in CandidateFile.telegramFileId
    // and is not needed here for display purposes.
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

    // Also create a CandidateFile record for the admin panel files tab
    await prisma.candidateFile.create({
      data: {
        candidateId: candidate.id,
        telegramFileId: fileId,
        fileName: fileName || "attachment",
        mimeType,
        localPath,
      },
    });

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        currentStep: candidate.currentStep + 1,
        lastActivity: new Date(),
      },
    });

    const ackMsg = await this.getTranslation(
      candidate.botId,
      candidate.lang,
      "answer_saved",
      "✅ File received!",
    );
    await ctx.reply(ackMsg);

    await this.sendNextQuestion(
      ctx,
      candidate.id,
      candidate.lang,
      candidate.botId,
      candidate.jobId,
    );
  }

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

  // Send message from admin to candidate
  async sendMessageToCandidate(
    telegramId: string,
    message: {
      type: string;
      text?: string;
      localPath?: string;
      fileId?: string;
      caption?: string;
      fileName?: string; // original filename shown to the Telegram recipient
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
          // Pass the original fileName as the second arg to InputFile so Telegram
          // shows e.g. "test.pdf" instead of the munged disk name "1234_abc.pdf"
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
        if (message.fileId) {
          sentMsg = await this.bot.api.sendVoice(chatId, message.fileId);
        } else if (message.localPath && fs.existsSync(message.localPath)) {
          sentMsg = await this.bot.api.sendVoice(
            chatId,
            new InputFile(message.localPath),
          );
        }
      } else if (message.type === "audio") {
        if (message.fileId) {
          sentMsg = await this.bot.api.sendAudio(chatId, message.fileId);
        } else if (message.localPath && fs.existsSync(message.localPath)) {
          sentMsg = await this.bot.api.sendAudio(
            chatId,
            new InputFile(message.localPath),
          );
        }
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
