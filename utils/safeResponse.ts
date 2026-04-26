/**
 * Response shaping helpers — guarantee non-null primitives in JSON output so the
 * Dart/Mobile client never hits a null-cast crash on String/int/double/bool/Array
 * fields. DateTime and nested objects are still allowed to be null.
 *
 * Usage:
 *   import { s, n, b, a } from '../utils/safeResponse';
 *   res.json({ name: s(row.name), count: n(row.count), tags: a(row.tags) });
 */

/** String default — `null`/`undefined` → ''. Empty string is a valid value. */
export const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Number default — `null`/`undefined`/non-finite → 0. */
export const n = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const num = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
};

/** Boolean default — `null`/`undefined` → false. */
export const b = (v: unknown): boolean => (v === null || v === undefined ? false : Boolean(v));

/** Array default — `null`/`undefined`/non-array → []. */
export const a = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
