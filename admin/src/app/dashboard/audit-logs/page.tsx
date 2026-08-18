"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ScrollText, Search, Filter, X, ArrowUpDown,
  RefreshCw, FileDown, AlertCircle, Eye, Printer,
} from "lucide-react";
import { getAuditLogs, getAuditActions, getAuditEntityTypes, exportAuditLogsCSV } from "@/services/audit";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import { downloadTextFile } from "@/lib/exportUtils";
import type { AuditLog } from "@/types";

const PAGE_SIZE = 20;

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 border-b border-border py-2.5 last:border-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [actions, setActions] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        limit: PAGE_SIZE,
        sortBy: "createdAt",
        sortOrder,
      };
      if (actionFilter) params.action = actionFilter;
      if (entityFilter) params.entityType = entityFilter;
      if (searchQuery) params.search = searchQuery;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const res = await getAuditLogs(params);
      setLogs(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalRecords(res.pagination.total);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch {
      setError("Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityFilter, searchQuery, fromDate, toDate, sortOrder]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    getAuditActions().then(setActions).catch(() => {});
    getAuditEntityTypes().then(setEntityTypes).catch(() => {});
  }, []);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (actionFilter) params.action = actionFilter;
      if (entityFilter) params.entityType = entityFilter;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const blob = await exportAuditLogsCSV(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice?.(0, 10) || ""}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (actionFilter) params.action = actionFilter;
      if (entityFilter) params.entityType = entityFilter;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const blob = await exportAuditLogsCSV(params);
      const text = await blob.text();
      downloadTextFile(text, `audit-logs-${new Date().toISOString().slice?.(0, 10) || ""}.xls`, "text/csv;charset=utf-8;", true);
    } catch {
      setError("Excel export failed");
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setActionFilter("");
    setEntityFilter("");
    setSearchInput("");
    setSearchQuery("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const hasActiveFilters = actionFilter || entityFilter || searchQuery || fromDate || toDate;

  const columns: Column<AuditLog & Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "action",
        header: "Action",
        render: (item) => <StatusBadge status={item.action.replace(/_/g, " ")} />,
        exportValue: (item) => item.action,
      },
      {
        key: "entityType",
        header: "Entity",
        render: (item) => (
          <button
            type="button"
            onClick={() => setDetailLog(item as AuditLog)}
            className="text-left hover:text-primary"
          >
            <span className="capitalize">{item.entityType}</span>
            <span className="block font-mono text-xs text-muted-foreground">{item.entityId ? String(item.entityId).slice(0, 12) + "…" : "—"}</span>
          </button>
        ),
        exportValue: (item) => `${item.entityType}:${item.entityId}`,
      },
      {
        key: "actor",
        header: "Actor",
        render: (item) => item.actor?.name || item.actor?.email || (item.actorId ? String(item.actorId).slice(0, 8) : "System"),
        exportValue: (item) => item.actor?.email || item.actorId,
      },
      {
        key: "previousValues",
        header: "Changes",
        render: (item) => {
          const prev = item.previousValues;
          const next = item.newValues;
          const keys = Object.keys(prev || {})?.slice?.(0, 2) || [];
          if (keys.length === 0) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="space-y-0.5 text-xs">
              {keys.map((k) => (
                <div key={k}>
                  <span className="font-medium">{k}</span>: {String(prev?.[k] ?? "null")} → {String(next?.[k] ?? "null")}
                </div>
              ))}
            </div>
          );
        },
      },
      {
        key: "createdAt",
        header: "Timestamp",
        render: (item) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {new Date(item.createdAt).toLocaleString()}
          </span>
        ),
        exportValue: (item) => item.createdAt,
      },
      {
        key: "actions",
        header: "",
        render: (item) => (
          <button
            type="button"
            onClick={() => setDetailLog(item as AuditLog)}
            className="rounded p-1.5 text-primary hover:bg-muted"
            aria-label="View audit log"
          >
            <Eye size={16} />
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Audit Logs"
        description="Track all admin actions and system changes with filtering and export."
        icon={ScrollText}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`admin-btn-secondary ${showFilters || hasActiveFilters ? "border-primary text-primary" : ""}`}
            >
              <Filter size={16} />
              Filters
              {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-primary" />}
            </button>
            <button type="button" onClick={() => void handleExportCsv()} disabled={exporting} className="admin-btn-secondary disabled:opacity-50">
              <FileDown size={16} />
              {exporting ? "Exporting…" : "CSV"}
            </button>
            <button type="button" onClick={() => void handleExportExcel()} disabled={exporting} className="admin-btn-secondary disabled:opacity-50">
              Excel
            </button>
            <button type="button" onClick={() => void fetchLogs()} className="admin-btn-secondary">
              <RefreshCw size={16} />
            </button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search actions, entities..."
            className="admin-input pl-9 pr-8"
            aria-label="Search audit logs"
          />
          {searchInput && (
            <button type="button" onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSortOrder((s) => (s === "desc" ? "asc" : "desc"))}
          className="admin-btn-secondary"
        >
          <ArrowUpDown size={14} />
          {sortOrder === "desc" ? "Newest" : "Oldest"}
        </button>
      </div>

      {showFilters && (
        <div className="mb-5 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <label htmlFor="action-filter" className="mb-1 block text-xs font-medium">Action</label>
              <select id="action-filter" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="admin-input">
                <option value="">All Actions</option>
                {actions.map((a) => (
                  <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="entity-filter" className="mb-1 block text-xs font-medium">Entity Type</label>
              <select id="entity-filter" value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }} className="admin-input">
                <option value="">All Entities</option>
                {entityTypes.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="from-date" className="mb-1 block text-xs font-medium">From Date</label>
              <input id="from-date" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="admin-input" />
            </div>
            <div>
              <label htmlFor="to-date" className="mb-1 block text-xs font-medium">To Date</label>
              <input id="to-date" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="admin-input" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">
              {totalRecords > 0 ? `${totalRecords} total records` : hasActiveFilters ? "No matching logs" : ""}
            </span>
            <button type="button" onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600">
              <X size={12} /> Clear Filters
            </button>
          </div>
        </div>
      )}

      {!showFilters && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="admin-input w-auto min-w-[160px]" aria-label="Filter by action">
            <option value="">All Actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
            ))}
          </select>
          <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }} className="admin-input w-auto min-w-[160px]" aria-label="Filter by entity">
            <option value="">All Entities</option>
            {entityTypes.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
      )}

      {error && !loading ? (
        <EmptyState
          icon={AlertCircle}
          title="Could not load audit logs"
          description={error}
          action={<button type="button" onClick={() => void fetchLogs()} className="admin-btn-primary">Retry</button>}
        />
      ) : !loading && logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit logs found" description="Try adjusting filters or date range." />
      ) : (
        <DataTable
          columns={columns}
          data={logs as (AuditLog & Record<string, unknown>)[]}
          loading={loading}
          page={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          hasNext={hasNext}
          hasPrev={hasPrev}
          onPageChange={setPage}
          emptyMessage="No audit logs found"
          exportFilename="audit-logs-page"
          showFirstLast
          pageSize={PAGE_SIZE}
        />
      )}

      <Drawer open={!!detailLog} onClose={() => setDetailLog(null)} title="Audit Log Details" width="max-w-xl">
        {detailLog && (
          <div className="space-y-4">
            <dl>
              <FieldRow label="Action"><StatusBadge status={detailLog.action} /></FieldRow>
              <FieldRow label="Entity Type">{detailLog.entityType}</FieldRow>
              <FieldRow label="Entity ID"><span className="font-mono text-xs">{detailLog.entityId}</span></FieldRow>
              <FieldRow label="Actor">{detailLog.actor?.name || detailLog.actor?.email || detailLog.actorId}</FieldRow>
              <FieldRow label="Timestamp">{new Date(detailLog.createdAt).toLocaleString()}</FieldRow>
            </dl>
            {(detailLog.previousValues && Object.keys(detailLog.previousValues).length > 0) && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Changes</h3>
                <pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                  {JSON.stringify({ previous: detailLog.previousValues, next: detailLog.newValues }, null, 2)}
                </pre>
              </div>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="admin-btn-secondary w-full"
            >
              <Printer size={16} /> Print
            </button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
