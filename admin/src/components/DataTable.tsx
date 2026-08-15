"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownAZ, ArrowUpZA, ArrowUpDown, Download } from "lucide-react";
import { SkeletonTable } from "@/components/ui/Skeleton";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  /** Include in CSV export (default: true unless render-only) */
  exportValue?: (item: T) => string | number | null | undefined;
}

function escapeCsvCell(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function exportTableCsv<T extends Record<string, unknown>>(
  columns: Column<T>[],
  data: T[],
  filename: string,
  getRowId?: (item: T) => string,
) {
  const exportCols = columns.filter((c) => c.key !== "actions");
  const header = exportCols.map((c) => escapeCsvCell(c.header)).join(",");
  const rows = data.map((item) =>
    exportCols
      .map((col) => {
        const val = col.exportValue
          ? col.exportValue(item)
          : col.render
            ? undefined
            : item[col.key];
        return escapeCsvCell(val ?? "");
      })
      .join(","),
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  void getRowId;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading,
  page,
  totalPages,
  hasNext,
  hasPrev,
  onPageChange,
  emptyMessage = "No data found",
  totalRecords,
  showFirstLast = false,
  onSort,
  sortKey,
  sortDir,
  selectable = false,
  selectedIds,
  onSelectChange,
  getRowId = (item) => String(item.id ?? ""),
  exportFilename,
  toolbar,
  pageSize = 15,
}: {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  page?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  totalRecords?: number;
  showFirstLast?: boolean;
  onSort?: (key: string) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectChange?: (ids: Set<string>) => void;
  getRowId?: (item: T) => string;
  exportFilename?: string;
  toolbar?: React.ReactNode;
  pageSize?: number;
}) {
  const getPageNumbers = () => {
    if (!page || !totalPages) return [];
    
    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = startPage + maxPagesToShow - 1;

    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
  };

  if (loading) {
    return <SkeletonTable rows={8} cols={Math.max(columns.length, 4)} />;
  }

  const allSelected = selectable && data.length > 0 && data.every((item) => selectedIds?.has(getRowId(item)));
  const someSelected = selectable && (selectedIds?.size ?? 0) > 0;

  const toggleAll = () => {
    if (!onSelectChange) return;
    if (allSelected) {
      onSelectChange(new Set());
    } else {
      onSelectChange(new Set(data.map(getRowId)));
    }
  };

  const toggleRow = (id: string) => {
    if (!onSelectChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectChange(next);
  };

  return (
    <div className="space-y-3">
      {(toolbar || exportFilename) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          {exportFilename && data.length > 0 && (
            <button
              type="button"
              onClick={() => exportTableCsv(columns, data, exportFilename, getRowId)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <Download size={14} />
              Export CSV
            </button>
          )}
        </div>
      )}

    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="admin-table-scroll overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-border bg-muted/50">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-semibold text-muted-foreground ${col.sortable ? 'cursor-pointer hover:bg-muted transition-colors' : ''} ${col.className || ""}`}
                  onClick={() => {
                    if (col.sortable && onSort) onSort(col.key);
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {col.header}
                    {col.sortable && (
                      <span className="text-gray-400">
                        {sortKey === col.key ? (
                          sortDir === "asc" ? <ArrowDownAZ size={14} className="text-emerald-600" /> : <ArrowUpZA size={14} className="text-emerald-600" />
                        ) : (
                          <ArrowUpDown size={14} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item, i) => {
                const rowId = getRowId(item);
                return (
                <tr
                  key={rowId || i}
                  className={`transition hover:bg-muted/40 ${selectedIds?.has(rowId) ? "bg-primary/5" : ""}`}
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(rowId) ?? false}
                        onChange={() => toggleRow(rowId)}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        aria-label={`Select row ${rowId}`}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${col.className || ""}`}
                    >
                      {col.render
                        ? col.render(item)
                        : (item[col.key] as React.ReactNode) || "—"}
                    </td>
                  ))}
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages && totalPages > 1 && onPageChange && (
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border px-4 py-3 gap-4">
          <p className="text-sm text-muted-foreground">
            {totalRecords !== undefined ? (
              <>Showing <span className="font-medium">{Math.min(((page || 1) - 1) * pageSize + 1, totalRecords)}</span> to <span className="font-medium">{Math.min((page || 1) * pageSize, totalRecords)}</span> of <span className="font-medium">{totalRecords}</span> records</>
            ) : (
              <>Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span></>
            )}
          </p>
          <div className="flex gap-1 items-center">
            {showFirstLast && (
              <button
                type="button"
                disabled={!hasPrev}
                onClick={() => onPageChange(1)}
                aria-label="First page"
                title="First page"
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronsLeft size={16} />
              </button>
            )}
            <button
              type="button"
              disabled={!hasPrev}
              onClick={() => onPageChange((page || 1) - 1)}
              aria-label="Previous page"
              title="Previous page"
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft size={16} />
            </button>
            
            {getPageNumbers().map(p => (
              <button
                type="button"
                key={p}
                onClick={() => onPageChange(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition ${
                  p === page 
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-200" 
                    : "text-gray-600 hover:bg-gray-50 border border-transparent hover:border-gray-200"
                }`}
              >
                {p}
              </button>
            ))}

            <button
              type="button"
              disabled={!hasNext}
              onClick={() => onPageChange((page || 1) + 1)}
              aria-label="Next page"
              title="Next page"
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronRight size={16} />
            </button>
            {showFirstLast && (
              <button
                type="button"
                disabled={!hasNext}
                onClick={() => onPageChange(totalPages)}
                aria-label="Last page"
                title="Last page"
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronsRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
