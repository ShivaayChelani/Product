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

function parseTicketPrice(raw: unknown): {
  adult: string;
  child: string;
  foreigner: string;
  isFree: boolean;
} {
  if (!raw || typeof raw !== "object") {
    return { adult: "", child: "", foreigner: "", isFree: false };
  }
  const tp = raw as { adult?: number; child?: number; foreigner?: number };
  const adult = tp.adult != null && !Number.isNaN(Number(tp.adult)) ? String(tp.adult) : "";
  const child = tp.child != null && !Number.isNaN(Number(tp.child)) ? String(tp.child) : "";
  const foreigner = tp.foreigner != null && !Number.isNaN(Number(tp.foreigner)) ? String(tp.foreigner) : "";
  const isFree =
    (adult === "" || Number(adult) === 0) &&
    (child === "" || Number(child) === 0) &&
    (foreigner === "" || Number(foreigner) === 0) &&
    (adult !== "" || child !== "" || foreigner !== "");
  return { adult, child, foreigner, isFree };
}

function parseOpeningHours(raw: unknown): { closedDays: string[]; shifts: OpeningShift[] } {
  const defaultShifts: OpeningShift[] = [{ open: "", close: "" }];
  if (!raw || typeof raw !== "object") {
    return { closedDays: [], shifts: defaultShifts };
  }
  const obj = raw as Record<string, unknown>;

  // Legacy admin shape: { from, to } / { from, till }
  if ("from" in obj || "to" in obj || "till" in obj) {
    return {
      closedDays: [],
      shifts: [{
        open: String(obj.from || ""),
        close: String(obj.to || obj.till || ""),
      }],
    };
  }

  const closedDays: string[] = [];
  let shifts = defaultShifts;
  let foundShifts = false;

  for (const day of DAYS_OF_WEEK) {
    const val = obj[day] ?? obj[day.toLowerCase()];
    if (Array.isArray(val)) {
      if (val.length === 0) {
        closedDays.push(day);
      } else if (!foundShifts) {
        shifts = val.map((s) => {
          const row = s as { open?: string; close?: string };
          return { open: String(row.open || ""), close: String(row.close || "") };
        });
        foundShifts = true;
      }
    } else if (typeof val === "string") {
      const text = val.trim();
      if (!text || /^closed$/i.test(text)) {
        closedDays.push(day);
      } else if (!foundShifts) {
        const parts = text.split(/\s*[-–—]|to\s+/i).map((p) => p.trim()).filter(Boolean);
        shifts = [{ open: parts[0] || "", close: parts[1] || "" }];
        foundShifts = true;
      }
    }
  }

  return { closedDays, shifts };
}

function buildOpeningHoursPayload(
  shifts: OpeningShift[],
  closedDays: string[],
): Record<string, OpeningShift[]> | undefined {
  const cleaned = shifts
    .map((s) => ({ open: s.open.trim(), close: s.close.trim() }))
    .filter((s) => s.open || s.close);
  if (cleaned.length === 0 && closedDays.length === 0) return undefined;

  const payload: Record<string, OpeningShift[]> = {};
  for (const day of DAYS_OF_WEEK) {
    payload[day] = closedDays.includes(day) ? [] : (cleaned.length ? cleaned : []);
  }
  return payload;
}

const PRIORITY_OPTIONS = [
  { value: 5, label: "5 — Highest Priority" },
  { value: 4, label: "4 — High" },
  { value: 3, label: "3 — Normal" },
  { value: 2, label: "2 — Low" },
  { value: 1, label: "1 — Lowest" },
];

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
    openingFrom: "",
    openingTo: "",
    openingShifts: [{ open: "", close: "" }],
    closedDays: [],
    ticketAdult: "",
    ticketChild: "",
    ticketForeigner: "",
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
      openingFrom: hours.shifts[0]?.open || "",
      openingTo: hours.shifts[0]?.close || "",
      openingShifts: hours.shifts,
      closedDays: hours.closedDays,
      ticketAdult: fees.adult,
      ticketChild: fees.child,
      ticketForeigner: fees.foreigner,
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

      const openingHours = buildOpeningHoursPayload(
        form.openingShifts || [{ open: form.openingFrom || "", close: form.openingTo || "" }],
        form.closedDays || [],
      );

      const ticketPrice = form.isFreeEntry
        ? { currency: "INR", adult: 0, child: 0, foreigner: 0 }
        : (() => {
            const adult = form.ticketAdult?.trim() ? Number(form.ticketAdult) : undefined;
            const child = form.ticketChild?.trim() ? Number(form.ticketChild) : undefined;
            const foreigner = form.ticketForeigner?.trim() ? Number(form.ticketForeigner) : undefined;
            if (adult == null && child == null && foreigner == null) return undefined;
            return {
              currency: "INR",
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
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-800">Closed days</h3>
              <p className="mb-3 text-xs text-gray-500">Tick days when the place is closed (e.g. Sunday).</p>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const checked = (form.closedDays || []).includes(day);
                  return (
                    <label
                      key={day}
                      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        checked
                          ? "border-red-300 bg-red-50 text-red-700"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setForm((p) => {
                            const prev = p.closedDays || [];
                            return {
                              ...p,
                              closedDays: checked
                                ? prev.filter((d) => d !== day)
                                : [...prev, day],
                            };
                          })
                        }
                        className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      {day}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Opening hours</h3>
                  <p className="text-xs text-gray-500">
                    Add morning and evening shifts if the place opens twice a day.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      openingShifts: [...(p.openingShifts || []), { open: "", close: "" }],
                    }))
                  }
                  className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  + Add shift
                </button>
              </div>
              <div className="space-y-3">
                {(form.openingShifts || [{ open: "", close: "" }]).map((shift, index) => (
                  <div key={`shift-${index}`} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        {index === 0 ? "Open from (morning / first)" : `Shift ${index + 1} from`}
                      </label>
                      <input
                        value={shift.open}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...(p.openingShifts || [])];
                            next[index] = { ...next[index], open: e.target.value };
                            return { ...p, openingShifts: next, openingFrom: next[0]?.open || "" };
                          })
                        }
                        placeholder={index === 0 ? "e.g. 8:00 AM" : "e.g. 4:00 PM"}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        {index === 0 ? "Open till" : `Shift ${index + 1} till`}
                      </label>
                      <input
                        value={shift.close}
                        onChange={(e) =>
                          setForm((p) => {
                            const next = [...(p.openingShifts || [])];
                            next[index] = { ...next[index], close: e.target.value };
                            return { ...p, openingShifts: next, openingTo: next[0]?.close || "" };
                          })
                        }
                        placeholder={index === 0 ? "e.g. 12:00 PM" : "e.g. 8:00 PM"}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      />
                    </div>
                    {(form.openingShifts || []).length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((p) => {
                            const next = (p.openingShifts || []).filter((_, i) => i !== index);
                            return {
                              ...p,
                              openingShifts: next.length ? next : [{ open: "", close: "" }],
                              openingFrom: next[0]?.open || "",
                              openingTo: next[0]?.close || "",
                            };
                          })
                        }
                        className="mb-0.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    ) : (
                      <div className="hidden sm:block" />
                    )}
                  </div>
                ))}
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
