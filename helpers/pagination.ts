const pool = require('../config/db');

/**
 * Paginate a query.
 *
 * @param {string}  query        - SQL with LIMIT $N OFFSET $N+1 as the last two params
 * @param {string}  countQuery   - SQL returning a single row with a "count" column
 * @param {any[]}   queryParams  - Params for the data query, excluding limit/offset
 * @param {any[]}   countParams  - Params for the count query
 * @param {number}  page         - 1-based page number (default 1)
 * @param {number}  limit        - Rows per page (default 20)
 * @returns {{ rows, total, page, limit, totalPages }}
 */
async function paginate(query, countQuery, queryParams = [], countParams = [], page = 1, limit = 20) {
  const safePage  = Math.max(1, parseInt(page)  || 1);
  const safeLimit = Math.max(1, parseInt(limit) || 20);
  const offset    = (safePage - 1) * safeLimit;

  const dataParams = [...queryParams, safeLimit, offset];

  const [dataResult, countResult] = await Promise.all([
    pool.query(query, dataParams),
    pool.query(countQuery, countParams),
  ]);

  const total      = parseInt(countResult.rows[0]?.count) || 0;
  const totalPages = Math.ceil(total / safeLimit);

  return {
    rows: dataResult.rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
  };
}

module.exports = { paginate };
