/**
 * @deprecated Import from `shared/email/email.service` for new code.
 * Re-exported for backward compatibility.
 */
export {
  sendEmail,
  sendTransactionalEmail,
  isSmtpConfigured,
  resetEmailTransporter,
} from '../email/email.service';

export type { SendEmailInput } from '../email/email.service';
