"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Globe, Edit, Trash2, Star, MapPin, Store, Clock, History,
  EyeOff, Sparkles, ExternalLink,
} from "lucide-react";
import Drawer from "@/components/ui/Drawer";
import StatusBadge from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  getPlace, getPlaceReviews, getPlaceNearbyVendors, getPlaces,
  rejectPlace, updatePlace, deletePlace,
} from "@/services/places";
import { getAuditLogs } from "@/services/audit";
import type { Place } from "@/types";
import type { AuditLog } from "@/types";

type Props = {
  placeId: string | null;
  onClose: () => void;
  onEdit: (place: Place) => void;
  onRefresh: () => void;
  notify: (type: "success" | "error", msg: string) => void;
};

export default function PlaceDetailDrawer({ placeId, onClose, onEdit, onRefresh, notify }: Props) {
  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<unknown[]>([]);
  const [vendors, setVendors] = useState<unknown[]>([]);
  const [nearby, setNearby] = useState<Place[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!placeId) {
      setPlace(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [detail, reviewRes, vendorRes, auditRes] = await Promise.all([
          getPlace(placeId),
          getPlaceReviews(placeId).catch(() => ({ data: [] })),
          getPlaceNearbyVendors(placeId).catch(() => ({ data: [] })),
          getAuditLogs({ entityId: placeId, limit: 10 }).catch(() => ({ data: [] as AuditLog[] })),
        ]);
        if (cancelled) return;
        setPlace(detail);
        setReviews(Array.isArray(reviewRes.data) ? reviewRes.data : []);
        setVendors(Array.isArray(vendorRes.data) ? vendorRes.data : []);
        setAuditLogs(auditRes.data ?? []);

        if (detail.city) {
          const nearRes = await getPlaces({
            city: detail.city,
            state: detail.state,
            limit: 6,
            touristOnly: true,
          }).catch(() => ({ data: [] as Place[] }));
          if (!cancelled) {
            setNearby(nearRes.data.filter((p) => p.id !== placeId).slice(0, 5));
          }
        }
      } catch {
        if (!cancelled) notify("error", "Failed to load place details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [placeId, notify]);

  const handleFeature = async () => {
    if (!place) return;
    setActionLoading(true);
    try {
      await updatePlace(place.id, { editorialPriority: 5 });
      notify("success", "Place featured");
      onRefresh();
      setPlace({ ...place, editorialPriority: 5 });
    } catch {
      notify("error", "Failed to feature place");
    } finally {
      setActionLoading(false);
    }
  };

  const handleHide = async () => {
    if (!place) return;
    setActionLoading(true);
    try {
      await rejectPlace(place.id);
      notify("success", "Place hidden (rejected)");
      onRefresh();
      onClose();
    } catch {
      notify("error", "Failed to hide place");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!place || !confirm("Delete this place permanently?")) return;
    setActionLoading(true);
    try {
      await deletePlace(place.id);
      notify("success", "Place deleted");
      onRefresh();
      onClose();
    } catch {
      notify("error", "Failed to delete place");
    } finally {
      setActionLoading(false);
    }
  };

  const historyText = (place as Place & { history?: string })?.history;

  return (
    <Drawer
      open={!!placeId}
      onClose={onClose}
      title={place?.name ?? "Place details"}
      width="max-w-2xl"
    >
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : place ? (
        <div className="space-y-6">
          {(place.images?.[0] || place.thumbnail) && (
            <img
              src={place.images?.[0] || place.thumbnail}
              alt={place.name}
              className="h-52 w-full rounded-xl object-cover"
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Category</p>
              <p className="capitalize">{place.category?.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Status</p>
              <StatusBadge status={place.status} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Rating</p>
              <p className="flex items-center gap-1">
                <Star size={14} className="text-amber-500" />
                {place.rating?.toFixed(1) ?? "—"} ({place.reviewCount ?? 0} reviews)
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Location</p>
              <p>{[place.city, place.state].filter(Boolean).join(", ") || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Coordinates</p>
              <a
                href={`https://www.google.com/maps?q=${place.latitude},${place.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline"
              >
                <Globe size={14} />
                {Number(place.latitude).toFixed(5)}, {Number(place.longitude).toFixed(5)}
              </a>
            </div>
          </div>

          {place.latitude && place.longitude && (
            <div className="overflow-hidden rounded-xl border border-border">
              <iframe
                title={`Map of ${place.name}`}
                className="h-40 w-full"
                loading="lazy"
                src={`https://maps.google.com/maps?q=${place.latitude},${place.longitude}&z=14&output=embed`}
              />
            </div>
          )}

          {place.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Description</p>
              <p className="text-sm leading-relaxed">{place.description}</p>
            </div>
          )}

          {historyText && (
            <div>
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <History size={12} /> History
              </p>
              <p className="text-sm leading-relaxed">{historyText}</p>
            </div>
          )}

          {place.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {place.tags.map((t) => (
                <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{t}</span>
              ))}
            </div>
          )}

          {reviews.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Reviews</h3>
              <ul className="space-y-2">
                {(reviews as { rating?: number; content?: string; user?: { name?: string } }[]).slice(0, 5).map((r, i) => (
                  <li key={i} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">{r.user?.name ?? "User"} · {r.rating ?? "—"}★</p>
                    <p className="mt-1 text-muted-foreground">{r.content ?? ""}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {vendors.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
                <Store size={14} /> Nearby Vendors
              </h3>
              <ul className="space-y-1 text-sm">
                {(vendors as { businessName?: string; name?: string; distance?: number }[]).slice(0, 5).map((v, i) => (
                  <li key={i} className="text-muted-foreground">
                    {v.businessName ?? v.name ?? "Vendor"}
                    {v.distance != null && ` · ${Math.round(v.distance)}m`}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {nearby.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
                <MapPin size={14} /> Nearby Places
              </h3>
              <ul className="space-y-1 text-sm">
                {nearby.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="text-emerald-600 hover:underline"
                      onClick={() => window.dispatchEvent(new CustomEvent("places:open-detail", { detail: p.id }))}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {auditLogs.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
                <Clock size={14} /> Audit Log
              </h3>
              <ul className="space-y-2 text-xs">
                {auditLogs.map((log) => (
                  <li key={log.id} className="rounded-lg bg-muted/50 p-2">
                    <span className="font-medium">{log.action}</span>
                    <span className="text-muted-foreground"> · {new Date(log.createdAt).toLocaleString()}</span>
                    {log.actor?.name && <span className="text-muted-foreground"> · {log.actor.name}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <button type="button" onClick={() => onEdit(place)} className="admin-btn-primary">
              <Edit size={16} /> Edit
            </button>
            <button type="button" disabled={actionLoading} onClick={handleFeature} className="admin-btn-secondary">
              <Sparkles size={16} /> Feature
            </button>
            <button type="button" disabled={actionLoading} onClick={handleHide} className="admin-btn-secondary">
              <EyeOff size={16} /> Hide
            </button>
            <a
              href={`https://www.google.com/maps?q=${place.latitude},${place.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-btn-secondary"
            >
              <ExternalLink size={16} /> View on Map
            </a>
            <button type="button" disabled={actionLoading} onClick={handleDelete} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
              <Trash2 size={16} className="inline" /> Delete
            </button>
            <Link href="/dashboard/canonical" className="admin-btn-secondary">Merge Duplicates</Link>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Place not found.</p>
      )}
    </Drawer>
  );
}
