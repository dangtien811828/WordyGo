import pool from '../config/db';

export interface PaginateResult<T = any> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Paginate a query.
 * `query` must have LIMIT $N OFFSET $N+1 as the last two params.
 * `countQuery` must return a single row with a "count" column.
 */
export async function paginate<T = any>(
  query: string,
  countQuery: string,
  queryParams: any[] = [],
  countParams: any[] = [],
  page: any = 1,
  limit: any = 20
): Promise<PaginateResult<T>> {
  const safePage = Math.max(1, parseInt(String(page)) || 1);
  const safeLimit = Math.max(1, parseInt(String(limit)) || 20);
  const offset = (safePage - 1) * safeLimit;

  const dataParams = [...queryParams, safeLimit, offset];

  const [dataResult, countResult] = await Promise.all([
    pool.query(query, dataParams),
    pool.query(countQuery, countParams),
  ]);

  const total = parseInt(countResult.rows[0]?.count) || 0;
  const totalPages = Math.ceil(total / safeLimit);

  return {
    rows: dataResult.rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
  };
}
