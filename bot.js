
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || "CocoXMiningBot";
const CHANNEL_USERNAME =
  process.env.CHANNEL_USERNAME || "@CocoXMiningChannel";
const APP_URL = process.env.APP_URL;

async function telegramRequest(method, data) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }
  );

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.description || "Telegram API error");
  }

  return result;
}

export async function handleTelegramUpdate(update) {
  const message = update?.message;

  if (!message?.text || !message?.chat?.id) {
    return;
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text.startsWith("/start")) {
    const firstName = message.from?.first_name || "বন্ধু";

    const buttons = [
      [
        {
          text: "📢 Join Channel",
          url: `https://t.me/${CHANNEL_USERNAME.replace("@", "")}`
        }
      ]
    ];

    if (APP_URL) {
      buttons.push([
        {
          text: "🥥 Open CocoX Mining",
          web_app: { url: APP_URL }
        }
      ]);
    }

    const welcomeText =
      `🥥 স্বাগতম ${firstName}!\n\n` +
      `CocoX Mining-এ তোমাকে স্বাগতম।\n\n` +
      `⛏️ Mining Reward: 50 Coconut / 24 Hours\n` +
      `🎁 Daily Bonus: 10 Coconut\n` +
      `👥 Referral Reward: 100 Coconut\n\n` +
      `প্রথমে আমাদের Channel-এ Join করো। তারপর Mining App ওপেন করো।`;

    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: welcomeText,
      reply_markup: {
        inline_keyboard: buttons
      }
    });

    return;
  }

  if (text === "/help") {
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text:
        "🥥 CocoX Mining Help\n\n" +
        "/start - Open CocoX Mining\n" +
        "/help - Help information\n\n" +
        "সমস্যা হলে Admin-এর সঙ্গে যোগাযোগ করো।"
    });

    return;
  }

  if (text === "/id") {
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: `তোমার Telegram ID: ${chatId}`
    });
  }
}

export async function sendBotMessage(chatId, message) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text: message
  });
}

export { BOT_USERNAME, CHANNEL_USERNAME };
