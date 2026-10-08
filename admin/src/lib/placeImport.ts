/**
 * Client-side CSV / Excel place import helpers.
 * Flexible header aliases → BulkPlaceInput-shaped records.
 *
 * Canonical Places import/export contract (24 columns, exact order):
 *   place_name, canonical_name, city, district, state, country, category,
 *   description, latitude, longitude, opening_time, closing_time,
 *   best_time_visit, entry_fee_adult, entry_fee_child, entry_fee_foreigner,
 *   tags, priority, close_day, image_url, image_page_url, image_source,
 *   image_author, image_license
 */

import * as XLSX from "xlsx";

export type ParsedPlaceRow = {
  name: string;
  description?: string;
  shortDescription?: string;
  canonicalName?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  tags?: string[];
  images?: string[];
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  openingHours?: Record<string, { open: string; close: string }[] | string>;
  bestTimeToVisit?: string;
  bestTimeReason?: string;
  rating?: number;
  externalId?: string;
  ticketPrice?: {
    currency: string;
    adult?: number;
    child?: number;
    foreigner?: number;
  };
  imageMetadata?: {
    image_page_url?: string;
    image_source?: string;
    image_author?: string;
    image_license?: string;
  };
  editorialPriority?: number;
};

/** Shape of a Place record that can be serialized to the canonical CSV. */
export type CanonicalPlaceExport = {
  name: string;
  canonicalName?: string | null;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  category?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  openingHours?: Record<string, { open: string; close: string }[] | string> | {
    from?: string;
    to?: string;
    till?: string;
  };
  bestTimeToVisit?: Record<string, string> | string;
  bestTimeReason?: string;
  ticketPrice?: {
    adult?: number;
    child?: number;
    foreigner?: number;
  } | null;
  tags?: string[];
  editorialPriority?: number | null;
  images?: string[];
  imageMetadata?: {
    image_page_url?: string | null;
    image_source?: string | null;
    image_author?: string | null;
    image_license?: string | null;
  } | null;
};

export type ParsePlacesResult = {
  places: ParsedPlaceRow[];
  headers: string[];
  errors: string[];
  skippedEmpty: number;
};

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * Canonical Places import/export columns in EXACT contract order.
 */
export const CANONICAL_HEADERS = [
  "place_name",
  "canonical_name",
  "city",
  "district",
  "state",
  "country",
  "category",
  "description",
  "latitude",
  "longitude",
  "opening_time",
  "closing_time",
  "best_time_visit",
  "entry_fee_adult",
  "entry_fee_child",
  "entry_fee_foreigner",
  "tags",
  "priority",
  "close_day",
  "image_url",
  "image_page_url",
  "image_source",
  "image_author",
  "image_license",
] as const;

/** Required canonical columns (parts of the header-level contract). */
export const REQUIRED_CANONICAL_FIELDS = [
  "place_name",
  "canonical_name",
  "city",
  "district",
  "state",
  "country",
  "category",
  "description",
  "latitude",
  "longitude",
  "tags",
  "priority",
  "close_day",
] as const;

/** Optional canonical columns. */
export const OPTIONAL_CANONICAL_FIELDS = [
  "opening_time",
  "closing_time",
  "best_time_visit",
  "entry_fee_adult",
  "entry_fee_child",
  "entry_fee_foreigner",
  "image_url",
  "image_page_url",
  "image_source",
  "image_author",
  "image_license",
] as const;

/** Canonical column per internal importer field (used for precedence). */
const FIELD_CANONICAL_COLUMN: Record<string, string> = {
  name: "place_name",
  canonicalName: "canonical_name",
  description: "description",
  shortDescription: "short_description",
  category: "category",
  city: "city",
  district: "district",
  state: "state",
  country: "country",
  latitude: "latitude",
  longitude: "longitude",
  tags: "tags",
  images: "image_url",
  bestTimeToVisit: "best_time_visit",
  bestTimeReason: "best_time_reason",
  rating: "rating",
  externalId: "external_id",
  openingHoursRaw: "opening_hours",
  openFrom: "opening_time",
  openTo: "closing_time",
  openFrom2: "opening_time_2",
  openTo2: "closing_time_2",
  closedDays: "close_day",
  ticketAdult: "entry_fee_adult",
  ticketChild: "entry_fee_child",
  ticketForeigner: "entry_fee_foreigner",
  editorialPriority: "priority",
  imagePageUrl: "image_page_url",
  imageSource: "image_source",
  imageAuthor: "image_author",
  imageLicense: "image_license",
};

/** Canonical field → accepted header aliases (lowercased, stripped). */
const FIELD_ALIASES: Record<string, string[]> = {
  name: ["place_name", "name", "place", "placename", "title", "spot", "spot_name"],
  canonicalName: ["canonical_name"],
  description: ["description", "desc", "about", "details", "long_description"],
  shortDescription: ["shortdescription", "short_description", "summary", "subtitle", "tagline"],
  category: ["category", "type", "place_type", "place_category"],
  city: ["city", "town", "district_city"],
  district: ["district"],
  state: ["state", "province", "region"],
  country: ["country", "nation"],
  latitude: ["latitude", "lat", "geo_lat", "y"],
  longitude: ["longitude", "lng", "lon", "long", "geo_lng", "x"],
  tags: ["tags", "tag", "keywords", "labels"],
  images: ["image_url", "images", "image", "image_urls", "photos", "photo", "thumbnail"],
  bestTimeToVisit: ["best_time_visit", "besttimetovisit", "best_time", "best_time_to_visit", "best_months", "bestseason", "best_season"],
  bestTimeReason: ["besttimereason", "best_time_reason", "season_reason"],
  rating: ["rating", "avg_rating", "score"],
  externalId: ["externalid", "external_id", "id", "place_id", "source_id"],
  openingHoursRaw: ["openinghours", "opening_hours", "hours", "timings", "timing"],
  openFrom: ["opening_time", "openfrom", "open_from", "opening_from", "opens", "morning_from", "shift1_from", "open_time"],
  openTo: ["closing_time", "opento", "open_to", "opening_to", "open_till", "closes", "morning_to", "shift1_to", "close_time"],
  openFrom2: ["openfrom2", "open_from_2", "evening_from", "shift2_from"],
  openTo2: ["opento2", "open_to_2", "evening_to", "shift2_to"],
  closedDays: ["close_day", "closeddays", "closed_days", "closed", "weekly_off", "off_days"],
  ticketAdult: ["entry_fee_adult", "ticketadult", "ticket_adult", "adult_fee", "adult", "entry_fee", "entryfee", "fee", "price"],
  ticketChild: ["entry_fee_child", "ticketchild", "ticket_child", "child_fee", "child"],
  ticketForeigner: ["entry_fee_foreigner", "ticketforeigner", "ticket_foreigner", "foreigner_fee", "foreigner"],
  editorialPriority: ["priority", "editorialpriority", "editorial_priority", "itin_priority"],
  imagePageUrl: ["image_page_url"],
  imageSource: ["image_source"],
  imageAuthor: ["image_author"],
  imageLicense: ["image_license"],
};

function normalizeHeader(h: string): string {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildHeaderMap(headers: string[]): {
  map: Map<string, string>;
  matched: Map<string, string[]>;
} {
  const normalizedToOriginal = new Map<string, string>();
  for (const h of headers) {
    normalizedToOriginal.set(normalizeHeader(h), h);
  }

  const map = new Map<string, string>(); // canonical → original header key used in row
  const matched = new Map<string, string[]>(); // canonical → all matching original headers

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const canonicalCol = FIELD_CANONICAL_COLUMN[field];
    const present: string[] = [];
    if (canonicalCol && normalizedToOriginal.has(canonicalCol)) {
      present.push(normalizedToOriginal.get(canonicalCol)!);
    }
    for (const alias of aliases) {
      const orig = normalizedToOriginal.get(alias);
      if (orig && !present.includes(orig)) present.push(orig);
    }
    if (present.length) {
      // Canonical column wins; otherwise first alias in declaration order wins.
      const primary = present[0];
      map.set(field, primary);
      matched.set(field, present);
    }
  }

  return { map, matched };
}

function cell(row: Record<string, unknown>, header?: string): string {
  if (!header) return "";
  const v = row[header];
  if (v == null) return "";
  return String(v).trim();
}

function parseNumber(raw: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(String(raw).replace(/,/g, "").replace(/[₹$]/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Ticket cells may be Free, ranges (₹100-250), or "Not published".
 * Returns a number, "invalid" for malformed non-blank values, or undefined
 * when blank / explicitly "not published" (unknown).
 */
function parseTicketFee(raw: string): number | "invalid" | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (!s) return undefined;
  if (s === "n/a" || s === "na" || s === "-" || s === "not published" || s === "np") {
    return undefined;
  }
  if (s === "free" || s.startsWith("free")) return 0;
  const match = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return "invalid";
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : "invalid";
}

function normalizeCategory(raw: string): string | undefined {
  if (!raw) return undefined;
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeTimeCell(raw: string): string {
  if (!raw) return "";
  const s = String(raw).trim();
  // Excel/SheetJS may emit "7:00:00 AM" or "07:00:00"
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = ampm[2];
    const ap = ampm[3].toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  const hms = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hms) return `${hms[1].padStart(2, "0")}:${hms[2]}`;
  return s;
}

function parseList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[|;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseClosedDays(raw: string): string[] {
  if (!raw) return [];
  const tokens = raw.split(/[|;,/]/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    const lower = t.toLowerCase();
    const match = DAYS.find(
      (d) => d.toLowerCase() === lower || d.toLowerCase().startsWith(lower.slice(0, 3)),
    );
    if (match && !out.includes(match)) out.push(match);
  }
  return out;
}

function buildOpeningHours(opts: {
  raw?: string;
  openFrom?: string;
  openTo?: string;
  openFrom2?: string;
  openTo2?: string;
  closedDays?: string[];
}): Record<string, { open: string; close: string }[]> | { from: string; to: string } | undefined {
  const shifts: { open: string; close: string }[] = [];
  if (opts.openFrom || opts.openTo) {
    shifts.push({ open: opts.openFrom || "", close: opts.openTo || "" });
  }
  if (opts.openFrom2 || opts.openTo2) {
    shifts.push({ open: opts.openFrom2 || "", close: opts.openTo2 || "" });
  }
  const closed = opts.closedDays || [];

  if (shifts.length > 0 || closed.length > 0) {
    const cleaned = shifts.filter((s) => s.open || s.close);
    const payload: Record<string, { open: string; close: string }[]> = {};
    for (const day of DAYS) {
      payload[day] = closed.includes(day) ? [] : cleaned;
    }
    return payload;
  }

  if (opts.raw) {
    // Allow JSON string or free text
    try {
      const parsed = JSON.parse(opts.raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* free text */
    }
    return { from: opts.raw, to: "" };
  }
  return undefined;
}

function buildImageMetadata(
  pageUrl: string,
  source: string,
  author: string,
  license: string,
): ParsedPlaceRow["imageMetadata"] {
  const out: { image_page_url?: string; image_source?: string; image_author?: string; image_license?: string } = {};
  if (pageUrl) out.image_page_url = pageUrl;
  if (source) out.image_source = source;
  if (author) out.image_author = author;
  if (license) out.image_license = license;
  return Object.keys(out).length ? out : undefined;
}

function mapRow(
  row: Record<string, unknown>,
  headerMap: Map<string, string>,
  matched: Map<string, string[]>,
  rowIndex: number,
): { place?: ParsedPlaceRow; error?: string } {
  const get = (field: string) => cell(row, headerMap.get(field));
  const name = get("name");
  if (!name) {
    return { error: `Row ${rowIndex + 2}: missing name` };
  }

  // Report conflicting canonical/alias headers only when values actually differ.
  const conflictFor = (field: string): string[] => {
    const others = (matched.get(field) || []).filter((h) => h !== headerMap.get(field));
    if (!others.length) return [];
    const chosen = get(field);
    return others.filter((h) => cell(row, h) !== chosen);
  };
  for (const [field, errLabel] of [
    ["name", "place_name"],
    ["canonicalName", "canonical_name"],
    ["city", "city"],
    ["district", "district"],
    ["tags", "tags"],
    ["closedDays", "close_day"],
    ["editorialPriority", "priority"],
  ] as const) {
    if (conflictFor(field).length) {
      return {
        error: `Row ${rowIndex + 2} (${name}): conflicting values for "${errLabel}" across columns, using the canonical column`,
      };
    }
  }

  const lat = parseNumber(get("latitude"));
  const lng = parseNumber(get("longitude"));
  if (get("latitude") && lat == null) {
    return { error: `Row ${rowIndex + 2} (${name}): invalid latitude` };
  }
  if (get("longitude") && lng == null) {
    return { error: `Row ${rowIndex + 2} (${name}): invalid longitude` };
  }
  if (lat != null && (lat < -90 || lat > 90)) {
    return { error: `Row ${rowIndex + 2} (${name}): invalid latitude (must be -90 to 90)` };
  }
  if (lng != null && (lng < -180 || lng > 180)) {
    return { error: `Row ${rowIndex + 2} (${name}): invalid longitude (must be -180 to 180)` };
  }

  const adult = parseTicketFee(get("ticketAdult"));
  const child = parseTicketFee(get("ticketChild"));
  const foreigner = parseTicketFee(get("ticketForeigner"));
  if (adult === "invalid") {
    return { error: `Row ${rowIndex + 2} (${name}): invalid entry fee "${get("ticketAdult")}" (column "entry_fee_adult")` };
  }
  if (child === "invalid") {
    return { error: `Row ${rowIndex + 2} (${name}): invalid entry fee "${get("ticketChild")}" (column "entry_fee_child")` };
  }
  if (foreigner === "invalid") {
    return { error: `Row ${rowIndex + 2} (${name}): invalid entry fee "${get("ticketForeigner")}" (column "entry_fee_foreigner")` };
  }
  const ticketPrice =
    adult != null || child != null || foreigner != null
      ? {
          currency: "INR",
          ...(adult != null && adult !== undefined ? { adult } : {}),
          ...(child != null && child !== undefined ? { child } : {}),
          ...(foreigner != null && foreigner !== undefined ? { foreigner } : {}),
        }
      : undefined;

  const closedDays = parseClosedDays(get("closedDays"));
  const openingHours = buildOpeningHours({
    raw: get("openingHoursRaw"),
    openFrom: normalizeTimeCell(get("openFrom")),
    openTo: normalizeTimeCell(get("openTo")),
    openFrom2: normalizeTimeCell(get("openFrom2")),
    openTo2: normalizeTimeCell(get("openTo2")),
    closedDays,
  });

  const rating = parseNumber(get("rating"));
  const priorityRaw = get("editorialPriority");
  const priority = parseNumber(priorityRaw);
  if (priorityRaw && (priority == null || priority < 1 || priority > 5)) {
    return {
      error: `Row ${rowIndex + 2} (${name}): invalid priority "${priorityRaw}" (must be 1-5)`,
    };
  }
  const description = get("description");
  const shortDescription = get("shortDescription");

  const place: ParsedPlaceRow = {
    name,
    description: description || shortDescription || undefined,
    shortDescription: shortDescription || (description ? description.slice(0, 200) : undefined),
    canonicalName: get("canonicalName") || undefined,
    category: normalizeCategory(get("category")),
    city: get("city") || undefined,
    district: get("district") || undefined,
    state: get("state") || undefined,
    country: get("country") || "India",
    latitude: lat,
    longitude: lng,
    tags: parseList(get("tags")),
    // Images intentionally optional — many imports add photos manually after create.
    images: parseList(get("images")),
    bestTimeToVisit: get("bestTimeToVisit") || undefined,
    bestTimeReason: get("bestTimeReason") || undefined,
    rating,
    externalId: get("externalId") || undefined,
    ticketPrice,
    imageMetadata: buildImageMetadata(
      get("imagePageUrl"),
      get("imageSource"),
      get("imageAuthor"),
      get("imageLicense"),
    ),
    editorialPriority: priority != null ? Math.round(priority) : undefined,
    openingHours: openingHours as ParsedPlaceRow["openingHours"],
  };

  return { place };
}

/**
 * Backward-compatible required-column validation.
 *
 * A file is treated as a "canonical contract" file when it carries any of the
 * new canonical-only column names (canonical_name, district, close_day). Such
 * files must satisfy all 13 required canonical columns (canonical name or a
 * known legacy alias); missing columns are reported by their canonical name.
 * Pure legacy alias files keep the historical behavior (only name required).
 */
function missingRequiredColumns(
  headerMap: Map<string, string>,
  matched: Map<string, string[]>,
): string[] {
  const requiredByField: Array<{ field: string; canonical: string }> = [
    { field: "name", canonical: "place_name" },
    { field: "canonicalName", canonical: "canonical_name" },
    { field: "city", canonical: "city" },
    { field: "district", canonical: "district" },
    { field: "state", canonical: "state" },
    { field: "country", canonical: "country" },
    { field: "category", canonical: "category" },
    { field: "description", canonical: "description" },
    { field: "latitude", canonical: "latitude" },
    { field: "longitude", canonical: "longitude" },
    { field: "tags", canonical: "tags" },
    { field: "editorialPriority", canonical: "priority" },
    { field: "closedDays", canonical: "close_day" },
  ];
  const hasCanonicalColumn = (field: string): boolean => {
    const coll = FIELD_CANONICAL_COLUMN[field];
    return coll != null && (matched.get(field) || []).some((h) => normalizeHeader(h) === coll);
  };

  const isCanonicalStyle = ["canonicalName", "district", "closedDays"].some(hasCanonicalColumn);
  if (!isCanonicalStyle) return [];

  const missing = requiredByField
    .filter(({ field }) => !headerMap.has(field))
    .map(({ canonical }) => canonical);
  return missing;
}

export function rowsFromObjects(rawRows: Record<string, unknown>[]): ParsePlacesResult {
  if (!rawRows.length) {
    return { places: [], headers: [], errors: ["File has no data rows."], skippedEmpty: 0 };
  }
  const headers = Object.keys(rawRows[0] || {});
  const { map: headerMap, matched } = buildHeaderMap(headers);
  if (!headerMap.has("name")) {
    const missing = missingRequiredColumns(headerMap, matched);
    const extra = missing.length
      ? ` Missing required column(s): ${missing.join(", ")}.`
      : "";
    return {
      places: [],
      headers,
      errors: [
        `Missing required column "place_name" (also accepts: name, place, title).${extra}`,
      ],
      skippedEmpty: 0,
    };
  }

  const missing = missingRequiredColumns(headerMap, matched);
  if (missing.length) {
    return {
      places: [],
      headers,
      errors: [
        `Missing required column(s): ${missing.join(
          ", ",
        )}. Expected columns: ${CANONICAL_HEADERS.join(", ")}.`,
      ],
      skippedEmpty: 0,
    };
  }

  const places: ParsedPlaceRow[] = [];
  const errors: string[] = [];
  let skippedEmpty = 0;

  rawRows.forEach((row, i) => {
    const values = Object.values(row).map((v) => (v == null ? "" : String(v).trim()));
    if (values.every((v) => !v)) {
      skippedEmpty += 1;
      return;
    }
    const mapped = mapRow(row, headerMap, matched, i);
    if (mapped.error) errors.push(mapped.error);
    if (mapped.place) places.push(mapped.place);
  });

  return { places, headers, errors, skippedEmpty };
}

export const PLACE_IMPORT_TEMPLATE_HEADERS: readonly string[] = [...CANONICAL_HEADERS];

export const PLACE_IMPORT_TEMPLATE_SAMPLE: string[][] = [
  [
    "Taj Mahal",
    "Taj Mahal",
    "Agra",
    "Agra",
    "Uttar Pradesh",
    "India",
    "monument",
    "Ivory-white marble mausoleum on the south bank of the Yamuna.",
    "27.1751",
    "78.0421",
    "6:00 AM",
    "12:00 PM",
    "October to March",
    "50",
    "0",
    "1100",
    "heritage|unesco",
    "5",
    "Friday",
    "",
    "",
    "",
    "",
    "",
  ],
];

function escapeCsvCell(cellValue: unknown): string {
  const cell = cellValue == null ? "" : String(cellValue);
  const needsQuote = /[",\n]/.test(cell);
  const escaped = cell.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

export function buildTemplateCsv(): string {
  const lines = [
    PLACE_IMPORT_TEMPLATE_HEADERS.join(","),
    ...PLACE_IMPORT_TEMPLATE_SAMPLE.map((row) =>
      row.map(escapeCsvCell).join(","),
    ),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

export function downloadTemplateCsv(): void {
  const blob = new Blob([buildTemplateCsv()], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "palsafar-places-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTemplateXlsx(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [...PLACE_IMPORT_TEMPLATE_HEADERS],
    ...PLACE_IMPORT_TEMPLATE_SAMPLE,
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Places");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "palsafar-places-import-template.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Canonical CSV export ────────────────────────────────────────────────

function hoursObject(
  hours: CanonicalPlaceExport["openingHours"],
): Record<string, { open: string; close: string }[] | string> | undefined {
  if (!hours || typeof hours !== "object") return undefined;
  return hours as Record<string, { open: string; close: string }[] | string>;
}

/** Derive canonical opening_time/closing_time/close_day from day-wise hours. */
export function deriveCanonicalHours(
  openingHours: CanonicalPlaceExport["openingHours"],
): { opening_time: string; closing_time: string; close_day: string } {
  const obj = hoursObject(openingHours);
  const out = { opening_time: "", closing_time: "", close_day: "" };
  if (!obj) return out;

  const getVal = (key: string) => obj[key] ?? obj[key.toLowerCase()];

  const closedDays: string[] = [];
  for (const day of DAYS) {
    const val = getVal(day);
    if (Array.isArray(val) && val.length === 0) closedDays.push(day);
  }
  out.close_day = closedDays.join(", ");

  const genericKeys = ["daily", "all", "everyday", "every_day"];
  let windows: { open: string; close: string }[] | undefined;
  for (const key of genericKeys) {
    const val = getVal(key);
    if (Array.isArray(val) && val.length > 0) {
      windows = val as { open: string; close: string }[];
      break;
    }
  }
  if (!windows) {
    for (const day of DAYS) {
      const val = getVal(day);
      if (Array.isArray(val) && val.length > 0) {
        windows = val as { open: string; close: string }[];
        break;
      }
    }
  }
  const first = windows?.[0];
  if (first && typeof first === "object") {
    out.opening_time = first.open || "";
    out.closing_time = first.close || "";
  }
  return out;
}

export function deriveBestTimeVisit(
  best: CanonicalPlaceExport["bestTimeToVisit"],
): string {
  if (!best) return "";
  if (typeof best === "string") return best;
  if (typeof best === "object") {
    if (typeof best.bestMonths === "string" && best.bestMonths) return best.bestMonths;
    if (best.from && best.to) return `${best.from} to ${best.to}`;
    if (best.from) return best.from;
    if (best.to) return `until ${best.to}`;
  }
  return "";
}

/** Build one canonical CSV row (Array of 24 cells, contract order). */
export function buildCanonicalPlaceRow(place: CanonicalPlaceExport): string[] {
  const hours = deriveCanonicalHours(place.openingHours);
  const tp = place.ticketPrice || {};
  const meta = place.imageMetadata || {};
  const num = (v?: number | null): string =>
    v == null || !Number.isFinite(v) ? "" : String(v);
  return [
    place.name || "",
    place.canonicalName || "",
    place.city || "",
    place.district || "",
    place.state || "",
    place.country || "",
    place.category || "",
    place.description || "",
    num(place.latitude),
    num(place.longitude),
    hours.opening_time,
    hours.closing_time,
    deriveBestTimeVisit(place.bestTimeToVisit),
    tp.adult != null ? num(tp.adult) : "",
    tp.child != null ? num(tp.child) : "",
    tp.foreigner != null ? num(tp.foreigner) : "",
    Array.isArray(place.tags) ? place.tags.join(", ") : "",
    place.editorialPriority != null ? String(place.editorialPriority) : "",
    hours.close_day,
    place.images?.[0] || "",
    meta.image_page_url || "",
    meta.image_source || "",
    meta.image_author || "",
    meta.image_license || "",
  ];
}

/** Serialize places to the canonical 24-column CSV (BOM-prefixed). */
export function buildPlacesCanonicalCsv(places: CanonicalPlaceExport[]): string {
  const lines = [
    CANONICAL_HEADERS.join(","),
    ...places.map((p) => buildCanonicalPlaceRow(p).map(escapeCsvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

export function downloadPlacesCanonicalCsv(places: CanonicalPlaceExport[]): void {
  const blob = new Blob([buildPlacesCanonicalCsv(places)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `places-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}