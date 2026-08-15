const ALLOWED_SORT_DIRECTIONS = ['ASC', 'DESC'] as const;
type SortDirection = typeof ALLOWED_SORT_DIRECTIONS[number];

function sanitizeSortDirection(dir: string): SortDirection {
  const upper = dir.toUpperCase();
  return ALLOWED_SORT_DIRECTIONS.includes(upper as SortDirection)
    ? upper as SortDirection
    : 'DESC';
}

function sanitizeSortColumn(column: string, allowedColumns: string[], fallback: string): string {
  if (allowedColumns.includes(column)) return column;
  return fallback;
}

export const sql = {
  sortDirection: sanitizeSortDirection,
  sortColumn: sanitizeSortColumn,
  allowedDirections: ALLOWED_SORT_DIRECTIONS,
};
