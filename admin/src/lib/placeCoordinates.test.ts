import { describe, expect, it } from "vitest";
import { parseAndValidateCoordinates } from "./placeCoordinates";

describe("parseAndValidateCoordinates", () => {
  it("parses a valid pair and preserves precision", () => {
    const res = parseAndValidateCoordinates(27.175123, 78.042198);
    expect(res).toEqual({ ok: true, latitude: 27.175123, longitude: 78.042198 });
  });

  it("parses numeric strings", () => {
    const res = parseAndValidateCoordinates("27.1751", "78.0421");
    expect(res).toEqual({ ok: true, latitude: 27.1751, longitude: 78.0421 });
  });

  it("handles 0,0 as an explicit error (never a silent fix)", () => {
    const res = parseAndValidateCoordinates(0, 0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/0,0/);
  });

  it("rejects out-of-range latitude", () => {
    expect(parseAndValidateCoordinates(91, 78).ok).toBe(false);
    expect(parseAndValidateCoordinates(-91, 78).ok).toBe(false);
  });

  it("rejects out-of-range longitude", () => {
    expect(parseAndValidateCoordinates(27, 181).ok).toBe(false);
    expect(parseAndValidateCoordinates(27, -181).ok).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(parseAndValidateCoordinates(Number.NaN, 78).ok).toBe(false);
    expect(parseAndValidateCoordinates(27, Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(parseAndValidateCoordinates("Infinity", 78).ok).toBe(false);
  });

  it("rejects empty and whitespace input", () => {
    expect(parseAndValidateCoordinates("", "78.0421").ok).toBe(false);
    expect(parseAndValidateCoordinates(27.1751, "   ").ok).toBe(false);
    expect(parseAndValidateCoordinates(null, null).ok).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(parseAndValidateCoordinates("not-a-number", 78).ok).toBe(false);
    expect(parseAndValidateCoordinates("27,1751", "78.0421").ok).toBe(false);
  });
});