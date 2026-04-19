import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { apiError } from '../utils/apiResponse';

export const validateBody =
  <T>(schema: ZodSchema<T>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      apiError(res, 400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', result.error.issues);
      return;
    }
    req.body = result.data;
    next();
  };
