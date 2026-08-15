"use client";

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Search, Check, X as XIcon, Edit, Trash2, MapPin,
  RefreshCw, ChevronRight, Home, Upload,
} from "lucide-react";
import {
  getPlaces, getCityClusters, approvePlace, rejectPlace, deletePlace,
  fetchAllPlaces,
} from "@/services/places";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import PlaceForm from "@/components/PlaceForm";
import PlaceImportModal from "@/components/PlaceImportModal";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import PlaceDetailDrawer from "./PlaceDetailDrawer";
import {
  INDIAN_STATES, PLACE_CATEGORIES, PAGE_SIZE,
} from "./constants";
import {
  applyClientFilters, highlightMatch,
  filtersToSearchParams, searchParamsToFilters, hasClientFilters, sortPlaces,
  effectivePlaceSearch, SEARCH_MIN_LENGTH, pageAfterSearchChange,
  type PlacesFilters,
} from "./utils";
import type { Place } from "@/types";

type CityOption = { city: string; state: string; placeCount: number };

function PlacesWorkspaceContent() {
  const { notify } = useNotification();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [urlReady, setUrlReady] = useState(false);
  const [filters, setFilters] = useState<PlacesFilters>({ touristOnly: true });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);

  const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
  const [cityOptionsLoading, setCityOptionsLoading] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [detailPlaceId, setDetailPlaceId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; action: () => void;
  }>({ open: false, title: "", message: "", action: () => {} });

  const [placeForm, setPlaceForm] = useState<{ open: boolean; place: Place | null }>({ open: false, place: null });
  const [importOpen, setImportOpen] = useState(false);

  const isCityWorkspace = !!(filters.city && filters.state);
  const serverFilters = useMemo(() => ({
    status: filters.status || undefined,
    category: filters.category || undefined,
    state: filters.state || undefined,
    city: filters.city || undefined,
    search: effectivePlaceSearch(filters.search),
    touristOnly: filters.touristOnly !== false,
    verified: filters.verified || undefined,
    featured: filters.featured || undefined,
  }), [filters]);

  const fetchSeq = useRef(0);
  const urlInitRef = useRef(false);

  useEffect(() => {
    if (urlInitRef.current) return;
    urlInitRef.current = true;
    const parsed = searchParamsToFilters(searchParams);
    setFilters((f) => ({ ...f, ...parsed, touristOnly: parsed.touristOnly !== false }));
    if (parsed.search) setSearchInput(parsed.search);
    setUrlReady(true);
  }, [searchParams]);

  useEffect(() => {
    if (!urlReady) return;
    const t = setTimeout(() => {
      const q = searchInput.trim();
      setFilters((f) => ((f.search || "") === q ? f : { ...f, search: q }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, urlReady]);

  const committedSearch = filters.search || "";
  const prevCommittedSearch = useRef(committedSearch);
  useEffect(() => {
    if (!urlReady) return;
    if (prevCommittedSearch.current === committedSearch) return;
    const previous = prevCommittedSearch.current;
    prevCommittedSearch.current = committedSearch;
    setPage((p) => pageAfterSearchChange(previous, committedSearch, p));
  }, [committedSearch, urlReady]);

  useEffect(() => {
    if (!urlReady) return;
    const params = filtersToSearchParams(filters);
    const qs = params.toString();
    const target = qs ? `/dashboard/places?${qs}` : "/dashboard/places";
    if (`${window.location.pathname}${window.location.search}` !== target) {
      router.replace(target, { scroll: false });
    }
  }, [filters, urlReady, router]);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setDetailPlaceId(id);
    };
    window.addEventListener("places:open-detail", handler);
    return () => window.removeEventListener("places:open-detail", handler);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const id = searchParams.get("id");
    if (id) setDetailPlaceId(id);
  }, [searchParams, urlReady]);

  const syncUrl = useCallback((next: PlacesFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const fetchCityOptions = useCallback(async () => {
    if (!filters.state) { setCityOptions([]); return; }
    setCityOptionsLoading(true);
    try {
      const res = await getCityClusters({ state: filters.state, limit: 500, touristOnly: filters.touristOnly !== false, placesPerCity: 1 });
      setCityOptions(
        res.data.filter((c) => c.city && c.city !== "(unknown city)")
          .map((c) => ({ city: c.city, state: c.state, placeCount: c.totalInCity || c.placeCount }))
          .sort((a, b) => a.city.localeCompare(b.city)),
      );
    } catch { setCityOptions([]); }
    finally { setCityOptionsLoading(false); }
  }, [filters.state, filters.touristOnly]);

  const fetchPlaces = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const useLocal = (filters.city || filters.state) && hasClientFilters(filters);
      const sortParam = sortKey === "editorialPriority" ? "priority" : sortKey;

      if (useLocal) {
        const all = await fetchAllPlaces({ ...serverFilters, sort: sortParam, sortDir }, 10);
        if (seq !== fetchSeq.current) return;
        const filtered = applyClientFilters(all, filters);
        const sorted = sortPlaces(filtered, sortKey, sortDir);
        const tp = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
        setTotalPages(tp);
        setTotalRecords(sorted.length);
        setHasNext(page < tp);
        setHasPrev(page > 1);
        setPlaces(sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
      } else {
        const res = await getPlaces({
          page,
          limit: PAGE_SIZE,
          ...serverFilters,
          sort: sortParam,
          sortDir,
        });
        if (seq !== fetchSeq.current) return;
        let rows = res.data;
        if (hasClientFilters(filters)) rows = applyClientFilters(rows, filters);
        setPlaces(rows);
        setTotalPages(res.pagination.totalPages);
        setTotalRecords(res.pagination.total);
        setHasNext(res.pagination.hasNext);
        setHasPrev(res.pagination.hasPrev);
      }
    } catch (err: unknown) {
      if (seq !== fetchSeq.current) return;
      setPlaces([]);
      setLoadError((err as { message?: string })?.message || "Failed to load places");
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [page, filters, serverFilters, sortKey, sortDir]);

  useEffect(() => { if (urlReady) void fetchCityOptions(); }, [fetchCityOptions, urlReady]);
  useEffect(() => { if (urlReady) void fetchPlaces(); }, [fetchPlaces, urlReady]);

  useEffect(() => {
    if (!searchInput.trim() || searchInput.trim().length < SEARCH_MIN_LENGTH) { setSearchSuggestions([]); return; }
    const q = searchInput.toLowerCase();
    const fromCities = cityOptions.filter((c) => c.city.toLowerCase().includes(q)).map((c) => c.city).slice(0, 4);
    const fromPlaces = places.filter((p) => p.name.toLowerCase().includes(q)).map((p) => p.name).slice(0, 4);
    setSearchSuggestions([...new Set([...fromPlaces, ...fromCities])].slice(0, 8));
  }, [searchInput, cityOptions, places]);

  const refreshAll = useCallback(() => { void fetchPlaces(); void fetchCityOptions(); }, [fetchPlaces, fetchCityOptions]);

  const resetFilters = () => {
    setSearchInput("");
    syncUrl({ touristOnly: true });
  };

  const clearSearch = () => {
    setSearchInput("");
    setFilters((f) => ({ ...f, search: "" }));
    setPage(1);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try { await approvePlace(id); refreshAll(); notify("success", "Place approved"); }
    catch { notify("error", "Failed to approve"); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try { await rejectPlace(id); refreshAll(); notify("success", "Place rejected"); }
    catch { notify("error", "Failed to reject"); }
    finally { setActionLoading(null); }
  };

  const handleDelete = (id: string) => {
    setConfirmDialog({
      open: true, title: "Delete Place", message: "This action cannot be undone.",
      action: async () => {
        setActionLoading(id);
        try { await deletePlace(id); notify("success", "Deleted"); }
        catch { notify("error", "Delete failed"); }
        setConfirmDialog((p) => ({ ...p, open: false }));
        setActionLoading(null);
        refreshAll();
      },
    });
  };

  const allColumns: Column<Place & Record<string, unknown>>[] = [
    {
      key: "name", header: "Name", sortable: true,
      exportValue: (i) => i.name,
      render: (item) => (
        <div className="flex items-center gap-3 min-w-[180px]">
          {item.images?.[0] ? (
            <img src={item.images[0] as string} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><MapPin size={16} className="text-muted-foreground" /></div>
          )}
          <button type="button" onClick={() => setDetailPlaceId(item.id as string)} className="font-medium text-left hover:text-emerald-600 hover:underline">
            {highlightMatch(String(item.name), searchInput)}
          </button>
        </div>
      ),
    },
    { key: "category", header: "Category", sortable: true, exportValue: (i) => i.category, render: (i) => <span className="capitalize">{String(i.category).replace(/_/g, " ")}</span> },
    { key: "city", header: "City", sortable: true, exportValue: (i) => i.city },
    { key: "state", header: "State", sortable: true, exportValue: (i) => i.state },
    {
      key: "editorialPriority",
      header: "Priority Order",
      sortable: true,
      className: "whitespace-nowrap",
      exportValue: (i) => i.editorialPriority ?? "",
      render: (i) => (
        <span className="tabular-nums text-foreground">
          {typeof i.editorialPriority === "number" ? i.editorialPriority : "—"}
        </span>
      ),
    },
    { key: "status", header: "Status", exportValue: (i) => i.status, render: (i) => <StatusBadge status={i.status as string} /> },
    {
      key: "coordinates", header: "Coordinates",
      exportValue: (i) => `${i.latitude},${i.longitude}`,
      render: (i) => (
        <a href={`https://www.google.com/maps?q=${i.latitude},${i.longitude}`} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:underline">
          {Number(i.latitude).toFixed(4)}, {Number(i.longitude).toFixed(4)}
        </a>
      ),
    },
    {
      key: "actions", header: "Actions",
      render: (item) => (
        <div className="flex items-center gap-1">
          {item.status === "PENDING" && (
            <>
              <button onClick={() => handleApprove(item.id as string)} disabled={actionLoading === item.id} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" title="Approve"><Check size={16} /></button>
              <button onClick={() => handleReject(item.id as string)} disabled={actionLoading === item.id} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Reject"><XIcon size={16} /></button>
            </>
          )}
          <button onClick={() => setPlaceForm({ open: true, place: item as Place })} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50" title="Edit"><Edit size={16} /></button>
          <button onClick={() => handleDelete(item.id as string)} disabled={actionLoading === item.id} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link href="/dashboard" className="flex items-center rounded-md p-1 hover:bg-muted hover:text-foreground"><Home size={14} /></Link>
          <ChevronRight size={14} className="opacity-50" />
          <span>Tourism</span>
          <ChevronRight size={14} className="opacity-50" />
          <Link href="/dashboard/places" className="hover:text-foreground">Places</Link>
          {filters.state && (<><ChevronRight size={14} className="opacity-50" /><span className={filters.city ? "" : "font-medium text-foreground"}>{filters.state}</span></>)}
          {filters.city && (<><ChevronRight size={14} className="opacity-50" /><span className="font-medium text-foreground">{filters.city}</span></>)}
        </nav>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isCityWorkspace ? `${filters.city}, ${filters.state}` : "Places"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isCityWorkspace
                ? `City management workspace · ${totalRecords.toLocaleString()} tourist destinations`
                : totalRecords > 0
                  ? `${totalRecords.toLocaleString()} tourist destinations across India`
                  : "Single source of truth for tourism place management"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={refreshAll} className="admin-btn-secondary" aria-label="Refresh"><RefreshCw size={16} /> Refresh</button>
            <button type="button" onClick={() => setImportOpen(true)} className="admin-btn-secondary inline-flex items-center gap-2">
              <Upload size={16} /> Import CSV / Excel
            </button>
          </div>
        </div>
      </div>

      <div className="admin-card mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <FilterSelect label="State" value={filters.state || ""} onChange={(v) => syncUrl({ ...filters, state: v, city: "" })} options={INDIAN_STATES} placeholder="All States" />
          <FilterSelect label="City" value={filters.city || ""} onChange={(v) => syncUrl({ ...filters, city: v })} options={cityOptions.map((c) => c.city)} placeholder={cityOptionsLoading ? "Loading…" : filters.state ? "All Cities" : "Select state"} disabled={!filters.state && !cityOptions.length} />
          <FilterSelect label="Category" value={filters.category || ""} onChange={(v) => syncUrl({ ...filters, category: v })} options={PLACE_CATEGORIES} placeholder="All Categories" />
          <FilterSelect label="Verified" value={filters.verified || ""} onChange={(v) => syncUrl({ ...filters, verified: v as PlacesFilters["verified"] })} options={["verified", "unverified"]} placeholder="All" />
          <FilterSelect label="Featured" value={filters.featured || ""} onChange={(v) => syncUrl({ ...filters, featured: v as PlacesFilters["featured"] })} options={["featured", "not"]} placeholder="All" />
          <FilterSelect label="Status" value={filters.status || ""} onChange={(v) => syncUrl({ ...filters, status: v })} options={["PENDING", "APPROVED", "REJECTED"]} placeholder="All Status" />
          <div className="relative sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Search by name, city or state..."
                className="admin-input w-full pl-8 pr-8"
                aria-label="Search by name, city or state"
                autoComplete="off"
              />
              {searchInput.length > 0 && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <XIcon size={14} />
                </button>
              )}
              {showSuggestions && searchSuggestions.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg" role="listbox">
                  {searchSuggestions.map((s) => (
                    <li key={s}>
                      <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onMouseDown={() => { setSearchInput(s); setShowSuggestions(false); }}>
                        {highlightMatch(s, searchInput)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Search by place name, city or state.</p>
          </div>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={filters.touristOnly !== false} onChange={(e) => syncUrl({ ...filters, touristOnly: e.target.checked })} className="rounded border-border text-emerald-600" />
          Tourist destinations only
        </label>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setPlaceForm({ open: true, place: null })} className="admin-btn-primary"><Plus size={16} /> Add Place</button>
      </div>

      {loadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{loadError}</span>
          <button type="button" onClick={refreshAll} className="font-medium underline">Retry</button>
        </div>
      )}

      {!loading && places.length === 0 && !loadError ? (
        <EmptyState
          icon={MapPin}
          title={effectivePlaceSearch(filters.search) ? "No places match your search" : "No places found"}
          description={
            effectivePlaceSearch(filters.search)
              ? `No places found for “${filters.search?.trim()}”. Try a different name, city, or state.`
              : "Try changing filters or add a new place."
          }
          action={
            <div className="flex gap-2">
              <button type="button" onClick={resetFilters} className="admin-btn-secondary">Clear Filters</button>
              <button type="button" onClick={() => setImportOpen(true)} className="admin-btn-secondary inline-flex items-center gap-2"><Upload size={16} /> Import</button>
              <button type="button" onClick={() => setPlaceForm({ open: true, place: null })} className="admin-btn-primary"><Plus size={16} /> Add New Place</button>
            </div>
          }
        />
      ) : (
        <DataTable
          columns={allColumns}
          data={places as (Place & Record<string, unknown>)[]}
          loading={loading}
          page={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          hasNext={hasNext}
          hasPrev={hasPrev}
          onPageChange={setPage}
          pageSize={PAGE_SIZE}
          showFirstLast
          onSort={handleSort}
          sortKey={sortKey}
          sortDir={sortDir}
          emptyMessage="No places match your filters"
        />
      )}

      <PlaceDetailDrawer
        placeId={detailPlaceId}
        onClose={() => setDetailPlaceId(null)}
        onEdit={(p) => { setDetailPlaceId(null); setPlaceForm({ open: true, place: p }); }}
        onRefresh={refreshAll}
        notify={notify}
      />

      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message} onConfirm={confirmDialog.action} onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))} />
      <PlaceForm key={placeForm.place?.id || "new"} open={placeForm.open} place={placeForm.place} onClose={() => setPlaceForm({ open: false, place: null })} onSaved={refreshAll} />
      <PlaceImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={refreshAll} notify={notify} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="admin-input w-full" aria-label={label}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
      </select>
    </div>
  );
}

export default function PlacesPage() {
  return (
    <Suspense fallback={<SkeletonCards count={4} />}>
      <PlacesWorkspaceContent />
    </Suspense>
  );
}
