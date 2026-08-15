import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[source]);
      try {
        req[source] = data;
      } catch {
        Object.assign(req[source] as object, data);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
