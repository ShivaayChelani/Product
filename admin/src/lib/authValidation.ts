/**
 * Shared auth-form validation for the Admin login / forgot-password flow.
 * Pure helpers — no React, no DOM — kept unit-testable with vitest (no RTL).
 */

const EMAIL_REGEX_SOURCE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Existing admin email format check. */
export const EMAIL_REGEX = EMAIL_REGEX_SOURCE;

/**
 * Existing admin password policy (preserved verbatim):
 * 8-128 chars, at least one uppercase, one lowercase, one digit, one special char.
 */
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function isValidPassword(value: string): boolean {
  return PASSWORD_REGEX.test(value);
}

/** Confirm-password guard: both values must be present and identical. */
export function passwordsMatch(password: string, confirmPassword: string): boolean {
  return password.length > 0 && password === confirmPassword;
}

/** Human message for the reset step, or "" when the password is acceptable. */
export function passwordValidationError(password: string): string {
  if (!password) return "Enter a new password";
  if (!isValidPassword(password)) {
    return "Password must be 8+ chars with uppercase, lowercase, number, and special character (@$!%*?&)";
  }
  return "";
}