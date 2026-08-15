import { describe, expect, it } from "vitest";
import {
  buildTemplateCsv,
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
});
