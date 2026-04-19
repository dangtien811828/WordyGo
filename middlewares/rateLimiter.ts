import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { apiError } from '../utils/apiResponse';

const handler = (
  _req: Request,
  res: Response,
  _next: NextFunction,
  options: Options
) => {
  apiError(
    res,
    options.statusCode,
    'TOO_MANY_REQUESTS',
    typeof options.message === 'string'
      ? options.message
      : 'Quá nhiều yêu cầu, vui lòng thử lại sau'
  );
};

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Quá nhiều lần thử đăng nhập, vui lòng thử lại sau 15 phút',
  handler,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Quá nhiều lần đăng ký, vui lòng thử lại sau 1 giờ',
  handler,
});

export const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Quá nhiều lần refresh token, vui lòng thử lại sau 1 giờ',
  handler,
});
