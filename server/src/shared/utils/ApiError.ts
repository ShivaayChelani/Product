/** Machine-readable error codes for client-side branching (never string-match `message`). */
export const ErrorCodes = {
  SWITCH_CONFIRMATION_REQUIRED: 'SWITCH_CONFIRMATION_REQUIRED',
  ROLE_ALREADY_EXISTS: 'ROLE_ALREADY_EXISTS',
  APPLICATION_PENDING: 'APPLICATION_PENDING',
  APPLICATION_REQUIRED: 'APPLICATION_REQUIRED',
  ROLE_NOT_APPROVED: 'ROLE_NOT_APPROVED',
  ROLE_REQUIRED: 'ROLE_REQUIRED',
  ROLE_SUSPENDED: 'ROLE_SUSPENDED',
  CITY_MISMATCH: 'CITY_MISMATCH',
  PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',
  ACTIVE_SUBSCRIPTION_EXISTS: 'ACTIVE_SUBSCRIPTION_EXISTS',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: ErrorCode | string;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    message: string,
    isOperational = true,
    code?: ErrorCode | string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
