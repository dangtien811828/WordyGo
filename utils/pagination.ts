import { Request } from 'express';

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

export const parsePagination = (req: Request): Pagination => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1')) || 1);
  const rawLimit = parseInt(String(req.query.limit ?? '20')) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
};
