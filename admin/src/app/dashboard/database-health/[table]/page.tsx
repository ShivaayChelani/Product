"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { ArrowLeft, Search, RefreshCw, Layers, Database } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import {
  getExplorerTableRecords,
  getExplorerTableSchema,
  type ExplorerPagination,
  type ExplorerColumn,
} from "@/services/databaseAdmin";
import { SkeletonTable } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";

export default function TableExplorerPage(props: { params: Promise<{ table: string }> }) {
  const params = use(props.params);
  const table = params.table;
  const [records, setRecords] = useState<any[]>([]);
  const [columns, setColumns] = useState<ExplorerColumn[]>([]);
  const [pagination, setPagination] = useState<ExplorerPagination | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [tab, setTab] = useState<"data" | "columns">("data");
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on search change
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        const [recordsData, schemaData] = await Promise.all([
          getExplorerTableRecords(table, page, pageSize, debouncedSearch),
          getExplorerTableSchema(table),
        ]);
        if (isMounted) {
          setRecords(recordsData.records || []);
          setPagination(recordsData.pagination);
          setColumns(schemaData.columns || []);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.response?.data?.message || err.message || "Failed to load table data");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => { isMounted = false; };
  }, [table, page, pageSize, debouncedSearch]);

  const handleRefresh = () => {
    setLoading(true);
    getExplorerTableRecords(table, page, pageSize, debouncedSearch)
      .then(res => {
        setRecords(res.records || []);
        setPagination(res.pagination);
      })
      .catch(err => {
        setError(err?.response?.data?.message || err.message || "Failed to load table data");
      })
      .finally(() => setLoading(false));
  };

  const renderValue = (val: any) => {
    if (val === null || val === undefined) return <span className="text-muted-foreground italic">NULL</span>;
    if (typeof val === "boolean") return <span className="font-mono text-emerald-600 dark:text-emerald-400">{val ? "true" : "false"}</span>;
    if (typeof val === "object") return <span className="font-mono text-xs text-amber-600 dark:text-amber-400">{JSON.stringify(val)}</span>;
    return <span className="truncate max-w-[200px] inline-block align-bottom">{String(val)}</span>;
  };

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Layers}
          title="Error Loading Table"
          description={error}
          action={
            <Link href="/dashboard/database-health" className="admin-btn-secondary mt-4">
              <ArrowLeft size={16} /> Back to Database Explorer
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/database-health"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </Link>
        <PageHeader
          title={table}
          description={pagination ? `${pagination.total.toLocaleString()} rows` : "Loading..."}
          icon={Layers}
        />
      </div>

      <div className="admin-card overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setTab("data")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === "data" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                Data
              </button>
              <button
                onClick={() => setTab("columns")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === "columns" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                Columns
              </button>
            </div>
            
            {tab === "data" && (
              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search records..."
                    className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
            )}
          </div>
        </div>

        {loading && !records.length ? (
          <div className="p-6"><SkeletonTable rows={10} cols={5} /></div>
        ) : tab === "data" ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {columns.slice(0, 8).map(c => (
                      <th key={c.name} className="px-4 py-3 font-medium text-muted-foreground">{c.name}</th>
                    ))}
                    {columns.length > 8 && (
                      <th className="px-4 py-3 font-medium text-muted-foreground italic">...</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length > 8 ? 9 : columns.length} className="px-4 py-8 text-center text-muted-foreground">
                        No records found.
                      </td>
                    </tr>
                  ) : (
                    records.map((r, i) => (
                      <tr 
                        key={r.id || i} 
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => setSelectedRecord(r)}
                      >
                        {columns.slice(0, 8).map(c => (
                          <td key={c.name} className="px-4 py-3 text-foreground">{renderValue(r[c.name])}</td>
                        ))}
                        {columns.length > 8 && (
                          <td className="px-4 py-3 text-muted-foreground text-xs italic">view more...</td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination && (
              <div className="flex items-center justify-between border-t border-border p-4 bg-muted/20">
                <div className="text-sm text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{((pagination.page - 1) * pagination.pageSize) + 1}</span> to <span className="font-medium text-foreground">{Math.min(pagination.page * pagination.pageSize, pagination.total)}</span> of <span className="font-medium text-foreground">{pagination.total.toLocaleString()}</span>
                </div>
                
                <div className="flex items-center gap-4">
                  <select
                    className="rounded-md border border-input bg-background py-1 pl-2 pr-8 text-sm focus:border-primary focus:outline-none"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={25}>25 rows/page</option>
                    <option value={50}>50 rows/page</option>
                    <option value={100}>100 rows/page</option>
                  </select>

                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-md px-3 py-1 text-sm font-medium bg-background border border-input hover:bg-muted disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                      disabled={page === pagination.totalPages || pagination.totalPages === 0}
                      className="rounded-md px-3 py-1 text-sm font-medium bg-background border border-input hover:bg-muted disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Column</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Nullable</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Default</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {columns.map(c => (
                  <tr key={c.name} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.type}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${c.nullable ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {c.nullable ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground italic font-mono text-xs">{c.defaultValue || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Detail Drawer/Modal overlay (simplified as inline for now, but usually a Dialog/Drawer) */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={() => setSelectedRecord(null)}>
          <div className="w-full max-w-2xl bg-background rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="border-b border-border p-5 flex items-center justify-between bg-muted/20">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Database size={18} className="text-primary" />
                Record Detail: {selectedRecord.id || selectedRecord.name || "Row"}
              </h3>
              <button onClick={() => setSelectedRecord(null)} className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                {columns.map(c => {
                  const val = selectedRecord[c.name];
                  return (
                    <div key={c.name} className="sm:col-span-1">
                      <dt className="text-sm font-medium text-muted-foreground">{c.name}</dt>
                      <dd className="mt-1 text-sm text-foreground break-all">
                        {val === null || val === undefined ? (
                          <span className="italic text-muted-foreground">NULL</span>
                        ) : typeof val === 'object' ? (
                          <pre className="bg-muted p-2 rounded-md font-mono text-xs overflow-x-auto text-amber-600 dark:text-amber-400">
                            {JSON.stringify(val, null, 2)}
                          </pre>
                        ) : typeof val === 'boolean' ? (
                          <span className="font-mono text-emerald-600 dark:text-emerald-400">{val ? 'true' : 'false'}</span>
                        ) : (
                          <span className={val === '********' ? 'font-mono text-muted-foreground bg-muted px-1 rounded' : ''}>
                            {String(val)}
                          </span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
            <div className="border-t border-border p-4 bg-muted/20 flex justify-end">
              <button onClick={() => setSelectedRecord(null)} className="admin-btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
