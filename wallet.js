const MINIMUM_WITHDRAWAL = 500;

export function isValidBEP20Address(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(
    String(address || "").trim()
  );
}

export function canWithdraw(balance, amount, address) {
  const availableBalance = Number(balance);
  const withdrawalAmount = Number(amount);

  if (
    !Number.isFinite(availableBalance) ||
    !Number.isFinite(withdrawalAmount)
  ) {
    return false;
  }

  if (withdrawalAmount < MINIMUM_WITHDRAWAL) {
    return false;
  }

  if (withdrawalAmount > availableBalance) {
    return false;
  }

  if (!isValidBEP20Address(address)) {
    return false;
  }

  return true;
}

export function getMinimumWithdrawal() {
  return MINIMUM_WITHDRAWAL;
}
