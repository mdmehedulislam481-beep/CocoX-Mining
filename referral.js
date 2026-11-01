export function createReferralLink(telegramId) {
  if (!telegramId) {
    throw new Error("Telegram ID is required");
  }

  return `https://t.me/CocoXMiningBot?start=ref_${telegramId}`;
}

export function getReferralId(startParam) {
  if (!startParam || !startParam.startsWith("ref_")) {
    return null;
  }

  const id = startParam.slice(4);

  if (!/^\d+$/.test(id)) {
    return null;
  }

  return id;
}

export function canRewardReferral(referrerId, referredId) {
  if (!referrerId || !referredId) {
    return false;
  }

  return String(referrerId) !== String(referredId);
}
