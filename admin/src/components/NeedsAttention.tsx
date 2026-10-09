"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Flag, MapPin, RefreshCw, Store } from "lucide-react";
import { getAdminRoleFromStorage, canAccessRoute } from "@/lib/permissions";
import type { AdminRole } from "@/components/PermissionWrapper";
import { getAdminEvents, getEventReports } from "@/services/events";
import { getPlaces } from "@/services/places";
import { getVendors } from "@/services/vendors";
import { getReelReports } from "@/services/reels";

type QueueKey = "events" | "places" | "vendors" | "reports";
type QueueState = Record<QueueKey, { count: number | null; error: string; loading: boolean }>;

const EMPTY_QUEUES: QueueState = {
  events: { count: null, error: "", loading: true },
  places: { count: null, error: "", loading: true },
  vendors: { count: null, error: "", loading: true },
  reports: { count: null, error: "", loading: true },
};

const QUEUES: Array<{
  key: QueueKey;
  label: string;
  href: string;
  icon: typeof CalendarDays;
  description: string;
}> = [
  { key: "events", label: "Pending Events", href: "/dashboard/events?status=PENDING", icon: CalendarDays, description: "Review submitted events" },
  { key: "places", label: "Pending Places", href: "/dashboard/places?status=PENDING&touristOnly=0", icon: MapPin, description: "Review place submissions" },
  { key: "vendors", label: "Pending Vendors", href: "/dashboard/vendors?status=PENDING", icon: Store, description: "Review vendor applications" },
  { key: "reports", label: "Open Reports", href: "/dashboard/reports#event-reports", icon: Flag, description: "Review event and Moment reports" },
];

export default function NeedsAttention() {
  const [queues, setQueues] = useState<QueueState>(EMPTY_QUEUES);
  const [role, setRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    setRole(getAdminRoleFromStorage());
  }, []);

  const refresh = useCallback(async () => {
    if (!role) return;
    const requests: Array<[QueueKey, Promise<number>]> = [];

    if (canAccessRoute(role, "/dashboard/events")) {
      requests.push(["events", getAdminEvents({ status: "PENDING", page: 1, limit: 1 }).then((result) => result.meta.statusCounts.PENDING)]);
    }
    if (canAccessRoute(role, "/dashboard/places")) {
      requests.push(["places", getPlaces({ status: "PENDING", page: 1, limit: 1, touristOnly: false }).then((result) => result.pagination.total)]);
    }
    if (canAccessRoute(role, "/dashboard/vendors")) {
      requests.push(["vendors", getVendors({ status: "PENDING", page: 1, limit: 1 }).then((result) => result.pagination.total)]);
    }
    if (canAccessRoute(role, "/dashboard/reports")) {
      requests.push(["reports", Promise.all([
        getEventReports({ status: "PENDING", page: 1, limit: 1 }),
        getReelReports({ status: "PENDING", page: 1, limit: 1 }),
      ]).then(([events, reels]) => events.pagination.total + reels.pagination.total)]);
    }

    setQueues((current) => Object.fromEntries(
      Object.keys(current).map((key) => [key, { ...current[key as QueueKey], loading: requests.some(([queue]) => queue === key), error: "" }]),
    ) as QueueState);

    const results = await Promise.all(requests.map(async ([key, request]) => {
      try {
        return [key, await request, ""] as const;
      } catch (error) {
        return [key, null, error instanceof Error ? error.message : "Queue count could not be loaded."] as const;
      }
    }));

    setQueues((current) => {
      const next = { ...current };
      for (const [key, count, error] of results) {
        next[key] = { count, error, loading: false };
      }
      return next;
    });
  }, [role]);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const visibleQueues = QUEUES.filter((queue) => canAccessRoute(role ?? undefined, queue.href.split("?")[0]));

  return (
    <section aria-label="Needs Attention" className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Needs Attention</h2>
          <p className="text-sm text-muted-foreground">Live moderation queues</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="admin-btn-secondary" aria-label="Refresh moderation queues">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visibleQueues.map((queue) => {
          const state = queues[queue.key];
          return (
            <Link
              key={queue.key}
              href={queue.href}
              aria-label={`${queue.label}: ${state.count ?? (state.loading ? "loading" : "unavailable")}`}
              title={state.error || undefined}
              className="admin-card flex min-w-0 items-center gap-3 p-4 transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <queue.icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{queue.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {state.error || queue.description}
                </span>
              </span>
              <span className="shrink-0 text-2xl font-bold tabular-nums" aria-live="polite">
                {state.loading ? "…" : state.count === null ? "—" : state.count.toLocaleString()}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
