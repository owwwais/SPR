// Set by /auth/callback when it completes a password-recovery link, read by
// /reset-password and setNewPassword(). httpOnly and short-lived: it only
// says "this session began with a recovery link a moment ago".
export const RECOVERY_COOKIE = "srp-recovery";
export const RECOVERY_COOKIE_MAX_AGE = 15 * 60;
