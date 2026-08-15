import { Response } from 'express';

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  cursor?: string | null;
}

interface ApiResponseOptions {
  statusCode?: number;
  pagination?: PaginationMeta;
  message?: string;
}

export function sendSuccess<T>(res: Response, data: T, options?: ApiResponseOptions) {
  const body: Record<string, any> = {
    success: true,
    data,
  };

  if (options?.pagination) {
    body.pagination = options.pagination;
  }

  body.message = options?.message || 'Success';

  return res.status(options?.statusCode || 200).json(body);
}

export function sendError(res: Response, statusCode: number, message: string, errors?: any) {
  const body: Record<string, any> = {
    success: false,
    data: null,
    message,
  };

  if (errors) {
    body.errors = errors;
  }

  return res.status(statusCode).json(body);
}

export function sendCreated<T>(res: Response, data: T, message = 'Created successfully') {
  return sendSuccess(res, data, { statusCode: 201, message });
}

export function sendNoContent(res: Response) {
  return res.status(204).send();
}
