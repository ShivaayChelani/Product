import { describe, expect, it } from "vitest";
import {
  effectivePlaceSearch,
  filtersToSearchParams,
  pageAfterSearchChange,
  searchParamsToFilters,
  sortPlaces,
} from "./utils";
import type { Place } from "@/types";

function place(partial: Partial<Place> & Pick<Place, "id" | "name">): Place {
  return {
    slug: partial.slug || partial.id,
    description: "",
    category: "waterfall",
    latitude: 23,
    longitude: 79,
    images: [],
    tags: [],
    status: "APPROVED",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    country: "India",
    isHiddenGem: false,
    reviewCount: 0,
    verificationLevel: 2,
    submittedBy: { id: "u1", name: "Admin" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    editorialPriority: 3,
    ...partial,
  };
}

describe("admin places search helpers", () => {
  it("requires 2 characters after trim", () => {
    expect(effectivePlaceSearch("")).toBeUndefined();
    expect(effectivePlaceSearch(" ")).toBeUndefined();
    expect(effectivePlaceSearch("D")).toBeUndefined();
    expect(effectivePlaceSearch("Dh")).toBe("Dh");
    expect(effectivePlaceSearch("  Dhuandhar  ")).toBe("Dhuandhar");
  });

  it("preserves filters when search is omitted from URL params", () => {
    const params = filtersToSearchParams({
      state: "Madhya Pradesh",
      category: "waterfall",
      touristOnly: true,
    });
    expect(params.get("state")).toBe("Madhya Pradesh");
    expect(params.get("category")).toBe("waterfall");
    expect(params.get("search")).toBeNull();
  });

  it("round-trips search with other filters", () => {
    const params = filtersToSearchParams({
      search: "Jabalpur",
      state: "Madhya Pradesh",
      category: "waterfall",
      touristOnly: true,
    });
    const parsed = searchParamsToFilters(params);
    expect(parsed.search).toBe("Jabalpur");
    expect(parsed.state).toBe("Madhya Pradesh");
    expect(parsed.category).toBe("waterfall");
  });

  it("resets pagination when search changes and keeps page when it does not", () => {
    expect(pageAfterSearchChange("", "Jabalpur", 4)).toBe(1);
    expect(pageAfterSearchChange("Jabalpur", "", 4)).toBe(1);
    expect(pageAfterSearchChange("Jabalpur", "Jabalpur", 3)).toBe(3);
  });
});

describe("admin places priority sort", () => {
  const rows = [
    place({ id: "a", name: "A", editorialPriority: 5 }),
    place({ id: "b", name: "B", editorialPriority: 1 }),
    place({ id: "c", name: "C", editorialPriority: 3 }),
  ];

  it("sorts priority ascending 1 → 3 → 5 from real editorialPriority", () => {
    const sorted = sortPlaces(rows, "editorialPriority", "asc");
    expect(sorted.map((p) => p.editorialPriority)).toEqual([1, 3, 5]);
    expect(sorted.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts priority descending 5 → 3 → 1 from real editorialPriority", () => {
    const sorted = sortPlaces(rows, "editorialPriority", "desc");
    expect(sorted.map((p) => p.editorialPriority)).toEqual([5, 3, 1]);
  });

  it("does not invent priority values", () => {
    const missing = sortPlaces(
      [place({ id: "x", name: "X", editorialPriority: undefined })],
      "editorialPriority",
      "asc",
    );
    expect(missing[0].editorialPriority).toBeUndefined();
  });
});
