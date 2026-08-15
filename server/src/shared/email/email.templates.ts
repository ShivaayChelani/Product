import { env } from '../../config/env';

const BRAND = {
  primary: '#B9834B',
  text: '#63300E',
  muted: '#8B6914',
  background: '#FFF9F2',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layoutHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.background};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #F0E4D4;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px 8px;font-size:22px;font-weight:700;color:${BRAND.primary};">PalSafar</td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px;font-size:15px;line-height:1.6;color:${BRAND.text};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;font-size:12px;line-height:1.5;color:${BRAND.muted};border-top:1px solid #F0E4D4;">
              This is an automated message from PalSafar. If you did not request this, you can ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function codeBlock(code: string): string {
  return `<p style="margin:20px 0;">
    <span style="display:inline-block;padding:14px 22px;border-radius:12px;background:${BRAND.background};border:1px dashed ${BRAND.primary};font-size:28px;font-weight:700;letter-spacing:4px;color:${BRAND.text};">${escapeHtml(code)}</span>
  </p>`;
}

export type VerificationEmailPurpose = 'password_reset' | 'account_deletion' | 'login_otp' | 'register_otp';

export interface VerificationEmailContent {
  subject: string;
  text: string;
  html: string;
}

export function buildVerificationEmail(
  code: string,
  purpose: VerificationEmailPurpose,
): VerificationEmailContent {
  const appUrl = env.clientUrl.replace(/\/+$/, '');

  if (purpose === 'account_deletion') {
    const subject = 'PalSafar — Account deletion verification code';
    const text = [
      'You requested to permanently delete your PalSafar account.',
      '',
      `Verification code: ${code}`,
      '',
      'This code expires in 15 minutes.',
      'If you did not request account deletion, secure your account immediately.',
      '',
      `PalSafar — ${appUrl}`,
    ].join('\n');
    const html = layoutHtml(
      subject,
      `<p>You requested to permanently delete your PalSafar account.</p>
       ${codeBlock(code)}
       <p>This code expires in <strong>15 minutes</strong>.</p>
       <p>If you did not request account deletion, please sign in and change your password immediately.</p>`,
    );
    return { subject, text, html };
  }

  if (purpose === 'login_otp') {
    const subject = 'PalSafar Admin — Sign-in verification code';
    const text = [
      'Use this code to sign in to the PalSafar admin dashboard.',
      '',
      `Sign-in code: ${code}`,
      '',
      'This code expires in 15 minutes.',
      'If you did not request this code, you can ignore this email.',
      '',
      `PalSafar — ${appUrl}`,
    ].join('\n');
    const html = layoutHtml(
      subject,
      `<p>Use this code to sign in to the <strong>PalSafar admin dashboard</strong>.</p>
       ${codeBlock(code)}
       <p>This code expires in <strong>15 minutes</strong>.</p>
       <p>If you did not request this code, you can safely ignore this email.</p>`,
    );
    return { subject, text, html };
  }

  if (purpose === 'register_otp') {
    const subject = 'PalSafar — Verify your email';
    const text = [
      'Welcome to PalSafar! Use this code to verify your email and finish creating your account.',
      '',
      `Verification code: ${code}`,
      '',
      'This code expires in 15 minutes.',
      'If you did not create a PalSafar account, you can ignore this email.',
      '',
      `PalSafar — ${appUrl}`,
    ].join('\n');
    const html = layoutHtml(
      subject,
      `<p>Welcome to <strong>PalSafar</strong>! Use this code to verify your email and finish creating your account.</p>
       ${codeBlock(code)}
       <p>This code expires in <strong>15 minutes</strong>.</p>
       <p>If you did not create a PalSafar account, you can safely ignore this email.</p>`,
    );
    return { subject, text, html };
  }

  const subject = 'PalSafar — Password reset code';
  const text = [
    'You requested a password reset for your PalSafar account.',
    '',
    `Reset code: ${code}`,
    '',
    'This code expires in 15 minutes.',
    'If you did not request a password reset, you can ignore this email.',
    '',
    `PalSafar — ${appUrl}`,
  ].join('\n');
  const html = layoutHtml(
    subject,
    `<p>You requested a password reset for your PalSafar account.</p>
     ${codeBlock(code)}
     <p>This code expires in <strong>15 minutes</strong>.</p>
     <p>If you did not request a password reset, you can safely ignore this email.</p>`,
  );
  return { subject, text, html };
}
