"use client";

import { useState, useRef, useEffect } from "react";
import { X, MapPin } from "lucide-react";
import { createPlace, updatePlace, uploadImage } from "@/services/places";
import type { Place, PlaceFormData } from "@/types";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

function assetUrl(asset: string | { src: string }): string {
  return typeof asset === "string" ? asset : asset.src;
}

const placeMarkerIcon = L.icon({
  iconUrl: assetUrl(markerIcon),
  iconRetinaUrl: assetUrl(markerIcon2x),
  shadowUrl: assetUrl(markerShadow),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Icon.Default.mergeOptions({
  iconRetinaUrl: assetUrl(markerIcon2x),
  iconUrl: assetUrl(markerIcon),
  shadowUrl: assetUrl(markerShadow),
});

const ALL_INDIAN_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Ahmedabad", "Chennai",
  "Kolkata", "Pune", "Jaipur", "Lucknow", "Surat", "Varanasi",
  "Agra", "Udaipur", "Goa", "Shimla", "Manali", "Rishikesh",
  "Amritsar", "Jodhpur", "Bikaner", "Mysore", "Kochi", "Trivandrum",
  "Bhubaneswar", "Guwahati", "Chandigarh", "Nagpur", "Indore", "Bhopal",
  "Patna", "Ranchi", "Raipur", "Dehradun", "Haridwar", "Mathura",
  "Gwalior", "Khajuraho", "Hampi", "Madurai", "Rameswaram", "Kanyakumari",
  "Pondicherry", "Darjeeling", "Gangtok", "Leh", "Srinagar", "Jammu",
  "Ajanta", "Ellora", "Mahabalipuram", "Konark", "Puri", "Jaisalmer",
  "Mount Abu", "Pachmarhi", "Shillong", "Tawang", "Ziro", "Kaziranga",
  "Munnar", "Ooty", "Kodaikanal", "Coorg", "Chikmagalur", "Wayanad",
  "Alleppey", "Kumarakom", "Lonavala", "Mahabaleshwar", "Matheran",
  "Panaji", "Calangute", "Diu", "Mandarmoni", "Digha", "Gokarna",
  "Tirupati", "Shirdi", "Ajmer", "Pushkar", "Bodh Gaya", "Sarnath",
  "Rishikesh", "Vrindavan", "Dwarka", "Somnath", "Patan", "Modhera",
  "Chittorgarh", "Kumbhalgarh", "Mehrangarh", "Amber", "Fatehpur Sikri",
  "Sanchi", "Sravasti", "Nalanda", "Halebidu", "Belur", "Badami",
  "Pattadakal", "Aihole", "Kanchipuram", "Thanjavur", "Chettinad",
  "Jhansi", "Orchha", "Bandhavgarh", "Kanha", "Ranthambore", "Jim Corbett",
  "Sunderbans", "Gir", "Periyar", "Sariska", "Dudhwa",
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

const categories = [
  "temple", "mosque", "church", "gurudwara", "monument",
  "museum", "park", "lake", "fort", "palace", "beach",
  "waterfall", "trek", "market", "ghat", "other",
];

const DAYS_OF_WEEK = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

type OpeningShift = { open: string; close: string };

const emptyHours = (): Record<string, OpeningShift[]> =>
  Object.fromEntries(DAYS_OF_WEEK.map((d) => [d, [] as OpeningShift[]]));
const allOpen = (): Record<string, boolean> =>
  Object.fromEntries(DAYS_OF_WEEK.map((d) => [d, false]));

function parseTicketPrice(raw: unknown): {
  adult: string;
  child: string;
  foreigner: string;
  isFree: boolean;
  basis: string;
} {
  if (!raw || typeof raw !== "object") {
    return { adult: "", child: "", foreigner: "", isFree: false, basis: "" };
  }
  const tp = raw as { adult?: number; child?: number; foreigner?: number; basis?: string };
  const adult = tp.adult != null && !Number.isNaN(Number(tp.adult)) ? String(tp.adult) : "";
  const child = tp.child != null && !Number.isNaN(Number(tp.child)) ? String(tp.child) : "";
  const foreigner = tp.foreigner != null && !Number.isNaN(Number(tp.foreigner)) ? String(tp.foreigner) : "";
  const isFree = tp.basis === "FREE" ||
    ((adult === "" || Number(adult) === 0) &&
    (child === "" || Number(child) === 0) &&
    (foreigner === "" || Number(foreigner) === 0) &&
    (adult !== "" || child !== "" || foreigner !== ""));
  return { adult, child, foreigner, isFree, basis: tp.basis || "" };
}

function normalizeTimeText(raw: unknown): string {
  return String(raw ?? "").trim();
}

/** Legacy freeform range ("9 AM - 5 PM") -> one window with raw text ends. */
function parseLegacyRange(text: string): OpeningShift | null {
  const parts = text.split(/\s*[-–—]|to\s+/i).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  return { open: parts[0] || "", close: parts[1] || "" };
}

/**
 * Parse ANY stored openingHours shape into a faithful per-day structure.
 * Unlike the previous editor this PRESERVES per-day variation instead of
 * flattening every day to the first day's windows.
 */
function parseOpeningHours(raw: unknown): {
  hoursByDay: Record<string, OpeningShift[]>;
  dayClosed: Record<string, boolean>;
} {
  const hoursByDay = emptyHours();
  const dayClosed = allOpen();
  if (!raw || typeof raw !== "object") return { hoursByDay, dayClosed };
  const obj = raw as Record<string, unknown>;

  for (const day of DAYS_OF_WEEK) {
    const val = obj[day] ?? obj[day.toLowerCase()];
    if (val == null) continue;

    if (Array.isArray(val)) {
      if (val.length === 0) {
        dayClosed[day] = true; // explicit closed marker
        continue;
      }
      hoursByDay[day] = val
        .filter((w): w is Record<string, unknown> => !!w && typeof w === "object")
        .map((w) => ({ open: normalizeTimeText(w.open), close: normalizeTimeText(w.close) }));
    } else if (typeof val === "object") {
      const w = val as Record<string, unknown>;
      hoursByDay[day] = [{ open: normalizeTimeText(w.from ?? w.open), close: normalizeTimeText(w.till ?? w.to ?? w.close) }];
    } else if (typeof val === "string") {
      const text = val.trim();
      if (!text || /^closed$/i.test(text)) {
        dayClosed[day] = true;
      } else {
        const win = parseLegacyRange(text);
        if (win) hoursByDay[day] = [win];
      }
    }
  }
  return { hoursByDay, dayClosed };
}

/**
 * Build the write payload from the per-day editor. Writes EXACTLY what the
 * admin saw — no template copying. Returns undefined only when the place has
 * no schedule information at all (leave stored data untouched).
 */
function buildOpeningHoursPayload(
  hoursByDay: Record<string, OpeningShift[]> | undefined,
  dayClosed: Record<string, boolean> | undefined,
): Record<string, OpeningShift[]> | undefined {
  if (!hoursByDay && !dayClosed) return undefined;
  const payload: Record<string, OpeningShift[]> = {};
  let anyEntry = false;
  for (const day of DAYS_OF_WEEK) {
    const closed = dayClosed?.[day] === true;
    const windows = closed
      ? []
      : (hoursByDay?.[day] || [])
          .map((w) => ({ open: w.open.trim(), close: w.close.trim() }))
          .filter((w) => w.open || w.close);
    payload[day] = windows;
    if (closed || windows.length > 0) anyEntry = true;
  }
  return anyEntry ? payload : undefined;
}

/** Client-side guard mirroring the server's openingHoursWriteSchema rules. */
function validateHours(
  hoursByDay: Record<string, OpeningShift[]> | undefined,
  dayClosed: Record<string, boolean> | undefined,
): string | null {
  for (const day of DAYS_OF_WEEK) {
    if (dayClosed?.[day]) continue;
    const wins = (hoursByDay?.[day] || []).filter((w) => w.open.trim() || w.close.trim());
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      if (!w.open.trim() || !w.close.trim()) {
        return `${day}: window ${i + 1} needs both an opening and a closing time.`;
      }
      const toMin = (t: string): number | null => {
        const m = t.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const min = m[2] ? parseInt(m[2], 10) : 0;
        if (min > 59 || h > 23 || h < 1) return null;
        if (m[3] === "pm" && h < 12) h += 12;
        if (m[3] === "am" && h === 12) h = 0;
        return h * 60 + min;
      };
      const open = toMin(w.open);
      const close = toMin(w.close);
      if (open == null || close == null) {
        return `${day}: window ${i + 1} has invalid times — use formats like 9:00 AM or 17:30.`;
      }
      if (open === close) {
        return `${day}: opening and closing times are identical — tick the day as Closed instead.`;
      }
    }
  }
  return null;
}

const PRIORITY_OPTIONS = [
  { value: 5, label: "5 — Highest Priority" },
  { value: 4, label: "4 — High" },
  { value: 3, label: "3 — Normal" },
  { value: 2, label: "2 — Low" },
  { value: 1, label: "1 — Lowest" },
];

/** How the ticket price should be charged — drives itinerary budget math. */
const FEE_BASIS_OPTIONS = [
  { value: "PER_PERSON", label: "Per person" },
  { value: "PER_VEHICLE", label: "Per vehicle" },
  { value: "PER_GROUP", label: "Per group (once)" },
  { value: "FLAT_RATE", label: "Flat rate (once)" },
  { value: "FREE", label: "Free" },
  { value: "UNKNOWN", label: "Unknown — exclude from budget" },
] as const;

interface Props {
  open: boolean;
  place?: Place | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function PlaceForm({ open, place, onClose, onSaved }: Props) {
  const isEdit = !!place;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [form, setForm] = useState<PlaceFormData>({
    name: "",
    description: "",
    shortDescription: "",
    category: "temple",
    customCategory: "",
    latitude: 20.5937,
    longitude: 78.9629,
    city: "",
    state: "",
    country: "India",
    images: [],
    tags: [],
    editorialPriority: 3,
    bestTimeFrom: "",
    bestTimeTo: "",
    bestTimeMonths: "",
    bestTimeReason: "",
    hoursByDay: emptyHours(),
    dayClosed: allOpen(),
    estimatedDurationMinutes: "",
    ticketAdult: "",
    ticketChild: "",
    ticketForeigner: "",
    ticketBasis: "",
    isFreeEntry: false,
  });
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const mapCenterRef = useRef<{ lat: number; lng: number }>({ lat: 20.5937, lng: 78.9629 });
  mapCenterRef.current = { lat: form.latitude, lng: form.longitude };

  useEffect(() => {
    if (!open) return;
    const existingCategory = place?.category || "temple";
    const isPreset = categories.includes(existingCategory);
    const hours = parseOpeningHours(place?.openingHours);
    const fees = parseTicketPrice(place?.ticketPrice);
    setForm({
      name: place?.name || "",
      description: place?.description || "",
      shortDescription: place?.shortDescription || "",
      category: isPreset ? existingCategory : "other",
      customCategory: isPreset ? "" : existingCategory,
      latitude: place?.latitude ?? 20.5937,
      longitude: place?.longitude ?? 78.9629,
      city: place?.city || "",
      state: place?.state || "",
      country: place?.country || "India",
      images: place?.images ? [...place.images] : [],
      tags: place?.tags ? [...place.tags] : [],
      editorialPriority: place?.editorialPriority ?? 3,
      bestTimeFrom: (place?.bestTimeToVisit as { from?: string })?.from || "",
      bestTimeTo: (place?.bestTimeToVisit as { to?: string })?.to || "",
      bestTimeMonths: (place?.bestTimeToVisit as { bestMonths?: string })?.bestMonths || "",
      bestTimeReason: place?.bestTimeReason || "",
      hoursByDay: hours.hoursByDay,
      dayClosed: hours.dayClosed,
      estimatedDurationMinutes:
        (place as unknown as { estimatedDurationMinutes?: number | null })?.estimatedDurationMinutes != null
          ? String((place as unknown as { estimatedDurationMinutes?: number }).estimatedDurationMinutes)
          : "",
      ticketAdult: fees.adult,
      ticketChild: fees.child,
      ticketForeigner: fees.foreigner,
      ticketBasis: fees.basis,
      isFreeEntry: fees.isFree,
    });
    setError("");
    setTagInput("");
  }, [open, place]);

  useEffect(() => {
    if (searchQuery.length >= 1) {
      const q = searchQuery.toLowerCase();
      const matches = ALL_INDIAN_CITIES.filter(c => c.toLowerCase().includes(q)).slice(0, 8);
      setCitySuggestions(matches);
      setShowCityDropdown(matches.length > 0);
    } else {
      setShowCityDropdown(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (!open || !mapRef.current || leafletMapRef.current) return;

    const { lat, lng } = mapCenterRef.current;
    const map = L.map(mapRef.current, {
      center: [lat, lng],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([lat, lng], {
      draggable: true,
      icon: placeMarkerIcon,
    }).addTo(map);

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      setForm(prev => ({
        ...prev,
        latitude: parseFloat(pos.lat.toFixed(6)),
        longitude: parseFloat(pos.lng.toFixed(6)),
      }));
    });

    leafletMapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      leafletMapRef.current = null;
      markerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (leafletMapRef.current && markerRef.current) {
      markerRef.current.setLatLng([form.latitude, form.longitude]);
      leafletMapRef.current.setView([form.latitude, form.longitude], leafletMapRef.current.getZoom() < 8 ? 8 : leafletMapRef.current.getZoom());
    }
  }, [form.latitude, form.longitude]);

  if (!open) return null;

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !form.tags.includes(t)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, t] }));
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImage(file);
      setForm(prev => ({ ...prev, images: [...prev.images, url] }));
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setError("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setForm(prev => {
      const newImages = [...prev.images];
      newImages.splice(index, 1);
      return { ...prev, images: newImages };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const finalCategory =
        form.category === "other"
          ? (form.customCategory || "").trim()
          : form.category;
      if (!finalCategory) {
        setError("Please enter a category name for Other.");
        setSaving(false);
        return;
      }

      const bestTimeToVisit = form.bestTimeMonths
        ? { bestMonths: form.bestTimeMonths }
        : undefined;

      const hoursError = validateHours(form.hoursByDay, form.dayClosed);
      if (hoursError) {
        setError(hoursError);
        setSaving(false);
        return;
      }

      const openingHours = buildOpeningHoursPayload(form.hoursByDay, form.dayClosed);

      const durationRaw = form.estimatedDurationMinutes?.trim();
      const estimatedDurationMinutes =
        durationRaw && !Number.isNaN(Number(durationRaw)) && Number(durationRaw) > 0
          ? Math.round(Number(durationRaw))
          : undefined;

      const ticketPrice = form.isFreeEntry
        ? { currency: "INR", adult: 0, child: 0, foreigner: 0, basis: "FREE" as const }
        : (() => {
            const adult = form.ticketAdult?.trim() ? Number(form.ticketAdult) : undefined;
            const child = form.ticketChild?.trim() ? Number(form.ticketChild) : undefined;
            const foreigner = form.ticketForeigner?.trim() ? Number(form.ticketForeigner) : undefined;
            // Explicit basis wins; entering amounts without choosing one keeps
            // the historical per-person assumption.
            const basis = (form.ticketBasis || (adult != null || child != null || foreigner != null ? "PER_PERSON" : "")) || undefined;
            if (adult == null && child == null && foreigner == null && !basis) return undefined;
            return {
              currency: "INR",
              ...(basis ? { basis } : {}),
              ...(adult != null && !Number.isNaN(adult) ? { adult } : {}),
              ...(child != null && !Number.isNaN(child) ? { child } : {}),
              ...(foreigner != null && !Number.isNaN(foreigner) ? { foreigner } : {}),
            };
          })();

      const payload = {
        name: form.name,
        description: form.description,
        shortDescription: form.shortDescription || form.description.substring(0, 200),
        category: finalCategory,
        latitude: form.latitude,
        longitude: form.longitude,
        city: form.city,
        state: form.state,
        country: form.country,
        images: form.images,
        tags: form.tags,
        editorialPriority: form.editorialPriority,
        bestTimeToVisit,
        bestTimeReason: form.bestTimeReason || undefined,
        openingHours,
        estimatedDurationMinutes,
        ticketPrice,
      };
      if (isEdit && place) {
        await updatePlace(place.id, payload as Partial<PlaceFormData>);
      } else {
        await createPlace(payload as PlaceFormData);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to save place";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? "Edit Place" : "Add Place"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Name *
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Description *
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  rows={3}
                  required
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Short Description
                </label>
                <textarea
                  value={form.shortDescription}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, shortDescription: e.target.value }))
                  }
                  rows={2}
                  placeholder="Brief one-line description (auto-filled from description if empty)"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      category: e.target.value,
                      customCategory: e.target.value === "other" ? p.customCategory : "",
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
                {form.category === "other" && (
                  <input
                    value={form.customCategory || ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, customCategory: e.target.value }))
                    }
                    placeholder="Write custom category (e.g. Wildlife sanctuary)"
                    required
                    className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Priority (itinerary)
                </label>
                <select
                  value={form.editorialPriority}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, editorialPriority: Number(e.target.value) }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    City *
                  </label>
                  <div className="relative">
                    <input
                      value={form.city}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, city: e.target.value }));
                        setSearchQuery(e.target.value);
                      }}
                      onFocus={() => {
                        if (citySuggestions.length > 0) setShowCityDropdown(true);
                      }}
                      onBlur={() => setTimeout(() => setShowCityDropdown(false), 200)}
                      placeholder="Search city..."
                      required
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                    {showCityDropdown && (
                      <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                        {citySuggestions.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onMouseDown={() => {
                              setForm((p) => ({ ...p, city: c }));
                              setSearchQuery(c);
                              setShowCityDropdown(false);
                            }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    State *
                  </label>
                  <select
                    value={form.state}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, state: e.target.value }))
                    }
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  >
                    <option value="">Select State</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Country
                </label>
                <input
                  value={form.country}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, country: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Latitude *
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, latitude: parseFloat(e.target.value) || 0 }))
                      }
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Longitude *
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, longitude: parseFloat(e.target.value) || 0 }))
                      }
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                </div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Map (drag marker to set location)
                  </label>
                </div>
                <div
                  ref={mapRef}
                  className="h-56 w-full rounded-lg border border-gray-300 overflow-hidden"
                  style={{ zIndex: 1 }}
                />
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Images</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.images.map((img, i) => (
                <div key={`${img}-${i}`} className="relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200">
                  <img src={img} alt="Place" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center bg-white/80 text-red-600 hover:bg-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploading}
                id="image-upload"
                className="hidden"
              />
              <label
                htmlFor="image-upload"
                className={`cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 ${
                  uploading ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {uploading ? "Uploading..." : "Upload Image"}
              </label>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {form.tags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Add a tag..."
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
              >
                Add
              </button>
            </div>
          </div>

          {/* Entry fees, closed days, opening hours & best time */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-5">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-800">Entry fees (₹)</h3>
              <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!form.isFreeEntry}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      isFreeEntry: e.target.checked,
                      ...(e.target.checked
                        ? { ticketAdult: "0", ticketChild: "0", ticketForeigner: "0" }
                        : {}),
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Free entry
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Adult</label>
                  <input
                    type="number"
                    min={0}
                    value={form.ticketAdult || ""}
                    disabled={!!form.isFreeEntry}
                    onChange={(e) => setForm((p) => ({ ...p, ticketAdult: e.target.value, isFreeEntry: false }))}
                    placeholder="e.g. 50"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Child</label>
                  <input
                    type="number"
                    min={0}
                    value={form.ticketChild || ""}
                    disabled={!!form.isFreeEntry}
                    onChange={(e) => setForm((p) => ({ ...p, ticketChild: e.target.value, isFreeEntry: false }))}
                    placeholder="e.g. 20"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Foreigner</label>
                  <input
                    type="number"
                    min={0}
                    value={form.ticketForeigner || ""}
                    disabled={!!form.isFreeEntry}
                    onChange={(e) => setForm((p) => ({ ...p, ticketForeigner: e.target.value, isFreeEntry: false }))}
                    placeholder="e.g. 200"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50"
                  />
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Fee basis
                  </label>
                  <select
                    value={form.ticketBasis || (form.isFreeEntry ? "FREE" : "")}
                    disabled={!!form.isFreeEntry}
                    onChange={(e) => setForm((p) => ({ ...p, ticketBasis: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-50"
                  >
                    <option value="">Auto (amounts = per person)</option>
                    {FEE_BASIS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-gray-400">
                    Trip budgets charge per-person tickets × travellers; vehicle/group/flat are charged once; Unknown is excluded and flagged.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Typical visit duration (minutes)
                  </label>
                <input
                  type="number"
                  min={5}
                  max={600}
                  value={form.estimatedDurationMinutes || ""}
                  onChange={(e) => setForm((p) => ({ ...p, estimatedDurationMinutes: e.target.value }))}
                  placeholder="e.g. 90"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 sm:w-56"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Used by the trip scheduler for stop timing and day capacity (5–600).
                </p>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Opening hours</h3>
                  <p className="text-xs text-gray-500">
                    Set each day separately — the itinerary scheduler uses these times. Close to open (e.g. 9:00 PM → 2:00 AM) is saved as an overnight window.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {DAYS_OF_WEEK.map((day) => {
                  const closed = form.dayClosed?.[day] === true;
                  return (
                    <div key={day} className={`rounded-lg border p-3 ${closed ? "border-red-200 bg-red-50/40" : "border-gray-200"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                          <input
                            type="checkbox"
                            checked={closed}
                            onChange={() =>
                              setForm((p) => ({
                                ...p,
                                dayClosed: { ...(p.dayClosed || allOpen()), [day]: !closed },
                              }))
                            }
                            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                          />
                          {day}
                          {closed && <span className="text-xs font-normal text-red-600">Closed</span>}
                        </label>
                        {!closed && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setForm((p) => {
                                  const first = (p.hoursByDay?.[day] || []).find((w) => w.open && w.close);
                                  if (!first) return p;
                                  const next: Record<string, OpeningShift[]> = { ...(p.hoursByDay || emptyHours()) };
                                  for (const d of DAYS_OF_WEEK) next[d] = [{ ...first }];
                                  return { ...p, hoursByDay: next, dayClosed: allOpen() };
                                })
                              }
                              className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                              title="Copy this day's first window to every day"
                            >
                              Copy to all days
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setForm((p) => ({
                                  ...p,
                                  hoursByDay: {
                                    ...(p.hoursByDay || emptyHours()),
                                    [day]: [...(p.hoursByDay?.[day] || []), { open: "", close: "" }],
                                  },
                                }))
                              }
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              + Window
                            </button>
                          </div>
                        )}
                      </div>

                      {!closed && (
                        <div className="mt-3 space-y-2">
                          {(form.hoursByDay?.[day] || []).length === 0 && (
                            <p className="text-xs text-gray-400">No windows — treated as closed. Add a window or tick Closed.</p>
                          )}
                          {(form.hoursByDay?.[day] || []).map((w, wi) => {
                            const overnight =
                              w.open.trim() && w.close.trim() &&
                              (() => {
                                const toMin = (t: string): number | null => {
                                  const m = t.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
                                  if (!m) return null;
                                  let h = parseInt(m[1], 10);
                                  const min = m[2] ? parseInt(m[2], 10) : 0;
                                  if (m[3] === "pm" && h < 12) h += 12;
                                  if (m[3] === "am" && h === 12) h = 0;
                                  return h * 60 + min;
                                };
                                const o = toMin(w.open); const c = toMin(w.close);
                                return o != null && c != null && c <= o;
                              })();
                            return (
                              <div key={`${day}-${wi}`} className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2">
                                <div>
                                  <label className="mb-0.5 block text-[11px] font-medium text-gray-500">Opens</label>
                                  <input
                                    value={w.open}
                                    onChange={(e) =>
                                      setForm((p) => {
                                        const dayWins = [...(p.hoursByDay?.[day] || [])];
                                        dayWins[wi] = { ...dayWins[wi], open: e.target.value };
                                        return { ...p, hoursByDay: { ...(p.hoursByDay || emptyHours()), [day]: dayWins } };
                                      })
                                    }
                                    placeholder="9:00 AM"
                                    className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                                  />
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-[11px] font-medium text-gray-500">
                                    Closes{overnight ? " (next day)" : ""}
                                  </label>
                                  <input
                                    value={w.close}
                                    onChange={(e) =>
                                      setForm((p) => {
                                        const dayWins = [...(p.hoursByDay?.[day] || [])];
                                        dayWins[wi] = { ...dayWins[wi], close: e.target.value };
                                        return { ...p, hoursByDay: { ...(p.hoursByDay || emptyHours()), [day]: dayWins } };
                                      })
                                    }
                                    placeholder={overnight ? "2:00 AM" : "6:00 PM"}
                                    className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                                  />
                                </div>
                                {overnight ? (
                                  <span className="mb-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                    Overnight
                                  </span>
                                ) : (
                                  <span />
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm((p) => {
                                      const dayWins = (p.hoursByDay?.[day] || []).filter((_, i) => i !== wi);
                                      return { ...p, hoursByDay: { ...(p.hoursByDay || emptyHours()), [day]: dayWins } };
                                    })
                                  }
                                  className="mb-0.5 rounded-md border border-red-200 px-2 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50"
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-800">Best time to visit</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Best season / months</label>
                  <input
                    value={form.bestTimeMonths || ""}
                    onChange={(e) => setForm((p) => ({ ...p, bestTimeMonths: e.target.value }))}
                    placeholder="e.g. October to March"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Reason (optional)</label>
                  <input
                    value={form.bestTimeReason || ""}
                    onChange={(e) => setForm((p) => ({ ...p, bestTimeReason: e.target.value }))}
                    placeholder="e.g. Pleasant weather, fewer crowds"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            <MapPin size={16} />
            Drag the marker on the map to set location, or enter manually
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : isEdit ? "Update Place" : "Create Place"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
