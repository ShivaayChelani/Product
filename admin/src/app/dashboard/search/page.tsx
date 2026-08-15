"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { getSearchAnalytics, adminGlobalSearch } from "@/services/searchAdmin";
import { useNotification } from "@/components/Notification";
import StatCard from "@/components/StatCard";

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Search Admin</h1>
        <p className="mt-1 text-sm text-gray-500">Platform search analytics and admin global search</p>
      </div>

      {analytics && (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard title="Total Searches" value={analytics.totalSearches} icon={Search} color="blue" />
          <StatCard title="Failed Searches" value={analytics.failedSearches} icon={Search} color="red" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-4">Popular Keywords</h2>
          <ul className="space-y-2">
            {(analytics?.popularKeywords || []).slice(0, 10).map((k) => (
              <li key={k.keyword} className="flex justify-between text-sm">
                <span className="text-gray-700">{k.keyword}</span>
                <span className="font-semibold text-gray-900">{k.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-4">Failed Keywords</h2>
          <ul className="space-y-2">
            {(analytics?.failedKeywords || []).slice(0, 10).map((k) => (
              <li key={k.keyword} className="flex justify-between text-sm">
                <span className="text-gray-700">{k.keyword}</span>
                <span className="font-semibold text-red-600">{k.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Admin Global Search</h2>
        <div className="flex gap-2 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search places, users, vendors..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
          />
          <button type="button" onClick={runSearch} disabled={searching} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
        {results && (
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div>
              <p className="font-semibold text-gray-900 mb-2">Places ({results.places.length})</p>
              <ul className="space-y-1 text-gray-600">{results.places.slice(0, 8).map((p) => <li key={p.id}>{p.name} — {p.city}</li>)}</ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-2">Users ({results.users.length})</p>
              <ul className="space-y-1 text-gray-600">{results.users.slice(0, 8).map((u) => <li key={u.id}>{u.name || u.email}</li>)}</ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-2">Vendors ({results.vendors.length})</p>
              <ul className="space-y-1 text-gray-600">{results.vendors.slice(0, 8).map((v) => <li key={v.id}>{v.businessName}</li>)}</ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
