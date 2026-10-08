import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  buildCanonicalPlaceRow,
  buildPlacesCanonicalCsv,
  buildTemplateCsv,
  CANONICAL_HEADERS,
  PLACE_IMPORT_TEMPLATE_HEADERS,
  rowsFromObjects,
} from "./placeImport";

describe("rowsFromObjects", () => {
  it("parses a valid place row with aliases", () => {
    const result = rowsFromObjects([
      {
        Place: "Taj Mahal",
        City: "Agra",
        State: "Uttar Pradesh",
        Lat: "27.1751",
        Lng: "78.0421",
        Category: "monument",
        Tags: "unesco,heritage",
        Adult: "50",
        Child: "20",
      },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.places).toHaveLength(1);
    expect(result.places[0]).toMatchObject({
      name: "Taj Mahal",
      city: "Agra",
      state: "Uttar Pradesh",
      latitude: 27.1751,
      longitude: 78.0421,
      category: "monument",
      tags: ["unesco", "heritage"],
      ticketPrice: {
        currency: "INR",
        adult: 50,
        child: 20,
      },
    });
  });

  it("reports missing name errors and skips empty rows", () => {
    const result = rowsFromObjects([
      { name: "Valid Header Row Place", city: "Delhi" },
      { name: "", city: "" },
      { name: "", description: "has content but no name" },
    ]);

    expect(result.places.some((p) => p.name === "Valid Header Row Place")).toBe(true);
    expect(result.skippedEmpty).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => /missing name/i.test(e))).toBe(true);
  });

  it("rejects invalid latitude", () => {
    const result = rowsFromObjects([{ name: "Bad Spot", latitude: "not-a-number" }]);
    expect(result.places).toHaveLength(0);
    expect(result.errors.some((e) => /invalid latitude/i.test(e))).toBe(true);
  });

  it("parses PalSafar Jabalpur Excel column aliases without images", () => {
    const result = rowsFromObjects([
      {
        place_name: "Dhuandhar Falls",
        city: "Jabalpur",
        state: "Madhya Pradesh",
        country: "India",
        category: "waterfall",
        description: "Major Narmada waterfall at Bhedaghat.",
        latitude: "23.1254",
        longitude: "79.8134",
        opening_time: "6:00:00 AM",
        closing_time: "9:00:00 PM",
        best_time_visit: "October to March",
        entry_fee_adult: "Free",
        entry_fee_child: "Free ",
        entry_fee_foreigner: "Not published",
        tags: "waterfall, narmada river, nature",
        priority: "5",
      },
      {
        place_name: "Bargi Dam Cruise Ride",
        city: "Jabalpur",
        state: "Madhya Pradesh",
        country: "India",
        category: "adventure",
        description: "Cruise on Bargi reservoir.",
        latitude: "22.94",
        longitude: "79.92",
        opening_time: "10:00:00",
        closing_time: "17:00:00",
        best_time_visit: "October to March",
        entry_fee_adult: "₹150-300",
        entry_fee_child: "₹100",
        entry_fee_foreigner: "₹150-300",
        tags: "cruise, dam",
        priority: "4",
      },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.places).toHaveLength(2);
    expect(result.places[0]).toMatchObject({
      name: "Dhuandhar Falls",
      category: "waterfall",
      city: "Jabalpur",
      bestTimeToVisit: "October to March",
      editorialPriority: 5,
      images: [],
      ticketPrice: { currency: "INR", adult: 0, child: 0 },
    });
    expect(result.places[0].ticketPrice?.foreigner).toBeUndefined();
    expect(result.places[0].openingHours).toBeTruthy();
    expect(result.places[1].ticketPrice).toMatchObject({
      currency: "INR",
      adult: 150,
      child: 100,
      foreigner: 150,
    });
  });
});

describe("buildTemplateCsv", () => {
  it("includes required headers and a sample row", () => {
    const csv = buildTemplateCsv();
    for (const header of PLACE_IMPORT_TEMPLATE_HEADERS) {
      expect(csv).toContain(header);
    }
    expect(csv.split("\n").length).toBeGreaterThan(1);
  });

  it("uses the exact canonical 24-column order", () => {
    expect([...PLACE_IMPORT_TEMPLATE_HEADERS]).toEqual([...CANONICAL_HEADERS]);
  });
});

describe("canonical contract", () => {
  it("parses a full canonical row with optional blanks", () => {
    const result = rowsFromObjects([
      {
        place_name: "Taj Mahal",
        canonical_name: "Taj Mahal",
        city: "Agra",
        district: "Agra",
        state: "Uttar Pradesh",
        country: "India",
        category: "monument",
        description: "Ivory-white marble mausoleum.",
        latitude: "27.1751",
        longitude: "78.0421",
        opening_time: "6:00:00 AM",
        closing_time: "12:00:00 PM",
        best_time_visit: "October to March",
        entry_fee_adult: "50",
        entry_fee_child: "",
        entry_fee_foreigner: "1100",
        tags: "heritage|unesco",
        priority: "5",
        close_day: "Friday",
        image_url: "https://example.com/taj.jpg",
        image_page_url: "https://commons.wikimedia.org/wiki/Taj",
        image_source: "Wikimedia Commons",
        image_author: "John Doe",
        image_license: "CC BY-SA 4.0",
      },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.places).toHaveLength(1);
    const p = result.places[0];
    expect(p).toMatchObject({
      name: "Taj Mahal",
      canonicalName: "Taj Mahal",
      city: "Agra",
      district: "Agra",
      category: "monument",
      editorialPriority: 5,
      tags: ["heritage", "unesco"],
      images: ["https://example.com/taj.jpg"],
    });
    expect(p.ticketPrice).toMatchObject({ adult: 50, foreigner: 1100, currency: "INR" });
    expect(p.ticketPrice?.child).toBeUndefined();
    expect(p.imageMetadata).toEqual({
      image_page_url: "https://commons.wikimedia.org/wiki/Taj",
      image_source: "Wikimedia Commons",
      image_author: "John Doe",
      image_license: "CC BY-SA 4.0",
    });
    const hours = p.openingHours as Record<string, { open: string; close: string }[]>;
    expect(hours.Friday).toEqual([]);
    expect(hours.Monday).toEqual([{ open: "06:00", close: "12:00" }]);
  });

  it("rejects canonical files that miss a required column", () => {
    const result = rowsFromObjects([
      {
        place_name: "Taj Mahal",
        canonical_name: "Taj Mahal",
        state: "Uttar Pradesh",
        category: "monument",
        description: "desc",
        latitude: "27.1751",
        longitude: "78.0421",
        tags: "heritage",
        priority: "5",
        close_day: "",
      },
    ]);
    expect(result.places).toHaveLength(0);
    expect(result.errors[0]).toContain("district");
    expect(result.errors[0]).toMatch(/missing required column/i);
  });

  it("canonical column wins and reports differing legacy aliases", () => {
    const result = rowsFromObjects([
      {
        place_name: "Taj Mahal",
        canonical_name: "Taj Mahal",
        Place: "Legacy Name",
        city: "Agra",
        district: "Agra",
        state: "Uttar Pradesh",
        country: "India",
        category: "monument",
        description: "desc",
        latitude: "27.1751",
        longitude: "78.0421",
        tags: "heritage",
        priority: "5",
        close_day: "",
      },
    ]);
    expect(result.places).toHaveLength(0);
    expect(result.errors[0]).toMatch(/conflicting values for "place_name"/);
  });

  it("does not flag conflicts when alias matches canonical value", () => {
    const result = rowsFromObjects([
      {
        place_name: "Taj Mahal",
        canonical_name: "Taj Mahal",
        city: "Agra",
        district: "Agra",
        state: "Uttar Pradesh",
        country: "India",
        category: "monument",
        description: "desc",
        latitude: "27.1751",
        longitude: "78.0421",
        tags: "heritage",
        priority: "5",
        close_day: "",
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.places[0].name).toBe("Taj Mahal");
  });

  it("rejects invalid priority, entry fee, and out-of-range coordinates", () => {
    const badPriority = rowsFromObjects([
      {
        place_name: "A", canonical_name: "A", city: "X", district: "D",
        state: "S", country: "India", category: "temple", description: "d",
        latitude: "1", longitude: "1", tags: "t", priority: "9", close_day: "",
      },
    ]);
    expect(badPriority.errors[0]).toMatch(/invalid priority/);

    const badFee = rowsFromObjects([
      {
        place_name: "A", canonical_name: "A", city: "X", district: "D",
        state: "S", country: "India", category: "temple", description: "d",
        latitude: "1", longitude: "1", tags: "t", priority: "3", close_day: "",
        entry_fee_adult: "lots of money",
      },
    ]);
    expect(badFee.errors[0]).toMatch(/invalid entry fee/);

    const badLng = rowsFromObjects([
      {
        place_name: "A", canonical_name: "A", city: "X", district: "D",
        state: "S", country: "India", category: "temple", description: "d",
        latitude: "1", longitude: "200", tags: "t", priority: "3", close_day: "",
      },
    ]);
    expect(badLng.errors[0]).toMatch(/invalid longitude/);

    const badLat = rowsFromObjects([
      {
        place_name: "A", canonical_name: "A", city: "X", district: "D",
        state: "S", country: "India", category: "temple", description: "d",
        latitude: "123", longitude: "1", tags: "t", priority: "3", close_day: "",
      },
    ]);
    expect(badLat.errors[0]).toMatch(/invalid latitude/);
  });

  it("legacy alias-only files keep importing without the new required columns", () => {
    const result = rowsFromObjects([
      {
        place_name: "Legacy Place",
        city: "Jabalpur",
        state: "Madhya Pradesh",
        category: "temple",
        description: "desc",
        latitude: "23.16",
        longitude: "79.94",
        opening_time: "6:00:00 AM",
        closing_time: "9:00:00 PM",
        best_time_visit: "October to March",
        tags: "temple",
        priority: "4",
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.places[0]).toMatchObject({
      name: "Legacy Place",
      editorialPriority: 4,
      bestTimeToVisit: "October to March",
    });
  });

  it("round-trips canonical CSV export back through import", () => {
    const exported = buildPlacesCanonicalCsv([
      {
        name: "Khangchendzonga",
        canonicalName: "Khangchendzonga National Park",
        city: "Gangtok",
        district: "Mangan",
        state: "Sikkim",
        country: "India",
        category: "park",
        description: "High-altitude national park.",
        latitude: 27.7,
        longitude: 88.15,
        openingHours: {
          Monday: [{ open: "08:00", close: "17:00" }],
          Tuesday: [],
          Wednesday: [{ open: "08:00", close: "17:00" }],
          Thursday: [{ open: "08:00", close: "17:00" }],
          Friday: [{ open: "08:00", close: "17:00" }],
          Saturday: [{ open: "09:00", close: "19:00" }],
          Sunday: [{ open: "08:00", close: "17:00" }],
        },
        ticketPrice: { adult: 200, child: 0, foreigner: 900 },
        tags: ["park", "trek"],
        editorialPriority: 5,
        images: ["https://example.com/k.png"],
        imageMetadata: {
          image_page_url: "https://commons.wikimedia.org/wiki/K",
          image_source: "Wikimedia Commons",
          image_author: "A. Photographer",
          image_license: "CC BY 4.0",
        },
      },
    ]);

    const parsed = Papa.parse<Record<string, unknown>>(exported, {
      header: true,
      skipEmptyLines: true,
    }).data;
    expect(parsed[0]).toBeDefined();
    const result = rowsFromObjects(parsed);
    expect(result.errors).toEqual([]);
    const p = result.places[0];
    expect(p).toMatchObject({
      name: "Khangchendzonga",
      canonicalName: "Khangchendzonga National Park",
      district: "Mangan",
      editorialPriority: 5,
      tags: ["park", "trek"],
    });
    expect(p.ticketPrice).toMatchObject({ adult: 200, child: 0, foreigner: 900 });
    expect(p.imageMetadata?.image_author).toBe("A. Photographer");
    const hours = p.openingHours as Record<string, { open: string; close: string }[]>;
    expect(hours.Tuesday).toEqual([]);
    expect(hours.Monday).toEqual([{ open: "08:00", close: "17:00" }]);
  });

  it("round-trips canonical rows written by buildCanonicalPlaceRow", () => {
    const row = buildCanonicalPlaceRow({
      name: "Sample",
      canonicalName: "Sample Official",
      city: "Agra",
      district: "Agra",
      openingHours: { Monday: [], Tuesday: [{ open: "06:00", close: "18:00" }] },
      ticketPrice: { adult: 10 },
      tags: ["a", "b"],
      editorialPriority: 2,
    });
    expect(row).toHaveLength(24);
    expect(row[1]).toBe("Sample Official");
    expect(row[3]).toBe("Agra");
    expect(row[10]).toBe("06:00");
    expect(row[11]).toBe("18:00");
    expect(row[18]).toBe("Monday");
  });

  it("parses a canonical Excel workbook (xlsx) through the same path", () => {
    const rows = [
      [
        "place_name", "canonical_name", "city", "district", "state", "country",
        "category", "description", "latitude", "longitude", "opening_time",
        "closing_time", "best_time_visit", "entry_fee_adult", "entry_fee_child",
        "entry_fee_foreigner", "tags", "priority", "close_day", "image_url",
        "image_page_url", "image_source", "image_author", "image_license",
      ],
      [
        "Dhuandhar Falls", "Dhuandhar Falls", "Jabalpur", "Jabalpur",
        "Madhya Pradesh", "India", "waterfall", "Desc", "23.1254", "79.8134",
        "06:00", "21:00", "October to March", "0", "0", "", "waterfall, narmada",
        "5", "Monday", "", "", "", "", "",
      ],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Places");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const parsedWb = XLSX.read(buf, { type: "array" });
    const raw = XLSX.utils.sheet_to_json(parsedWb.Sheets[parsedWb.SheetNames[0]]);

    const result = rowsFromObjects(raw as Record<string, unknown>[]);
    expect(result.errors).toEqual([]);
    expect(result.places[0]).toMatchObject({
      name: "Dhuandhar Falls",
      canonicalName: "Dhuandhar Falls",
      district: "Jabalpur",
      editorialPriority: 5,
    });
    expect(result.places[0].ticketPrice).toMatchObject({ adult: 0, child: 0 });
    const hours = result.places[0].openingHours as Record<string, { open: string; close: string }[]>;
    expect(hours.Monday).toEqual([]);
    expect(hours.Tuesday).toEqual([{ open: "06:00", close: "21:00" }]);
  });
});
