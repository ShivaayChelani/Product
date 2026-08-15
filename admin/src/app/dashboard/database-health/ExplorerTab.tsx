"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Database, Layers } from "lucide-react";
import { getExplorerTables, type ExplorerTable } from "@/services/databaseAdmin";
import { SkeletonTable } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";

export default function ExplorerTab() {
  const [tables, setTables] = useState<ExplorerTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getExplorerTables();
        setTables(data.tables || []);
        setError(null);
      } catch (err: any) {
        setError(err?.response?.data?.message || err.message || "Failed to load tables");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredTables = tables.filter((t) =>
    t.table.toLowerCase().includes(search.toLowerCase())
  );

  const totalRecords = tables.reduce((acc, t) => acc + (t.rowEstimate || 0), 0);

  if (loading) {
    return <SkeletonTable rows={10} cols={3} />;
  }

  if (error) {
    return (
      <EmptyState
        icon={Database}
        title="Could not load tables"
        description={error}
        action={
          <button type="button" onClick={() => window.location.reload()} className="admin-btn-primary">
            Retry
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="admin-card flex flex-col p-5">
          <p className="text-sm font-medium text-muted-foreground">Total Tables</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{tables.length}</p>
        </div>
        <div className="admin-card flex flex-col p-5">
          <p className="text-sm font-medium text-muted-foreground">Approx. Records</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totalRecords.toLocaleString()}</p>
        </div>
        <div className="admin-card flex flex-col p-5">
          <p className="text-sm font-medium text-muted-foreground">Database Status</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="flex h-3 w-3 rounded-full bg-emerald-500"></span>
            <span className="text-lg font-semibold">Connected</span>
          </div>
        </div>
      </div>

      {/* Table List */}
      <div className="admin-card overflow-hidden">
        <div className="border-b border-border p-4 sm:flex sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Layers size={20} className="text-primary" />
            Database Tables
          </h2>
          <div className="relative mt-3 sm:mt-0 sm:w-64">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search tables..."
              className="w-full rounded-md border border-input bg-background py-1.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 font-medium text-muted-foreground">Table</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Rows (Approx)</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTables.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    No tables match your search.
                  </td>
                </tr>
              ) : (
                filteredTables.map((t) => (
                  <tr key={t.table} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{t.table}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {t.rowEstimate.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/database-health/${t.table}`}
                        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
