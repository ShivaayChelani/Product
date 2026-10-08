"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Eye, Flag, MapPin, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useNotification } from "@/components/Notification";
import Drawer from "@/components/ui/Drawer";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { getApiErrorMessage } from "@/services/client";
import {
  approveEvent,
  deleteAdminEvent,
  getAdminEvents,
  getEventDuplicates,
  rejectEvent,
  type AdminEvent,
  type EventLifecycle,
  type EventStatus,
} from "@/services/events";
import { getAdminRoleFromStorage } from "@/lib/permissions";
import { canDeleteAdminEvent, eventDurationDays, eventLifecycle, eventTypeLabel, formatEventDate } from "./eventModeration";

const PAGE_SIZE = 20;
const MODERATION_STATUSES: Array<{ value: EventStatus | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXPIRED", label: "Expired" },
];
const LIFECYCLES: Array<{ value: EventLifecycle; label: string }> = [
  { value: "LIVE", label: "Live" },
  { value: "UPCOMING", label: "Upcoming" },
  { value: "ENDED", label: "Ended" },
];

function EventsWorkspace() {
  const { notify } = useNotification();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusValue = searchParams.get("status")?.toUpperCase();
  const statusParam = statusValue ?? "PENDING";
  const status = (["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"].includes(statusParam)
    ? statusParam
    : statusParam === "ALL" ? "" : "PENDING") as EventStatus | "";
  const lifecycleParam = searchParams.get("lifecycle")?.toUpperCase();
  const lifecycle = LIFECYCLES.some((item) => item.value === lifecycleParam)
    ? lifecycleParam as EventLifecycle
    : undefined;
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [statusCounts, setStatusCounts] = useState<Partial<Record<EventStatus, number>>>({});
  const [lifecycleCounts, setLifecycleCounts] = useState<Record<EventLifecycle, number>>({
    LIVE: 0, UPCOMING: 0, ENDED: 0,
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [city, setCity] = useState(searchParams.get("city") ?? "");
  const [selected, setSelected] = useState<AdminEvent | null>(null);
  const [duplicates, setDuplicates] = useState<Awaited<ReturnType<typeof getEventDuplicates>> | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminEvent | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [canModerateEvents, setCanModerateEvents] = useState(false);
  const requestSequence = useRef(0);
  const deleteInFlight = useRef(false);

  useEffect(() => {
    const role = getAdminRoleFromStorage();
    setCanModerateEvents(role === "ADMIN" || role === "SUPER_ADMIN" || role === "OPS_ADMIN" || role === "CONTENT_MODERATOR");
  }, []);

  const updateFilters = useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if ("status" in updates || "lifecycle" in updates || "q" in updates || "city" in updates) params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const load = useCallback(async () => {
    const current = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await getAdminEvents({
        page,
        limit: PAGE_SIZE,
        status: lifecycle ? "APPROVED" : status || undefined,
        lifecycle,
        q: searchParams.get("q") || undefined,
        city: searchParams.get("city") || undefined,
      });
      if (current !== requestSequence.current) return;
      setEvents(result.data);
      setStatusCounts(result.meta.statusCounts);
      setLifecycleCounts(result.meta.lifecycleCounts);
      setTotal(result.pagination.total);
      setTotalPages(Math.max(1, result.pagination.totalPages));
    } catch (err) {
      if (current !== requestSequence.current) return;
      setEvents([]);
      setError(getApiErrorMessage(err, "Could not load events."));
    } finally {
      if (current === requestSequence.current) setLoading(false);
    }
  }, [lifecycle, page, searchParams, status]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
    setCity(searchParams.get("city") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query !== (searchParams.get("q") ?? "") || city !== (searchParams.get("city") ?? "")) {
        updateFilters({ q: query.trim() || undefined, city: city.trim() || undefined });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [city, query, searchParams, updateFilters]);

  const openReview = async (event: AdminEvent) => {
    setSelected(event);
    setDuplicates(null);
    if (!canModerateEvents || !event.hasCoordinates) return;
    setDuplicateLoading(true);
    try {
      setDuplicates(await getEventDuplicates(event.id));
    } catch (err) {
      notify("error", getApiErrorMessage(err, "Unable to load duplicate review."));
    } finally {
      setDuplicateLoading(false);
    }
  };

  const performApproval = async (force = false) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await approveEvent(selected.id, force);
      notify("success", "Event approved and published.");
      setConfirmApprove(false);
      setSelected(null);
      await load();
    } catch (err) {
      notify("error", getApiErrorMessage(err, "Could not approve this event."));
    } finally {
      setActionLoading(false);
    }
  };

  const performRejection = async () => {
    if (!selected || reason.trim().length < 3) return;
    setActionLoading(true);
    try {
      await rejectEvent(selected.id, reason.trim());
      notify("success", "Event rejected.");
      setRejectOpen(false);
      setReason("");
      setSelected(null);
      await load();
    } catch (err) {
      notify("error", getApiErrorMessage(err, "Could not reject this event."));
    } finally {
      setActionLoading(false);
    }
  };

  const performDelete = async () => {
    if (!deleteTarget || deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleteLoading(true);
    try {
      await deleteAdminEvent(deleteTarget.id);
      notify("success", "Event removed from active listings.");
      setDeleteTarget(null);
      if (selected?.id === deleteTarget.id) setSelected(null);
      await load();
    } catch (err) {
      notify("error", getApiErrorMessage(err, "Could not remove this event."));
    } finally {
      deleteInFlight.current = false;
      setDeleteLoading(false);
    }
  };

  const activeFilter = lifecycle ? `APPROVED:${lifecycle}` : status || "ALL";
  const eventRows = useMemo(() => events.map((event) => ({
    event,
    lifecycle: eventLifecycle(event),
  })), [events]);

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="Events"
        description="Review submitted community events and manage approved event lifecycle."
        icon={CalendarDays}
        actions={
          <>
            <span className="text-sm text-muted-foreground">{total.toLocaleString()} events</span>
            <button type="button" className="admin-btn-secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </>
        }
      />

      <section aria-label="Event moderation filters" className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {MODERATION_STATUSES.map((item) => {
            const count = item.value ? statusCounts[item.value] ?? 0 : Object.values(statusCounts).reduce((sum, value) => sum + (value ?? 0), 0);
            const active = !lifecycle && (activeFilter === (item.value || "ALL"));
            return (
              <button
                key={item.label}
                type="button"
                aria-pressed={active}
                onClick={() => updateFilters({ status: item.value || "ALL", lifecycle: undefined })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
              >
                {item.label} <span className="tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Approved event lifecycle filters">
          {LIFECYCLES.map((item) => {
            const active = lifecycle === item.value;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => updateFilters({ status: "APPROVED", lifecycle: active ? undefined : item.value })}
                className={`rounded-lg border px-3 py-2 text-sm ${active ? "border-blue-600 bg-blue-50 text-blue-800" : "border-border hover:bg-muted"}`}
              >
                {item.label} <span className="tabular-nums">({lifecycleCounts[item.value]})</span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="relative block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search event title or description</span>
            <input className="admin-input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or description" />
          </label>
          <label>
            <span className="sr-only">Filter by city</span>
            <input className="admin-input" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Filter by city" />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Events queue">
        {loading ? (
          <div role="status" className="p-8 text-center text-sm text-muted-foreground">Loading events…</div>
        ) : error ? (
          <div role="alert" className="space-y-3 p-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" className="admin-btn-secondary" onClick={() => void load()}><RefreshCw size={15} /> Retry</button>
          </div>
        ) : events.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarDays className="mx-auto mb-3 text-muted-foreground" size={28} />
            <h2 className="font-semibold">No events match this queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">Try another moderation status, lifecycle, or search.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Vendor / Place</th>
                    <th className="px-4 py-3">Schedule</th>
                    <th className="px-4 py-3">Lifecycle</th>
                    <th className="px-4 py-3">Moderation</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {eventRows.map(({ event, lifecycle: derivedLifecycle }) => (
                    <tr key={event.id} className="align-top hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex min-w-[220px] items-start gap-3">
                          {event.coverImage ? (
                            <Image src={event.coverImage} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded-lg object-cover" />
                          ) : <div className="h-14 w-14 rounded-lg bg-muted" aria-hidden="true" />}
                          <div className="min-w-0">
                            <p className="font-semibold">{event.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{eventTypeLabel(event.eventType)}</p>
                            {event.createdBy && <p className="mt-1 text-xs text-muted-foreground">By {event.createdBy.name}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{[event.city, event.state].filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-4 py-3">{event.vendorName || "—"}<div className="text-xs text-muted-foreground">{event.placeName || "—"}</div></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatEventDate(event.startDate)} – {formatEventDate(event.endDate)}
                        <div className="text-xs text-muted-foreground">{eventDurationDays(event.startDate, event.endDate) ?? "—"} days</div>
                      </td>
                      <td className="px-4 py-3">{derivedLifecycle ? <StatusBadge status={derivedLifecycle} /> : "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={event.status} /></td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatEventDate(event.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button type="button" aria-label={`Review ${event.title}`} className="admin-btn-secondary whitespace-nowrap" onClick={() => void openReview(event)}>
                            <Eye size={15} /> Review
                          </button>
                          {canModerateEvents && canDeleteAdminEvent(event) && (
                            <button
                              type="button"
                              aria-label={`Delete ${event.title}`}
                              className="admin-btn-secondary whitespace-nowrap text-destructive"
                              onClick={() => setDeleteTarget(event)}
                            >
                              <Trash2 size={15} /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} results</p>
              <div className="flex gap-2">
                <button type="button" className="admin-btn-secondary" disabled={page <= 1 || loading} onClick={() => updateFilters({ page: String(page - 1) })}><ChevronLeft size={16} /> Previous</button>
                <button type="button" className="admin-btn-secondary" disabled={page >= totalPages || loading} onClick={() => updateFilters({ page: String(page + 1) })}>Next <ChevronRight size={16} /></button>
              </div>
            </div>
          </>
        )}
      </section>

      <Drawer open={!!selected} onClose={() => { setSelected(null); setRejectOpen(false); setConfirmApprove(false); }} title={selected?.title ?? "Event review"} width="max-w-3xl">
        {selected && (
          <div className="space-y-5">
            {(selected.coverImage || selected.images.length > 0) && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[selected.coverImage, ...selected.images].filter((src): src is string => !!src).map((src, index) => (
                  <Image key={`${src}-${index}`} src={src} alt={`${selected.title} image ${index + 1}`} width={480} height={240} unoptimized className="h-32 w-full rounded-lg object-cover" />
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              {eventLifecycle(selected) && <StatusBadge status={eventLifecycle(selected)!} />}
              <span className="text-sm text-muted-foreground">{eventTypeLabel(selected.eventType)}</span>
            </div>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{selected.description?.trim() || "No description provided."}</p>
            </section>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Detail label="Start date">{formatEventDate(selected.startDate)}</Detail>
              <Detail label="End date">{formatEventDate(selected.endDate)}</Detail>
              <Detail label="Duration">{eventDurationDays(selected.startDate, selected.endDate) ?? "—"} days</Detail>
              <Detail label="Start time">{selected.startTime || "Not specified"}</Detail>
              <Detail label="End time">{selected.endTime || "Not specified"}</Detail>
              <Detail label="Address">{selected.address || "—"}</Detail>
              <Detail label="City">{selected.city || "—"}</Detail>
              <Detail label="State">{selected.state || "—"}</Detail>
              <Detail label="Latitude">{selected.hasCoordinates ? String(selected.latitude) : "—"}</Detail>
              <Detail label="Longitude">{selected.hasCoordinates ? String(selected.longitude) : "—"}</Detail>
              <Detail label="Creator">{selected.createdBy?.name || "Unattributed"}</Detail>
              <Detail label="Vendor">{selected.vendorName || "—"}</Detail>
              <Detail label="Linked place">{selected.placeName || "—"}</Detail>
              <Detail label="Submitted">{formatEventDate(selected.createdAt)}</Detail>
              <Detail label="Approved">{selected.approvedAt ? formatEventDate(selected.approvedAt) : "—"}</Detail>
              <Detail label="Approved by">{selected.approvedBy?.name || "—"}</Detail>
              <Detail label="Rejection reason">{selected.rejectionReason || "—"}</Detail>
              <Detail label="Cancellation reason">{selected.cancellationReason || "—"}</Detail>
            </dl>
            {selected.hasCoordinates && (
              <section aria-label="Event map preview" className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Map / location</h3>
                <iframe title={`Map location for ${selected.title}`} src={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}&output=embed`} loading="lazy" className="h-48 w-full rounded-lg border border-border" />
                <a className="inline-flex items-center gap-2 text-sm text-primary hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`} target="_blank" rel="noreferrer"><MapPin size={14} /> Open exact location in maps</a>
              </section>
            )}
            {selected.status === "PENDING" && canModerateEvents && (
              <section className="space-y-3 border-t border-border pt-4">
                <h3 className="font-semibold">Moderation decision</h3>
                {duplicateLoading && <p role="status" className="text-sm text-muted-foreground">Checking for similar events…</p>}
                {duplicates && duplicates.candidates.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-semibold">Possible duplicate events</p>
                    <ul className="mt-2 list-disc pl-5">
                      {duplicates.candidates.map((candidate) => <li key={candidate.id}>{candidate.title} · {candidate.distanceMeters} m away</li>)}
                    </ul>
                    <p className="mt-2">Standard approval is blocked unless a Content Ops user explicitly approves this as a new event.</p>
                  </div>
                )}
                {!selected.hasCoordinates && <p role="alert" className="text-sm text-destructive">Approval is unavailable because this event has no valid coordinates.</p>}
                {duplicates?.unavailable === "no-valid-coordinates" && <p role="alert" className="text-sm text-destructive">Duplicate checks are unavailable because this event has no valid coordinates.</p>}
                <div className="flex flex-wrap gap-2">
                  {(selected.status === "PENDING") && (
                    duplicates?.candidates.length
                      ? <button type="button" className="admin-btn-primary" disabled={actionLoading} onClick={() => setConfirmApprove(true)}><Check size={16} /> Approve as New Event</button>
                      : <button type="button" className="admin-btn-primary" disabled={actionLoading || duplicateLoading || !selected.hasCoordinates} onClick={() => setConfirmApprove(true)}><Check size={16} /> Approve Event</button>
                  )}
                  <button type="button" className="admin-btn-secondary" disabled={actionLoading} onClick={() => { setReason(""); setRejectOpen(true); }}><Flag size={16} /> Reject Event</button>
                </div>
              </section>
            )}
            {confirmApprove && (
              <div role="dialog" aria-modal="true" aria-labelledby="approve-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-2xl">
                  <h3 id="approve-title" className="text-lg font-semibold">Confirm event approval</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {duplicates?.candidates.length
                      ? `Explicitly approve “${selected.title}” as a new event despite the possible duplicate matches?`
                      : `Publish “${selected.title}” after backend coordinate and duplicate checks?`}
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className="admin-btn-secondary" disabled={actionLoading} onClick={() => setConfirmApprove(false)}>Cancel</button>
                    <button type="button" className="admin-btn-primary" disabled={actionLoading} onClick={() => void performApproval(Boolean(duplicates?.candidates.length))}>{actionLoading ? "Approving…" : "Confirm approval"}</button>
                  </div>
                </div>
              </div>
            )}
            {rejectOpen && (
              <div role="dialog" aria-modal="true" aria-labelledby="reject-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <h3 id="reject-title" className="text-lg font-semibold">Reject Event</h3>
                    <button type="button" aria-label="Close rejection dialog" onClick={() => setRejectOpen(false)}><X size={18} /></button>
                  </div>
                  <label htmlFor="event-rejection-reason" className="mt-4 block text-sm font-medium">Reason (required)</label>
                  <textarea id="event-rejection-reason" className="admin-input mt-2 min-h-28 w-full" minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what needs to change (3–500 characters)." />
                  <p className="mt-1 text-xs text-muted-foreground">{reason.trim().length}/500 characters</p>
                  <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className="admin-btn-secondary" disabled={actionLoading} onClick={() => setRejectOpen(false)}>Cancel</button>
                    <button type="button" className="admin-btn-primary" disabled={actionLoading || reason.trim().length < 3 || reason.trim().length > 500} onClick={() => void performRejection()}>{actionLoading ? "Rejecting…" : "Confirm rejection"}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
      {deleteTarget && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-event-title" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-2xl">
            <h2 id="delete-event-title" className="text-lg font-semibold">Delete Event?</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Detail label="Event">{deleteTarget.title}</Detail>
              <Detail label="Date">{formatEventDate(deleteTarget.startDate)} – {formatEventDate(deleteTarget.endDate)}</Detail>
              <Detail label="Status">{deleteTarget.status}</Detail>
              <Detail label="City / location">{[deleteTarget.address, deleteTarget.city, deleteTarget.state].filter(Boolean).join(", ") || "—"}</Detail>
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">This Event will be removed from active PalSafar listings. Historical itinerary records will be preserved.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="admin-btn-secondary" disabled={deleteLoading} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="admin-btn-primary" disabled={deleteLoading} onClick={() => void performDelete()}>{deleteLoading ? "Deleting…" : "Delete Event"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{children}</dd></div>;
}

export default function EventsPage() {
  return <Suspense fallback={<div role="status" className="p-8 text-center text-sm text-muted-foreground">Loading event moderation…</div>}><EventsWorkspace /></Suspense>;
}
