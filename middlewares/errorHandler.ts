import { Request, Response, NextFunction } from 'express';
import { apiError } from '../utils/apiResponse';

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[ErrorHandler]', err?.stack || err);
  }

  if (res.headersSent) {
    return;
  }

  if (err?.code === '23505') {
    apiError(res, 409, 'DUPLICATE', 'Resource already exists');
    return;
  }
  if (err?.code === '23503') {
    apiError(res, 400, 'FK_VIOLATION', 'Related resource not found');
    return;
  }
  if (err?.statusCode) {
    apiError(res, err.statusCode, err.code || 'ERROR', err.message || 'Error');
    return;
  }

  apiError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};
