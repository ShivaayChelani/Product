"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Flag, RefreshCw } from "lucide-react";
import { useNotification } from "@/components/Notification";
import { getApiErrorMessage } from "@/services/client";
import { getEventReports, resolveEventReport, type AdminEventReport } from "@/services/events";

const PAGE_SIZE = 10;

export default function EventReportQueue() {
  const { notify } = useNotification();
  const [reports, setReports] = useState<AdminEventReport[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolvingId, setResolvingId] = useState("");
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await getEventReports({ status: "PENDING", page, limit: PAGE_SIZE });
      if (current !== requestSequence.current) return;
      setReports(result.data);
      setTotal(result.pagination.total);
      setTotalPages(Math.max(1, result.pagination.totalPages));
    } catch (err) {
      if (current !== requestSequence.current) return;
      setError(getApiErrorMessage(err, "Could not load event reports."));
      setReports([]);
    } finally {
      if (current === requestSequence.current) setLoading(false);
    }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  const resolve = async (report: AdminEventReport) => {
    setResolvingId(report.id);
    try {
      await resolveEventReport(report.id);
      notify("success", "Event report resolved.");
      if (reports.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (err) {
      notify("error", getApiErrorMessage(err, "Could not resolve this report."));
    } finally {
      setResolvingId("");
    }
  };

  return (
    <section id="event-reports" aria-labelledby="event-reports-title" className="scroll-mt-6 space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-amber-100 p-2 text-amber-700"><Flag size={18} /></span>
          <div>
            <h2 id="event-reports-title" className="font-bold">Event Reports</h2>
            <p className="text-xs text-muted-foreground">{total.toLocaleString()} pending reports</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="admin-btn-secondary">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="font-semibold underline">Retry</button>
        </div>
      )}
      {loading && <p role="status" className="py-6 text-center text-sm text-muted-foreground">Loading event reports…</p>}
      {!loading && !error && reports.length === 0 && (
        <p className="rounded-lg bg-muted/40 p-6 text-center text-sm text-muted-foreground">No pending event reports.</p>
      )}

      {!loading && !error && reports.length > 0 && (
        <>
          <div className="space-y-3">
            {reports.map((report) => (
              <article key={report.id} className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-start">
                {report.event?.coverImage && (
                  <Image
                    src={report.event.coverImage}
                    alt=""
                    width={112}
                    height={80}
                    unoptimized
                    className="h-20 w-full rounded-md object-cover sm:w-28"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="font-semibold">{report.event?.title ?? "Event unavailable"}</h3>
                  <p className="text-xs text-muted-foreground">
                    {report.event ? `${report.event.city}, ${report.event.state} · ${report.event.status} · ${new Date(report.event.startDate).toLocaleDateString()}–${new Date(report.event.endDate).toLocaleDateString()}` : "The reported event may have been removed."}
                  </p>
                  <p className="text-sm"><span className="font-medium">Reason:</span> {report.reason.replace(/_/g, " ")}</p>
                  {report.details && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{report.details}</p>}
                  <p className="text-xs text-muted-foreground">
                    Reported by {report.user?.name ?? "Unknown user"} · {new Date(report.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void resolve(report)}
                  disabled={Boolean(resolvingId)}
                  className="admin-btn-primary shrink-0 disabled:opacity-50"
                >
                  <Check size={15} /> {resolvingId === report.id ? "Resolving…" : "Mark resolved"}
                </button>
              </article>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button type="button" className="admin-btn-secondary" aria-label="Previous reports page" disabled={page <= 1 || loading || Boolean(resolvingId)} onClick={() => setPage((value) => value - 1)}>
                <ChevronLeft size={16} /> Previous
              </button>
              <button type="button" className="admin-btn-secondary" aria-label="Next reports page" disabled={page >= totalPages || loading || Boolean(resolvingId)} onClick={() => setPage((value) => value + 1)}>
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
