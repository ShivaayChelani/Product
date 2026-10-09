/** Public support / legal contact. Do not confuse with admin account identities. */
export const SUPPORT_EMAIL = 'shivaay.chelani@gmail.com';

export const SUPPORT_EMAIL_TYPO = 'shivaay.chelai@gmail.com';

export function normalizeSupportEmailTypo(text: string): string {
  if (!text) return text;
  return text.replace(/shivaay\.chelai@gmail\.com/gi, SUPPORT_EMAIL);
}
