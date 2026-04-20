import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { apiError } from '../utils/apiResponse';

interface ValidateOptions {
  rejectEmpty?: boolean;
}

export const validateBody =
  <T>(schema: ZodSchema<T>, opts: ValidateOptions = {}) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      apiError(res, 400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', result.error.issues);
      return;
    }

    if (opts.rejectEmpty) {
      const hasFields =
        result.data &&
        typeof result.data === 'object' &&
        Object.values(result.data as Record<string, unknown>).some((v) => v !== undefined);
      if (!hasFields) {
        apiError(res, 400, 'NO_FIELDS_TO_UPDATE', 'Cần ít nhất một trường để cập nhật');
        return;
      }
    }

    req.body = result.data;
    next();
  };
