"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Globe,
  MapPin,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { getAdminTripById, deleteTrip } from "@/services/trips";
import { useNotification } from "@/components/Notification";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { notify } = useNotification();
  const tripId = params.id as string;

  const [trip, setTrip] = useState<Awaited<ReturnType<typeof getAdminTripById>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetchTrip = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminTripById(tripId);
      setTrip(data);
    } catch {
      notify("error", "Failed to load trip");
      setTrip(null);
    } finally {
      setLoading(false);
    }
  }, [tripId, notify]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteTrip(tripId);
      notify("success", "Trip deleted");
      router.push("/dashboard/trips");
    } catch {
      notify("error", "Failed to delete trip");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="text-center py-24">
        <p className="text-gray-500 mb-4">Trip not found</p>
        <Link href="/dashboard/trips" className="text-emerald-600 font-medium hover:underline">
          Back to Trips
        </Link>
      </div>
    );
  }

  const totalStops =
    trip.tripDays?.reduce((sum, day) => sum + (day.stops?.length || 0), 0) ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link
            href="/dashboard/trips"
            className="mt-1 rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{trip.title}</h1>
              <StatusBadge status={trip.status} />
            </div>
            {trip.destination && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                <Globe size={14} />
                {trip.destination}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={deleting}
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
        >
          <Trash2 size={16} />
          Delete Trip
        </button>
      </div>

      {trip.coverImage && (
        <div className="overflow-hidden rounded-xl border border-gray-100 shadow-sm">
          <img src={trip.coverImage} alt="" className="h-48 w-full object-cover" />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Owner</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <User size={14} className="text-gray-400" />
            {trip.user?.name || "—"}
          </p>
          <p className="text-xs text-gray-400">{trip.user?.email}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Duration</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{trip.days} days</p>
          <p className="text-xs text-gray-400">{totalStops} stops</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Dates</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-700">
            <Calendar size={14} className="text-gray-400" />
            {trip.startDate
              ? new Date(trip.startDate).toLocaleDateString()
              : "—"}
            {trip.endDate ? ` → ${new Date(trip.endDate).toLocaleDateString()}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Collaborators</p>
          <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-gray-900">
            <Users size={16} className="text-gray-400" />
            {trip.collaborators?.length ?? trip._count?.collaborators ?? 0}
          </p>
        </div>
      </div>

      {trip.description && (
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Description</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{trip.description}</p>
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-bold text-gray-900">Itinerary</h2>
        </div>
        {!trip.tripDays?.length ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No days planned yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {trip.tripDays.map((day) => (
              <div key={day.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Day {day.dayNumber}
                    {day.date && (
                      <span className="ml-2 font-normal text-gray-400">
                        {new Date(day.date).toLocaleDateString()}
                      </span>
                    )}
                  </h3>
                  <span className="text-xs text-gray-400">
                    {day.stops?.length || 0} stops
                  </span>
                </div>
                {!day.stops?.length ? (
                  <p className="text-xs text-gray-400">No stops</p>
                ) : (
                  <ul className="space-y-2">
                    {day.stops.map((stop, idx) => (
                      <li
                        key={stop.id}
                        className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                          {idx + 1}
                        </span>
                        {stop.place?.thumbnail || stop.place?.images?.[0] ? (
                          <img
                            src={stop.place.thumbnail || stop.place.images?.[0]}
                            alt=""
                            className="h-8 w-8 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-200">
                            <MapPin size={14} className="text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {stop.place?.name || "Custom stop"}
                          </p>
                          {stop.place?.city && (
                            <p className="text-xs text-gray-400">
                              {stop.place.city}
                              {stop.place.state ? `, ${stop.place.state}` : ""}
                            </p>
                          )}
                        </div>
                        {stop.status && (
                          <StatusBadge status={stop.status} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Trip"
        message={`Permanently delete "${trip.title}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
