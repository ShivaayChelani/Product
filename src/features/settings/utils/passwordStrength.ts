export type PasswordStrength = 'weak' | 'medium' | 'strong' | 'none';

const STRONG_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,128}$/;

export function scorePassword(value: string): PasswordStrength {
  if (!value) return 'none';
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[@$!%*?&]/.test(value)) score += 1;
  if (STRONG_REGEX.test(value)) score += 1;
  if (score <= 2) return 'weak';
  if (score <= 4) return 'medium';
  return 'strong';
}

export function passwordMeetsPolicy(value: string): boolean {
  return STRONG_REGEX.test(value);
}
