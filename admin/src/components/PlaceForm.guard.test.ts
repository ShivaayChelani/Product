import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-level regression guard: the Places form must keep its existing
 * Entry Fees / Fee Basis / Typical Visit Duration / day-wise Opening Hours
 * (incl. overnight) / Best Time to Visit capabilities intact while the
 * canonical (canonical_name / district / image metadata) fields ride along.
 */
const source = readFileSync(
  join(process.cwd(), "src", "components", "PlaceForm.tsx"),
  "utf-8",
);

describe("PlaceForm preserved UI", () => {
  it("keeps fee basis options and amounts", () => {
    for (const basis of ["FREE", "PER_PERSON", "PER_VEHICLE", "PER_GROUP", "FLAT_RATE"]) {
      expect(source).toContain(basis);
    }
    expect(source).toContain("ticketAdult");
    expect(source).toContain("ticketChild");
    expect(source).toContain("ticketForeigner");
  });

  it("keeps day-wise opening hours with copy-to-all and overnight windows", () => {
    expect(source).toContain("Copy to all days");
    expect(source).toContain("overnight");
    expect(source).toContain("(next day)");
    expect(source).toContain('"Monday"');
    expect(source).toContain('"Sunday"');
  });

  it("keeps typical visit duration (5-600 minutes) and best-time fields", () => {
    expect(source).toContain("estimatedDurationMinutes");
    expect(source).toContain("Best season / months");
    expect(source).toContain("bestTimeReason");
  });

  it("includes the new canonical fields", () => {
    expect(source).toContain("canonicalName");
    expect(source).toContain("district");
    expect(source).toContain("imagePageUrl");
    expect(source).toContain("imageSource");
    expect(source).toContain("imageAuthor");
    expect(source).toContain("imageLicense");
  });
});