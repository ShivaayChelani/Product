/**
 * Client-side CSV / Excel place import helpers.
 * Flexible header aliases → BulkPlaceInput-shaped records.
 */

export type ParsedPlaceRow = {
  name: string;
  description?: string;
  shortDescription?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  tags?: string[];
  images?: string[];
  city?: string;
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
  editorialPriority?: number;
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

/** Canonical field → accepted header aliases (lowercased, stripped) */
const FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "place", "place_name", "placename", "title", "spot", "spot_name"],
  description: ["description", "desc", "about", "details", "long_description"],
  shortDescription: ["shortdescription", "short_description", "summary", "subtitle", "tagline"],
  category: ["category", "type", "place_type", "place_category"],
  city: ["city", "town", "district_city"],
  state: ["state", "province", "region"],
  country: ["country", "nation"],
  latitude: ["latitude", "lat", "geo_lat", "y"],
  longitude: ["longitude", "lng", "lon", "long", "geo_lng", "x"],
  tags: ["tags", "tag", "keywords", "labels"],
  images: ["images", "image", "image_url", "image_urls", "photos", "photo", "thumbnail"],
  bestTimeToVisit: ["besttimetovisit", "best_time", "best_time_to_visit", "best_time_visit", "best_months", "bestseason", "best_season"],
  bestTimeReason: ["besttimereason", "best_time_reason", "season_reason"],
  rating: ["rating", "avg_rating", "score"],
  externalId: ["externalid", "external_id", "id", "place_id", "source_id"],
  openingHoursRaw: ["openinghours", "opening_hours", "hours", "timings", "timing"],
  openFrom: ["openfrom", "open_from", "opening_from", "opens", "morning_from", "shift1_from", "opening_time", "open_time"],
  openTo: ["opento", "open_to", "opening_to", "open_till", "closes", "morning_to", "shift1_to", "closing_time", "close_time"],
  openFrom2: ["openfrom2", "open_from_2", "evening_from", "shift2_from"],
  openTo2: ["opento2", "open_to_2", "evening_to", "shift2_to"],
  closedDays: ["closeddays", "closed_days", "closed", "weekly_off", "off_days"],
  ticketAdult: ["ticketadult", "ticket_adult", "adult_fee", "adult", "entry_fee", "entryfee", "fee", "price", "entry_fee_adult"],
  ticketChild: ["ticketchild", "ticket_child", "child_fee", "child", "entry_fee_child"],
  ticketForeigner: ["ticketforeigner", "ticket_foreigner", "foreigner_fee", "foreigner", "entry_fee_foreigner"],
  editorialPriority: ["editorialpriority", "editorial_priority", "priority", "itin_priority"],
};

function normalizeHeader(h: string): string {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildHeaderMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>(); // canonical → original header key used in row
  const normalizedToOriginal = new Map<string, string>();
  for (const h of headers) {
    normalizedToOriginal.set(normalizeHeader(h), h);
  }
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const orig = normalizedToOriginal.get(alias);
      if (orig && !map.has(field)) {
        map.set(field, orig);
        break;
      }
    }
  }
  return map;
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

/** Ticket cells may be Free, ranges (₹100-250), or "Not published". */
function parseTicketFee(raw: string): number | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "n/a" || s === "na" || s === "-" || s === "not published" || s === "np") {
    return undefined;
  }
  if (s === "free" || s.startsWith("free")) return 0;
  const match = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
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

function mapRow(
  row: Record<string, unknown>,
  headerMap: Map<string, string>,
  rowIndex: number,
): { place?: ParsedPlaceRow; error?: string } {
  const get = (field: string) => cell(row, headerMap.get(field));
  const name = get("name");
  if (!name) {
    return { error: `Row ${rowIndex + 2}: missing name` };
  }

  const lat = parseNumber(get("latitude"));
  const lng = parseNumber(get("longitude"));
  if (get("latitude") && lat == null) {
    return { error: `Row ${rowIndex + 2} (${name}): invalid latitude` };
  }
  if (get("longitude") && lng == null) {
    return { error: `Row ${rowIndex + 2} (${name}): invalid longitude` };
  }

  const adult = parseTicketFee(get("ticketAdult"));
  const child = parseTicketFee(get("ticketChild"));
  const foreigner = parseTicketFee(get("ticketForeigner"));
  const ticketPrice =
    adult != null || child != null || foreigner != null
      ? {
          currency: "INR",
          ...(adult != null ? { adult } : {}),
          ...(child != null ? { child } : {}),
          ...(foreigner != null ? { foreigner } : {}),
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
  const priority = parseNumber(get("editorialPriority"));
  const description = get("description");
  const shortDescription = get("shortDescription");

  const place: ParsedPlaceRow = {
    name,
    description: description || shortDescription || undefined,
    shortDescription: shortDescription || (description ? description.slice(0, 200) : undefined),
    category: normalizeCategory(get("category")),
    city: get("city") || undefined,
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
    editorialPriority:
      priority != null && priority >= 1 && priority <= 5 ? Math.round(priority) : undefined,
    openingHours: openingHours as ParsedPlaceRow["openingHours"],
  };

  return { place };
}

export function rowsFromObjects(rawRows: Record<string, unknown>[]): ParsePlacesResult {
  if (!rawRows.length) {
    return { places: [], headers: [], errors: ["File has no data rows."], skippedEmpty: 0 };
  }
  const headers = Object.keys(rawRows[0] || {});
  const headerMap = buildHeaderMap(headers);
  if (!headerMap.has("name")) {
    return {
      places: [],
      headers,
      errors: [
        'Missing required column "name" (also accepts: place_name, title, place).',
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
    const mapped = mapRow(row, headerMap, i);
    if (mapped.error) errors.push(mapped.error);
    if (mapped.place) places.push(mapped.place);
  });

  return { places, headers, errors, skippedEmpty };
}

export const PLACE_IMPORT_TEMPLATE_HEADERS = [
  "name",
  "description",
  "short_description",
  "category",
  "city",
  "state",
  "country",
  "latitude",
  "longitude",
  "tags",
  "images",
  "open_from",
  "open_to",
  "open_from_2",
  "open_to_2",
  "closed_days",
  "ticket_adult",
  "ticket_child",
  "ticket_foreigner",
  "best_time_to_visit",
  "best_time_reason",
  "rating",
  "priority",
] as const;

export const PLACE_IMPORT_TEMPLATE_SAMPLE: string[][] = [
  [
    "Taj Mahal",
    "Ivory-white marble mausoleum on the south bank of the Yamuna.",
    "Iconic marble mausoleum in Agra",
    "monument",
    "Agra",
    "Uttar Pradesh",
    "India",
    "27.1751",
    "78.0421",
    "heritage|unesco",
    "",
    "6:00 AM",
    "12:00 PM",
    "3:00 PM",
    "6:00 PM",
    "Friday",
    "50",
    "0",
    "1100",
    "October to March",
    "Pleasant weather",
    "4.8",
    "5",
  ],
];

export function buildTemplateCsv(): string {
  const lines = [
    PLACE_IMPORT_TEMPLATE_HEADERS.join(","),
    ...PLACE_IMPORT_TEMPLATE_SAMPLE.map((row) =>
      row
        .map((cell) => {
          const needsQuote = /[",\n]/.test(cell);
          const escaped = cell.replace(/"/g, '""');
          return needsQuote ? `"${escaped}"` : escaped;
        })
        .join(","),
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
