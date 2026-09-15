export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface CursorPaginationParams {
  limit: number;
  cursor?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  cursor?: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** Parse a page/limit-style integer. Non-numeric input returns `fallback` instead of NaN. */
export function parsePositiveInt(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export const getPaginationParams = (
  query: { page?: string | number; limit?: string | number },
  maxLimit = 100,
  defaultLimit = 20,
): PaginationParams => {
  const page = Math.min(10_000, Math.max(1, parsePositiveInt(query.page, 1)));
  const limit = Math.min(maxLimit, Math.max(1, parsePositiveInt(query.limit, defaultLimit)));
  return { page, limit, skip: (page - 1) * limit };
};

export const getCursorParams = (query: { limit?: string; cursor?: string }): CursorPaginationParams => ({
  limit: Math.min(100, Math.max(1, parsePositiveInt(query.limit, 20))),
  cursor: query.cursor || undefined,
});

export const paginatedResponse = <T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResponse<T> => {
  const totalPages = Math.ceil(total / params.limit);
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
};

export const cursorPaginatedResponse = <T extends { id: string }>(
  data: T[],
  total: number,
  params: CursorPaginationParams,
): PaginatedResponse<T> => {
  const lastItem = data.length > 0 ? data[data.length - 1] : null;
  return {
    data,
    pagination: {
      page: 1,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
      hasNext: data.length >= params.limit,
      hasPrev: !!params.cursor,
      cursor: lastItem ? Buffer.from(lastItem.id).toString('base64') : null,
    },
  };
};
