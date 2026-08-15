import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../shared/utils/ApiError';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let statusCode = 500;
  const correlationId = req.correlationId;
  const response: Record<string, any> = {
    success: false,
    data: null,
    message: 'Internal server error',
    correlationId,
  };

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    response.message = err.message;
    if (err.code) response.code = err.code;
    if (err.details) response.details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    response.message = 'Validation failed';
    response.errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
  } else if (err.name === 'MulterError') {
    const multerErr = err as Error & { code?: string };
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      const isVideoRoute = /video|reel/i.test(req.path);
      response.message = isVideoRoute
        ? 'Video is too large. Please choose a smaller video.'
        : 'Image is too large. Maximum size is 5MB.';
    } else if (multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
      statusCode = 415;
      response.message = 'Unsupported media type.';
    } else {
      statusCode = 400;
      response.message = err.message;
    }
  } else {
    response.message = env.isProduction ? 'Internal server error' : err.message;
  }

  logger.error({ err, correlationId, statusCode, path: req.path }, response.message);

  if (!env.isProduction && !(err instanceof ApiError) && !(err instanceof ZodError)) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};
