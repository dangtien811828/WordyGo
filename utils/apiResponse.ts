import { Response } from 'express';

export const apiSuccess = <T>(res: Response, data: T, message?: string) =>
  res.json({
    success: true,
    data,
    ...(message ? { message } : {}),
  });

export const apiError = (
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
) =>
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  });
