import { useCallback, useEffect, useRef, useState } from 'react';
import { searchApi } from '../../../services/api/search';
import type { PlaceResponse } from '../../../services/api/places';
import { DEV_FLAGS } from '../../../config/devFlags';
import { MORE_DESTINATIONS, POPULAR_DESTINATIONS } from '../constants';

export type DestinationSuggestion = {
  id: string;
  label: string;
  /** Value written into the destination field when selected */
  fullLabel: string;
  sub?: string;
  kind: 'city';
};

function citySuggestion(city: string, state?: string | null): DestinationSuggestion {
  const trimmedCity = city.trim();
  const trimmedState = state?.trim();
  const fullLabel = trimmedState ? `${trimmedCity}, ${trimmedState}` : trimmedCity;
  return {
    id: `city-${fullLabel.toLowerCase()}`,
    label: trimmedCity,
    fullLabel,
    sub: trimmedState || 'City',
    kind: 'city',
  };
}

function dedupeSuggestions(items: DestinationSuggestion[]): DestinationSuggestion[] {
  const seen = new Set<string>();
  const out: DestinationSuggestion[] = [];
  for (const item of items) {
    const key = item.fullLabel.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function scoreCity(city: string, state: string | undefined, q: string): number {
  const ql = q.toLowerCase();
  const c = city.toLowerCase();
  const s = (state || '').toLowerCase();
  const full = state ? `${c}, ${s}` : c;
  if (c === ql || full === ql) return 120;
  if (c.startsWith(ql)) return 100;
  if (full.startsWith(ql)) return 95;
  if (c.includes(ql)) return 80;
  if (s.startsWith(ql)) return 70;
  if (s.includes(ql)) return 55;
  return 10;
}

function matchesCityQuery(city: string, state: string | undefined, q: string): boolean {
  const ql = q.toLowerCase();
  const c = city.toLowerCase();
  const s = (state || '').toLowerCase();
  return c.includes(ql) || c.startsWith(ql) || s.includes(ql) || s.startsWith(ql);
}

async function fetchCitiesFromPlaces(q: string, limit: number): Promise<DestinationSuggestion[]> {
  if (!DEV_FLAGS.USE_SERVER_API) return [];
  try {
    const searchRes = await searchApi.search({ q, limit: 40, sort: 'relevance' });
    const places = (searchRes?.data as PlaceResponse[]) || [];
    const seen = new Set<string>();
    const out: DestinationSuggestion[] = [];

    for (const p of places) {
      const city = p.city?.trim();
      if (!city || !matchesCityQuery(city, p.state?.trim(), q)) continue;
      const key = `${city}|${p.state || ''}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(citySuggestion(city, p.state));
    }

    return out.sort((a, b) => {
      const [, aState] = a.fullLabel.split(', ');
      const [, bState] = b.fullLabel.split(', ');
      return scoreCity(b.label, bState, q) - scoreCity(a.label, aState, q);
    }).slice(0, limit);
  } catch {
    return [];
  }
}

async function fetchCitiesFromNominatim(q: string, limit: number): Promise<DestinationSuggestion[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=in&limit=${limit}&featuretype=city`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'PalSafar-Mobile/1.0' } },
    );
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any) => {
      const addr = item.address || {};
      const city =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.municipality ||
        addr.county ||
        item.name ||
        '';
      const state = addr.state || '';
      return citySuggestion(String(city), state);
    });
  } catch {
    return [];
  }
}

function fetchCitiesFromConstants(q: string): DestinationSuggestion[] {
  const ql = q.toLowerCase();
  const names = [
    ...POPULAR_DESTINATIONS.map(d => d.name),
    ...MORE_DESTINATIONS,
  ];
  return names
    .filter(name => name.toLowerCase().includes(ql) || ql.includes(name.toLowerCase()))
    .map(name => citySuggestion(name));
}

async function fetchCitySuggestions(q: string, limit: number): Promise<DestinationSuggestion[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const [fromConstants, fromNominatim, fromPlaces] = await Promise.all([
    Promise.resolve(fetchCitiesFromConstants(trimmed)),
    fetchCitiesFromNominatim(trimmed, limit),
    fetchCitiesFromPlaces(trimmed, limit),
  ]);

  const combined = dedupeSuggestions([...fromConstants, ...fromNominatim, ...fromPlaces])
    .sort((a, b) => {
      const aState = a.fullLabel.includes(', ') ? a.fullLabel.split(', ').slice(1).join(', ') : undefined;
      const bState = b.fullLabel.includes(', ') ? b.fullLabel.split(', ').slice(1).join(', ') : undefined;
      return scoreCity(b.label, bState, trimmed) - scoreCity(a.label, aState, trimmed);
    });

  if (combined.length === 0) {
    return [{
      id: `typed-${trimmed}`,
      label: trimmed,
      fullLabel: trimmed,
      sub: 'Custom city',
      kind: 'city',
    }];
  }

  return combined.slice(0, limit);
}

export function useDestinationAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const req = useRef(0);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    const id = ++req.current;
    setLoading(true);
    try {
      const cities = await fetchCitySuggestions(trimmed, 10);
      if (id !== req.current) return;
      setSuggestions(cities);
    } catch {
      if (id === req.current) setSuggestions([]);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(query), 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, search]);

  return { suggestions, loading, clear: () => setSuggestions([]) };
}
