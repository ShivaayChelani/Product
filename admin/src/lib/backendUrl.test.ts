import { describe, expect, it } from "vitest";
import {
  normalizeBackendApiBaseUrl,
  assertPreviewApiIsolation,
  isProductionApiUrl,
} from "./backendUrl";

describe("normalizeBackendApiBaseUrl", () => {
  it("appends /api/v1 when only the origin is configured", () => {
    expect(normalizeBackendApiBaseUrl("https://product-jiet.onrender.com")).toBe(
      "https://product-jiet.onrender.com/api/v1",
    );
  });

  it("keeps an existing /api/v1 suffix", () => {
    expect(
      normalizeBackendApiBaseUrl("https://product-jiet.onrender.com/api/v1/"),
    ).toBe("https://product-jiet.onrender.com/api/v1");
  });
});

describe("Vercel preview API isolation", () => {
  it("detects the production API host", () => {
    expect(isProductionApiUrl("https://product-jiet.onrender.com/api/v1")).toBe(true);
    expect(isProductionApiUrl("https://palsafar-api-staging.onrender.com/api/v1")).toBe(false);
  });

  it("fails closed when a preview deployment points at production", () => {
    expect(() =>
      assertPreviewApiIsolation("preview", "https://product-jiet.onrender.com/api/v1"),
    ).toThrow(/must not use the production/i);
  });

  it("fails closed when a preview deployment has no API_URL", () => {
    expect(() => assertPreviewApiIsolation("preview", undefined)).toThrow(/requires API_URL/i);
  });

  it("allows preview when API_URL is non-production", () => {
    expect(() =>
      assertPreviewApiIsolation("preview", "https://palsafar-api-staging.onrender.com/api/v1"),
    ).not.toThrow();
  });

  it("does not constrain production or local environments", () => {
    expect(() =>
      assertPreviewApiIsolation("production", "https://product-jiet.onrender.com/api/v1"),
    ).not.toThrow();
    expect(() => assertPreviewApiIsolation(undefined, undefined)).not.toThrow();
  });
});
