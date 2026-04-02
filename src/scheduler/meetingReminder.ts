import prisma from "../db";
import { botManager } from "../bot/BotManager";

const CHECK_INTERVAL = 30_000; // 30 seconds

async function checkMeetingReminders(): Promise<void> {
  try {
    const now = new Date();

    // Find meetings that need reminders
    const meetings = await prisma.meeting.findMany({
      where: {
        status: "scheduled",
        reminderSent: false,
        scheduledAt: { gt: now },
      },
      include: {
        candidate: { select: { telegramId: true, lang: true, botId: true } },
      },
    });

    for (const meeting of meetings) {
      const msUntilMeeting =
        meeting.scheduledAt.getTime() - now.getTime();
      const minutesUntilMeeting = msUntilMeeting / 60_000;

      if (minutesUntilMeeting <= meeting.reminderMinutes) {
        const botInstance = botManager.getInstance(
          meeting.candidate.botId,
        );
        if (botInstance && meeting.candidate.telegramId) {
          const dt = meeting.scheduledAt;
          await botInstance.sendMeetingNotification(
            meeting.candidate.telegramId,
            meeting.candidate.lang,
            "meeting_reminder",
            {
              date: dt.toLocaleDateString("en-GB"),
              time: dt.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              }),
              minutes: Math.round(minutesUntilMeeting),
              note: meeting.note || "",
            },
            { candidateId: meeting.candidateId },
          );
        }

        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { reminderSent: true },
        });
      }
    }
  } catch (error) {
    console.error("Meeting reminder scheduler error:", error);
  }
}

export function startMeetingReminderScheduler(): void {
  // Run immediately on startup, then repeat on interval
  checkMeetingReminders();
  setInterval(checkMeetingReminders, CHECK_INTERVAL);

  console.log("Meeting reminder scheduler started");
}
