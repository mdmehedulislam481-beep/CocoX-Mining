export function getUserProfile(user) {
  if (!user || !user.id) {
    throw new Error("Telegram user information is missing");
  }

  return {
    telegramId: String(user.id),
    firstName: user.first_name || "",
    lastName: user.last_name || "",
    username: user.username || "",
    languageCode: user.language_code || "en",
    photoUrl: user.photo_url || null
  };
}

export function getDisplayName(profile) {
  const name = [
    profile.firstName,
    profile.lastName
  ].filter(Boolean).join(" ");

  return name || profile.username || "CocoX User";
}
