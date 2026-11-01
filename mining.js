const DAILY_REWARD = 50;
const MINING_DURATION = 24 * 60 * 60 * 1000;

export function calculateMining(startedAt, now = Date.now()) {
  if (!startedAt) {
    return {
      amount: 0,
      elapsed: 0,
      remaining: MINING_DURATION
    };
  }

  const start = new Date(startedAt).getTime();

  if (!Number.isFinite(start) || start > now) {
    return {
      amount: 0,
      elapsed: 0,
      remaining: MINING_DURATION
    };
  }

  const elapsed = Math.min(now - start, MINING_DURATION);

  const amount = (elapsed / MINING_DURATION) * DAILY_REWARD;

  return {
    amount: Number(amount.toFixed(8)),
    elapsed,
    remaining: Math.max(0, MINING_DURATION - elapsed)
  };
}
