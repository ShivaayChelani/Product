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

export const getPaginationParams = (query: { page?: string; limit?: string }, maxLimit = 100): PaginationParams => {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit || '20', 10)));
  return { page, limit, skip: (page - 1) * limit };
};

export const getCursorParams = (query: { limit?: string; cursor?: string }): CursorPaginationParams => ({
  limit: Math.min(100, Math.max(1, parseInt(query.limit || '20', 10))),
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
