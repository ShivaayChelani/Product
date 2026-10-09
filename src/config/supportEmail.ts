/** Public support / legal contact shown in the PalSafar app. */
export const SUPPORT_EMAIL = 'shivaay.chelani@gmail.com';

/** Known typo that shipped in some legal CMS copy. */
export const SUPPORT_EMAIL_TYPO = 'shivaay.chelai@gmail.com';

export function normalizeSupportEmailTypo(text: string): string {
  if (!text) return text;
  return text.replace(/shivaay\.chelai@gmail\.com/gi, SUPPORT_EMAIL);
}
