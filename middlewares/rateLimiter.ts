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
      : 'Too many requests, please try again later'
  );
};

// Skip rate limiting in test env — localhost shares IP so all tests count against the same counter.
const skipInTests = () => process.env.NODE_ENV === 'test';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, please try again after 15 minutes',
  handler,
  skip: skipInTests,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many registration attempts, please try again after 1 hour',
  handler,
  skip: skipInTests,
});

export const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many token refresh attempts, please try again after 1 hour',
  handler,
  skip: skipInTests,
});
