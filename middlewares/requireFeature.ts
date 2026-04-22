import type { Response, NextFunction } from 'express';
import { ApiRequest } from './apiAuth';
import { getFeaturesForUser, getUsage } from '../utils/subscriptionHelper';
import { apiError } from '../utils/apiResponse';

export function requireFeature(featureKey: string) {
  return async (req: ApiRequest, res: Response, next: NextFunction) => {
    try {
      const features = await getFeaturesForUser(req.user!.id);
      const value = features[featureKey];

      if (value === 'false' || value === undefined || value === null) {
        return apiError(res, 403, 'FEATURE_NOT_AVAILABLE',
          `Requires upgrade. Feature: ${featureKey}`);
      }

      if (value !== 'unlimited' && !isNaN(parseInt(value))) {
        const limit = parseInt(value);
        const used = await getUsage(req.user!.id, featureKey);
        if (used >= limit) {
          return apiError(res, 403, 'QUOTA_EXCEEDED',
            `Feature quota reached: ${featureKey}`,
            { limit, used });
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
