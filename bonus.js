const DAILY_BONUS = 10;

export function getDailyBonus() {
  return DAILY_BONUS;
}

export function canClaimDailyBonus(lastBonusAt, now = new Date()) {
  if (!lastBonusAt) {
    return true;
  }

  const last = new Date(lastBonusAt);

  if (Number.isNaN(last.getTime())) {
    return false;
  }

  return (
    now.getUTCFullYear() !== last.getUTCFullYear() ||
    now.getUTCMonth() !== last.getUTCMonth() ||
    now.getUTCDate() !== last.getUTCDate()
  );
}
