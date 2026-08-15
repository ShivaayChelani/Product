import { describe, expect, it } from "vitest";
import { normalizeBackendApiBaseUrl } from "./backendUrl";

describe("normalizeBackendApiBaseUrl", () => {
  it("appends /api/v1 when only the origin is configured", () => {
    expect(normalizeBackendApiBaseUrl("https://palsafar-api-fh7i.onrender.com")).toBe(
      "https://palsafar-api-fh7i.onrender.com/api/v1",
    );
  });

  it("keeps an existing /api/v1 suffix", () => {
    expect(
      normalizeBackendApiBaseUrl("https://palsafar-api-fh7i.onrender.com/api/v1/"),
    ).toBe("https://palsafar-api-fh7i.onrender.com/api/v1");
  });
});
