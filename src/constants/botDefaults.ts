/**
 * Default bot message translations.
 * Used by BotInstance as fallback when no DB override exists,
 * and by the botMessages route to expose keys to the admin UI.
 */

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
    meeting_scheduled: {
      label: "Meeting scheduled notification",
      default: "📅 You have a meeting scheduled on {date} at {time}.\n\n{note}",
    },
    meeting_reminder: {
      label: "Meeting reminder notification",
      default: "⏰ Reminder: You have a meeting in {minutes} minutes ({date} at {time}).\n\n{note}",
    },
    meeting_cancelled: {
      label: "Meeting cancelled notification",
      default: "❌ Your meeting on {date} at {time} has been cancelled.",
    },
  };

export const DEFAULT_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    welcome: "👋 Welcome! Please choose a language:",
    survey_complete:
      "✅ Thank you! Your application has been submitted successfully.",
    invalid_option: "⚠️ Please select one of the provided options.",
    upload_file: "📎 Please send a photo or file as your answer.",
    please_send_file: "📎 Please send a photo or file, not text.",
    invalid_date_format:
      "⚠️ Please enter your birth date in the format DD.MM.YYYY (e.g. 15.03.1998)",
    invalid_date_value: "⚠️ Please enter a valid birth date.",
    phone_use_button:
      "📱 Please use the button below to share your phone number.",
    meeting_scheduled:
      "📅 You have a meeting scheduled on {date} at {time}.\n\n{note}",
    meeting_reminder:
      "⏰ Reminder: You have a meeting in {minutes} minutes ({date} at {time}).\n\n{note}",
    meeting_cancelled:
      "❌ Your meeting on {date} at {time} has been cancelled.",
  },
  ru: {
    welcome: "👋 Добро пожаловать! Выберите язык:",
    survey_complete: "✅ Спасибо! Ваша заявка успешно отправлена.",
    invalid_option:
      "⚠️ Пожалуйста, выберите один из предложенных вариантов.",
    upload_file: "📎 Пожалуйста, отправьте фото или файл.",
    please_send_file: "📎 Пожалуйста, отправьте файл, а не текст.",
    invalid_date_format:
      "⚠️ Введите дату рождения в формате ДД.ММ.ГГГГ (например 15.03.1998)",
    invalid_date_value: "⚠️ Введите корректную дату рождения.",
    phone_use_button:
      "📱 Пожалуйста, используйте кнопку ниже, чтобы поделиться номером.",
    meeting_scheduled:
      "📅 У вас назначена встреча {date} в {time}.\n\n{note}",
    meeting_reminder:
      "⏰ Напоминание: через {minutes} минут у вас встреча ({date} в {time}).\n\n{note}",
    meeting_cancelled:
      "❌ Ваша встреча {date} в {time} была отменена.",
  },
  uz: {
    welcome: "👋 Xush kelibsiz! Tilni tanlang:",
    survey_complete: "✅ Rahmat! Arizangiz muvaffaqiyatli yuborildi.",
    invalid_option:
      "⚠️ Iltimos, taklif etilgan variantlardan birini tanlang.",
    upload_file: "📎 Iltimos, rasm yoki fayl yuboring.",
    please_send_file: "📎 Iltimos, matn emas, fayl yuboring.",
    invalid_date_format:
      "⚠️ Tug'ilgan sanangizni KK.OO.YYYY formatida kiriting (masalan 15.03.1998)",
    invalid_date_value: "⚠️ Iltimos, to'g'ri tug'ilgan sanani kiriting.",
    phone_use_button:
      "📱 Raqamingizni ulashish uchun quyidagi tugmani bosing.",
    meeting_scheduled:
      "📅 Sizga {date} kuni soat {time} da uchrashuv belgilandi.\n\n{note}",
    meeting_reminder:
      "⏰ Eslatma: {minutes} daqiqadan so'ng uchrashuvingiz bor ({date} kuni soat {time}).\n\n{note}",
    meeting_cancelled:
      "❌ Sizning {date} kuni soat {time} dagi uchrashuvingiz bekor qilindi.",
  },
};
