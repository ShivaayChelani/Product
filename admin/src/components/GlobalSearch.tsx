"use client";

import React, { useEffect, useState, useRef } from "react";
import { Search, Command, X, MapPin, Users, Store } from "lucide-react";
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100"
      >
        <Search size={16} />
        <span className="hidden sm:inline">Search everywhere...</span>
        <span className="flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-xs font-semibold shadow-sm border border-gray-200">
          <Command size={10} /> K
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-32 px-4 pb-20">
      <div 
        className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" 
        onClick={() => setIsOpen(false)}
      />
      
      <div className="relative w-full max-w-2xl transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all">
        <div className="flex items-center border-b border-gray-100 px-4 py-3">
          <Search className="text-gray-400" size={20} />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:outline-none"
            placeholder="Search users, vendors, places, or transactions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-gray-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            </div>
          ) : query && results.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No results found for "{query}"
            </div>
          ) : !query ? (
            <div className="p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
              Recent Searches
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((item, i) => (
                <button
                  key={i}
                  onClick={() => navigateToResult(item)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-gray-50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                    {item.type === 'user' && <Users size={14} />}
                    {item.type === 'vendor' && <Store size={14} />}
                    {item.type === 'place' && <MapPin size={14} />}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{item.title}</div>
                    <div className="text-xs text-gray-500">{item.subtitle}</div>
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
