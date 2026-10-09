"use client";

import React, { useEffect, useState, useRef } from "react";
import { Search, X, MapPin, Users, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { adminGlobalSearch } from "@/services/search";

type SearchResultItem = {
  type: "user" | "vendor" | "place";
  id: string;
  title: string;
  subtitle: string;
};

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await adminGlobalSearch(query);
        const items: SearchResultItem[] = [
          ...(data.places || []).map((p) => ({
            type: "place" as const,
            id: p.id,
            title: p.name,
            subtitle: [p.city, p.state].filter(Boolean).join(", ") || p.publicPlaceId || "Place",
          })),
          ...(data.users || []).map((u) => ({
            type: "user" as const,
            id: u.id,
            title: u.name || u.email,
            subtitle: u.email,
          })),
          ...(data.vendors || []).map((v) => ({
            type: "vendor" as const,
            id: v.id,
            title: v.businessName,
            subtitle: [v.city, v.status].filter(Boolean).join(" · "),
          })),
        ];
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const navigateToResult = (item: SearchResultItem) => {
    setIsOpen(false);
    if (item.type === "user") router.push(`/dashboard/users?id=${encodeURIComponent(item.id)}`);
    if (item.type === "vendor") router.push(`/dashboard/vendors/${encodeURIComponent(item.id)}`);
    if (item.type === "place") router.push(`/dashboard/places?id=${encodeURIComponent(item.id)}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pb-20 pt-20 sm:pt-32">
      <button
        type="button"
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
        aria-label="Close search"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="relative w-full max-w-2xl transform overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
      >
        <div className="flex items-center border-b border-border px-4 py-3">
          <Search className="text-muted-foreground" size={20} />
          <input
            ref={inputRef}
            type="search"
            className="w-full bg-transparent px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            placeholder="Search users, vendors, places..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search users, vendors, and places"
          />
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close search"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : query && results.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No results found for &quot;{query}&quot;
            </div>
          ) : !query ? (
            <div className="p-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Type to search users, vendors, and places
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((item, i) => (
                <button
                  key={`${item.type}-${item.id}-${i}`}
                  type="button"
                  onClick={() => navigateToResult(item)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-muted"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    {item.type === "user" && <Users size={14} />}
                    {item.type === "vendor" && <Store size={14} />}
                    {item.type === "place" && <MapPin size={14} />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{item.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
