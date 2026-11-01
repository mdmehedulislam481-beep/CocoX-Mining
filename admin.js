const ADMIN_IDS = (
  process.env.ADMIN_TELEGRAM_IDS || ""
)
  .split(",")
  .map(id => id.trim())
  .filter(id => /^\d+$/.test(id));

export function isAdmin(telegramId) {
  if (!telegramId) {
    return false;
  }

  return ADMIN_IDS.includes(String(telegramId));
}

export function requireAdmin(telegramId) {
  if (!isAdmin(telegramId)) {
    throw new Error("Access denied: Admin only");
  }

  return true;
}
