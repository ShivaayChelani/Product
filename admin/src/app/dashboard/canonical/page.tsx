"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getCanonicalStatus,
  getDuplicateCandidates,
  dismissDuplicate,
  mergePlaces,
  getVerificationQueue,
  verifyPlace,
  getDashboardMetrics,
  hybridSearchInspect,
  type HybridSearchHit,
  type CanonicalPlatformStatus,
  type DuplicateCandidate,
  type VerificationQueueItem,
  type DashboardMetrics,
} from "@/services/canonical";
import { useNotification } from "@/components/Notification";
import StatusBadge from "@/components/StatusBadge";

type Tab = "overview" | "duplicates" | "verification" | "search";

export default function CanonicalDashboardPage() {
  const { notify } = useNotification();
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<CanonicalPlatformStatus | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [verification, setVerification] = useState<VerificationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<HybridSearchHit[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [mergeBusy, setMergeBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [st, dup, ver, dash] = await Promise.all([
        getCanonicalStatus(),
        getDuplicateCandidates("OPEN"),
        getVerificationQueue(),
        getDashboardMetrics(),
      ]);
      setStatus(st);
      setDuplicates(dup);
      setVerification(ver);
      setMetrics(dash);
    } catch {
      notify("error", "Failed to load canonical dashboard");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleMerge = async (canonicalId: string, duplicateId: string, candidateId: string) => {
    if (!confirm("Merge duplicate into canonical place? This cannot be undone (records are preserved).")) return;
    setMergeBusy(candidateId);
    try {
      await mergePlaces({
        canonicalPlaceId: canonicalId,
        duplicatePlaceIds: [duplicateId],
        reason: "admin_merge_ui",
      });
      notify("success", "Places merged");
      await refresh();
    } catch {
      notify("error", "Merge failed");
    } finally {
      setMergeBusy(null);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismissDuplicate(id);
      notify("success", "Marked as distinct");
      setDuplicates((d) => d.filter((x) => x.id !== id));
    } catch {
      notify("error", "Could not dismiss candidate");
    }
  };

  const handleVerify = async (id: string) => {
    try {
      await verifyPlace(id);
      notify("success", "Verification updated");
      setVerification((v) => v.filter((p) => p.id !== id));
      void getCanonicalStatus().then(setStatus);
    } catch {
      notify("error", "Verification failed");
    }
  };

  const runSearchInspector = async () => {
    if (!searchQ.trim()) return;
    try {
      const hits = await hybridSearchInspect(searchQ.trim(), 20);
      setSearchHits(hits);
    } catch {
      notify("error", "Resolve search failed");
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Quality dashboard" },
    { id: "duplicates", label: "Duplicate queue" },
    { id: "verification", label: "Verification queue" },
    { id: "search", label: "Search inspector" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Canonical data platform</h1>
        <p className="text-slate-400 text-sm mt-1">
          Deduplication, verification, and search resolution for India tourism SSOT.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.id ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !status ? (
        <p className="text-slate-400">Loading…</p>
      ) : null}

      {tab === "overview" && status && metrics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active places" value={status.places.total} />
          <StatCard label="Verified" value={status.places.verified} />
          <StatCard label="Verification coverage %" value={metrics.verification.coveragePercent} />
          <StatCard label="Open duplicate pairs" value={status.duplicateCandidatesOpen} />
          <StatCard label="Image license compliance %" value={metrics.images.compliancePercent} />
          <StatCard label="Boundary failure rate %" value={metrics.boundaries.failureRatePercent} />
          <StatCard label="Search queries (7d)" value={metrics.search.queriesLast7Days} />
          <StatCard label="Embeddings indexed" value={metrics.search.embeddingsIndexed} />
          <div className="md:col-span-2 lg:col-span-4 rounded-xl bg-slate-900/80 border border-slate-700 p-4 text-sm text-slate-300 space-y-1">
            <p>
              <span className="text-slate-500">Boundary validation:</span> {status.boundaryValidation}
            </p>
            <p>
              <span className="text-slate-500">Semantic search:</span> {status.semanticSearch}
            </p>
            <p>
              <span className="text-slate-500">Public API filter:</span> set{" "}
              <code className="text-cyan-400">PLACES_PUBLIC_VERIFIED_ONLY=true</code> in production when verified
              coverage is sufficient.
            </p>
            <p className="pt-2">
              <Link href="/dashboard/places" className="text-cyan-400 hover:underline">
                Places editor
              </Link>
              {" · "}
              <Link href="/dashboard/moderation" className="text-cyan-400 hover:underline">
                Image review
              </Link>
            </p>
          </div>
        </div>
      ) : null}

      {tab === "duplicates" ? (
        <div className="space-y-3">
          {duplicates.length === 0 ? (
            <p className="text-slate-400">No open duplicate candidates. Run nightly duplicate scan job.</p>
          ) : (
            duplicates.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 flex flex-col lg:flex-row lg:items-center gap-4 justify-between"
              >
                <div className="space-y-2 text-sm">
                  <p className="text-cyan-400 font-medium">Confidence {(row.confidenceScore * 100).toFixed(0)}%</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <PlaceMini label="A" place={row.placeA} />
                    <PlaceMini label="B" place={row.placeB} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={mergeBusy === row.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"
                    onClick={() => handleMerge(row.placeA.id, row.placeB.id, row.id)}
                  >
                    Merge B → A
                  </button>
                  <button
                    type="button"
                    disabled={mergeBusy === row.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700/80 text-white text-sm disabled:opacity-50"
                    onClick={() => handleMerge(row.placeB.id, row.placeA.id, row.id)}
                  >
                    Merge A → B
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 text-sm"
                    onClick={() => handleDismiss(row.id)}
                  >
                    Not duplicate
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "verification" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-800 text-slate-400">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Location</th>
                <th className="p-3">Quality</th>
                <th className="p-3">Public ID</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {verification.map((p) => (
                <tr key={p.id} className="border-t border-slate-700">
                  <td className="p-3 text-white">{p.name}</td>
                  <td className="p-3 text-slate-400">
                    {p.city}, {p.state}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={p.dataQuality} />
                  </td>
                  <td className="p-3 font-mono text-xs text-slate-400">{p.publicPlaceId ?? "—"}</td>
                  <td className="p-3">
                    <button
                      type="button"
                      className="text-cyan-400 hover:underline mr-3"
                      onClick={() => handleVerify(p.id)}
                    >
                      Promote to verified
                    </button>
                    <Link href={`/dashboard/places?search=${encodeURIComponent(p.name)}`} className="text-slate-400 hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {verification.length === 0 ? <p className="p-4 text-slate-500">Queue empty.</p> : null}
        </div>
      ) : null}

      {tab === "search" ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Alias, name, or public ID"
              className="flex-1 rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-white"
            />
            <button
              type="button"
              onClick={runSearchInspector}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm"
            >
              Resolve
            </button>
          </div>
          <pre className="text-xs bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-auto text-slate-300 max-h-96">
            {JSON.stringify(searchHits, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-900/80 border border-slate-700 p-4">
      <p className="text-slate-500 text-xs uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-white mt-1">
        {Number.isInteger(value) ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function PlaceMini({
  label,
  place,
}: {
  label: string;
  place: DuplicateCandidate["placeA"];
}) {
  return (
    <div className="rounded-lg bg-slate-950/50 p-3">
      <p className="text-xs text-slate-500">Place {label}</p>
      <p className="text-white font-medium">{place.name}</p>
      <p className="text-slate-400 text-xs">
        {place.city}, {place.state}
      </p>
      <StatusBadge status={place.dataQuality} />
    </div>
  );
}
