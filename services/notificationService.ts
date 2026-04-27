import pool from '../config/db';

export const NOTIFICATION_TYPES = [
  'streak_reminder',
  'review_due',
  'subscription_activated',
  'subscription_pending',
  'subscription_rejected',
  'achievement_unlocked',
  'system_update',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string | null;
  linkUrl?: string | null;
}

export interface CreatedNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: Date;
}

/**
 * Insert a per-user in-app notification. Returns the persisted row so callers
 * can reference the id (e.g. for deep-link generation in tests).
 *
 * FCM push dispatch is intentionally NOT performed here — it is deferred to
 * Phase 12. This service only writes to user_notifications.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<CreatedNotification> {
  const { userId, type, title } = input;
  const message = input.message ?? null;
  const linkUrl = input.linkUrl ?? null;

  const { rows } = await pool.query<CreatedNotification>(
    `INSERT INTO user_notifications (user_id, type, title, message, link_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, type, title, message, link_url, is_read, created_at`,
    [userId, type, title, message, linkUrl],
  );
  return rows[0];
}

/**
 * Fire-and-forget wrapper. Use from hot paths (game run, streak update) where
 * a notification failure must NOT break the surrounding operation.
 */
export function fireNotification(input: CreateNotificationInput): void {
  void createNotification(input).catch((err) =>
    console.error('[notificationService] fire failed:', err),
  );
}
