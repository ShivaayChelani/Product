import type { ReactNode } from "react";
import type { Place } from "@/types";

export type PlacesFilters = {
  search?: string;
  status?: string;
  category?: string;
  state?: string;
  city?: string;
  verified?: "" | "verified" | "unverified";
  featured?: "" | "featured" | "not";
  source?: string;
  missingImages?: boolean;
  missingDescription?: boolean;
  hiddenGemsOnly?: boolean;
  touristOnly?: boolean;
};

export const SEARCH_MIN_LENGTH = 2;

export function effectivePlaceSearch(raw?: string): string | undefined {
  const q = (raw || "").trim();
  return q.length >= SEARCH_MIN_LENGTH ? q : undefined;
}

export function applyClientFilters(places: Place[], filters: PlacesFilters): Place[] {
  return places.filter((p) => {
    if (filters.verified === "verified" && (p.verificationLevel ?? 0) < 2 && p.status !== "APPROVED") return false;
    if (filters.verified === "unverified" && (p.verificationLevel ?? 0) >= 2 && p.status === "APPROVED") return false;
    if (filters.featured === "featured" && !(p.editorialPriority && p.editorialPriority >= 3)) return false;
    if (filters.featured === "not" && p.editorialPriority && p.editorialPriority >= 3) return false;
    if (filters.source && p.source !== filters.source) return false;
    if (filters.missingImages && p.images?.length > 0) return false;
    if (filters.missingDescription && p.description?.trim()) return false;
    if (filters.hiddenGemsOnly && !(p.hiddenGemScore && p.hiddenGemScore > 0)) return false;
    return true;
  });
}

export function highlightMatch(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-100 px-0.5 text-foreground">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function filtersToSearchParams(filters: PlacesFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.state) p.set("state", filters.state);
  if (filters.city) p.set("city", filters.city);
  if (filters.category) p.set("category", filters.category);
  if (filters.status) p.set("status", filters.status);
  if (filters.search) p.set("search", filters.search);
  if (filters.source) p.set("source", filters.source);
  if (filters.verified) p.set("verified", filters.verified);
  if (filters.featured) p.set("featured", filters.featured);
  if (filters.missingImages) p.set("missingImages", "1");
  if (filters.missingDescription) p.set("missingDescription", "1");
  if (filters.hiddenGemsOnly) p.set("hiddenGems", "1");
  if (filters.touristOnly === false) p.set("touristOnly", "0");
  return p;
}

export function searchParamsToFilters(params: URLSearchParams): PlacesFilters {
  return {
    state: params.get("state") || "",
    city: params.get("city") || "",
    category: params.get("category") || "",
    status: params.get("status") || "",
    search: params.get("search") || "",
    source: params.get("source") || "",
    verified: (params.get("verified") as PlacesFilters["verified"]) || "",
    featured: (params.get("featured") as PlacesFilters["featured"]) || "",
    missingImages: params.get("missingImages") === "1",
    missingDescription: params.get("missingDescription") === "1",
    hiddenGemsOnly: params.get("hiddenGems") === "1",
    touristOnly: params.get("touristOnly") !== "0",
  };
}

export function hasClientFilters(filters: PlacesFilters): boolean {
  // verified/featured are applied server-side via /admin/places
  return !!(
    filters.source ||
    filters.missingImages ||
    filters.missingDescription ||
    filters.hiddenGemsOnly
  );
}

export function pageAfterSearchChange(previousSearch: string, nextSearch: string, currentPage: number): number {
  return (previousSearch || "") === (nextSearch || "") ? currentPage : 1;
}

export function sortPlaces(places: Place[], key: string, dir: "asc" | "desc"): Place[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...places].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[key];
    const bv = (b as unknown as Record<string, unknown>)[key];
    if (key === "editorialPriority" || key === "priority") {
      return mul * (Number(a.editorialPriority ?? 0) - Number(b.editorialPriority ?? 0));
    }
    if (key === "verificationLevel") {
      return mul * (Number(av ?? 0) - Number(bv ?? 0));
    }
    if (key === "createdAt" || key === "updatedAt") {
      return mul * (new Date(String(av)).getTime() - new Date(String(bv)).getTime());
    }
    return mul * String(av ?? "").localeCompare(String(bv ?? ""));
  });
}
