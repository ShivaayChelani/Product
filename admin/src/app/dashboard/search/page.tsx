"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { getSearchAnalytics, adminGlobalSearch } from "@/services/searchAdmin";
import { useNotification } from "@/components/Notification";
import StatCard from "@/components/StatCard";
import PageHeader from "@/components/ui/PageHeader";

export default function SearchAdminPage() {
  const { notify } = useNotification();
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getSearchAnalytics>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof adminGlobalSearch>> | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    getSearchAnalytics()
      .then(setAnalytics)
      .catch(() => notify("error", "Failed to load search analytics"))
      .finally(() => setLoading(false));
  }, [notify]);

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await adminGlobalSearch(query.trim());
      setResults(res);
    } catch {
      notify("error", "Search failed");
      setResults(null);
    } finally {
      setSearching(false);
    }
  }, [query, notify]);

  if (loading) {
    return <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search Admin"
        description="Platform search analytics and admin global search"
        icon={Search}
      />

      {analytics && (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard title="Total Searches" value={analytics.totalSearches} icon={Search} color="blue" />
          <StatCard title="Failed Searches" value={analytics.failedSearches} icon={Search} color="red" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="admin-card p-5">
          <h2 className="mb-4 text-sm font-bold text-foreground">Popular Keywords</h2>
          <ul className="space-y-2">
            {(analytics?.popularKeywords || []).slice(0, 10).map((k) => (
              <li key={k.keyword} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{k.keyword}</span>
                <span className="font-semibold text-foreground">{k.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="admin-card p-5">
          <h2 className="mb-4 text-sm font-bold text-foreground">Failed Keywords</h2>
          <ul className="space-y-2">
            {(analytics?.failedKeywords || []).slice(0, 10).map((k) => (
              <li key={k.keyword} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{k.keyword}</span>
                <span className="font-semibold text-red-600">{k.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="admin-card p-5">
        <h2 className="mb-4 text-sm font-bold text-foreground">Admin Global Search</h2>
        <div className="mb-4 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search places, users, vendors..."
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <button type="button" onClick={runSearch} disabled={searching} className="admin-btn-primary">
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
        {results && (
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div>
              <p className="mb-2 font-semibold text-foreground">Places ({results.places.length})</p>
              <ul className="space-y-1">
                {results.places.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <Link href={`/dashboard/places?id=${p.id}`} className="text-primary hover:underline">
                      {p.name}{p.city ? ` — ${p.city}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 font-semibold text-foreground">Users ({results.users.length})</p>
              <ul className="space-y-1">
                {results.users.slice(0, 8).map((u) => (
                  <li key={u.id}>
                    <Link href={`/dashboard/users?id=${u.id}`} className="text-primary hover:underline">
                      {u.name || u.email}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 font-semibold text-foreground">Vendors ({results.vendors.length})</p>
              <ul className="space-y-1">
                {results.vendors.slice(0, 8).map((v) => (
                  <li key={v.id}>
                    <Link href={`/dashboard/vendors/${v.id}`} className="text-primary hover:underline">
                      {v.businessName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
