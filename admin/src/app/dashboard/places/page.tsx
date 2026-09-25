"use client";

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Search, Check, X as XIcon, Edit, Trash2, MapPin,
  RefreshCw, ChevronRight, Upload, CheckSquare, Copy, ListFilter, Download,
} from "lucide-react";
import {
  getPlaces, getCityClusters, approvePlace, rejectPlace, deletePlace,
  fetchAllPlaces, bulkPlaceStatus,
} from "@/services/places";
import { useNotification } from "@/components/Notification";
import DataTable, { exportTableCsv } from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import PlaceForm from "@/components/PlaceForm";
import PlaceImportModal from "@/components/PlaceImportModal";
import PageHeader from "@/components/ui/PageHeader";
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
type PlaceRow = Place & Record<string, unknown>;

function CopyCoords({ place }: { place: PlaceRow }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(`${place.latitude},${place.longitude}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      title="Copy coordinates"
      aria-label="Copy coordinates"
    >
      {copied ? <Check size={11} className="text-primary" /> : <Copy size={11} />}
    </button>
  );
}

function priorityChip(value: unknown) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!n) return <span className="priority-chip">—</span>;
  const tier = n >= 5 ? "priority-5" : n === 4 ? "priority-4" : n === 3 ? "priority-3" : "";
  return <span className={`priority-chip ${tier}`}>{n}</span>;
}

function PlacesWorkspaceContent() {
  const { notify } = useNotification();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [urlReady, setUrlReady] = useState(false);
  const [filters, setFilters] = useState<PlacesFilters>({ touristOnly: true });
  const [searchInput, setSearchInput] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
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
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  const [detailPlaceId, setDetailPlaceId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; action: () => void;
  }>({ open: false, title: "", message: "", action: () => {} });

  const [placeForm, setPlaceForm] = useState<{ open: boolean; place: Place | null }>({ open: false, place: null });
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [searchInput]);

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
    setShowSuggestions(false);
  };

  const pickSuggestion = (s: string) => {
    setSearchInput(s);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (searchSuggestions.length) setActiveSuggestionIndex((i) => Math.min(i + 1, searchSuggestions.length - 1));
      else setShowSuggestions(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (activeSuggestionIndex >= 0 && searchSuggestions[activeSuggestionIndex]) {
        e.preventDefault();
        pickSuggestion(searchSuggestions[activeSuggestionIndex]);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setActiveSuggestionIndex(-1);
    }
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
    try { await rejectPlace(id); refreshAll(); notify("error", "Place rejected"); }
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

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const allPageSelected = places.length > 0 && places.every((p) => selectedIds.has(p.id as string));
  const toggleSelectPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) places.forEach((p) => next.delete(p.id as string));
      else places.forEach((p) => next.add(p.id as string));
      return next;
    });

  const runBulkStatus = (status: "APPROVED" | "REJECTED") => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setConfirmDialog({
      open: true,
      title: `Bulk ${status === "APPROVED" ? "approve" : "reject"} ${ids.length} place${ids.length > 1 ? "s" : ""}?`,
      message: "Each place will be updated individually; failures are reported per place.",
      action: async () => {
        setBulkLoading(true);
        try {
          const res = await bulkPlaceStatus(ids, status);
          notify(res.failed.length ? "error" : "success",
            `${res.succeeded.length} succeeded${res.failed.length ? `, ${res.failed.length} failed` : ""}`);
          setSelectedIds(new Set());
          refreshAll();
        } catch {
          notify("error", "Bulk action failed");
        }
        setConfirmDialog((p) => ({ ...p, open: false }));
        setBulkLoading(false);
      },
    });
  };

  const allColumns: Column<PlaceRow>[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          aria-label="Select page"
          checked={allPageSelected}
          onChange={toggleSelectPage}
          className="h-4 w-4 cursor-pointer rounded border-border accent-primary focus:ring-primary"
        />
      ) as unknown as string,
      skipExport: true,
      className: "w-10",
      render: (item) => (
        <input
          type="checkbox"
          aria-label={`Select ${String(item.name)}`}
          checked={selectedIds.has(item.id as string)}
          onChange={() => toggleSelect(item.id as string)}
          className="h-4 w-4 cursor-pointer rounded border-border accent-primary focus:ring-primary"
        />
      ),
    },
    {
      key: "name", header: "Name", sortable: true,
      className: "admin-sticky-col left min-w-[200px]",
      exportValue: (i) => i.name,
      render: (item) => (
        <div className="flex items-center gap-3">
          {item.images?.[0] ? (
            <img src={item.images[0] as string} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"><MapPin size={14} className="text-muted-foreground" /></div>
          )}
          <div className="min-w-0">
            <button type="button" onClick={() => setDetailPlaceId(item.id as string)} className="block max-w-[220px] truncate text-left font-medium hover:text-primary hover:underline">
              {highlightMatch(String(item.name), searchInput)}
            </button>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium leading-none">
              {Number(item.verificationLevel ?? 0) >= 2 && (
                <span className="rounded-full bg-success/10 px-1.5 py-1 text-success">Verified</span>
              )}
              {Number(item.editorialPriority ?? 0) >= 3 && (
                <span className="rounded-full bg-warning/10 px-1.5 py-1 text-warning">Featured</span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", sortable: true, exportValue: (i) => i.category, render: (i) => <span className="capitalize">{String(i.category).replace(/_/g, " ")}</span> },
    {
      key: "location", header: "Location",
      exportValue: (i) => `${i.city || ""}, ${i.state || ""}`,
      render: (i) => (
        <div className="min-w-[150px]">
          <div className="font-medium text-foreground">{String(i.city || "—")}</div>
          <div className="text-xs text-muted-foreground">{String(i.state || "")}</div>
          {Number.isFinite(Number(i.latitude)) && Number.isFinite(Number(i.longitude)) && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="tabular-nums">{Number(i.latitude).toFixed(4)}, {Number(i.longitude).toFixed(4)}</span>
              <CopyCoords place={i} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: "editorialPriority",
      header: "Priority Order",
      sortable: true,
      className: "whitespace-nowrap",
      exportValue: (i) => i.editorialPriority ?? "",
      render: (i) => (
        priorityChip(i.editorialPriority)
      ),
    },
    { key: "status", header: "Status", exportValue: (i) => i.status, render: (i) => <StatusBadge status={i.status as string} /> },
    {
      key: "actions", header: "Actions",
      className: "admin-sticky-col right",
      render: (item) => (
        <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
          {item.status === "PENDING" && (
            <>
              <button type="button" onClick={() => handleApprove(item.id as string)} disabled={actionLoading === item.id} className="row-action-btn row-action-success" title="Approve" aria-label={`Approve ${String(item.name)}`}><Check size={16} /></button>
              <button type="button" onClick={() => handleReject(item.id as string)} disabled={actionLoading === item.id} className="row-action-btn row-action-danger" title="Reject" aria-label={`Reject ${String(item.name)}`}><XIcon size={16} /></button>
            </>
          )}
          <button type="button" onClick={() => setPlaceForm({ open: true, place: item as Place })} className="row-action-btn row-action-info" title="Edit" aria-label={`Edit ${String(item.name)}`}><Edit size={16} /></button>
          <button type="button" onClick={() => handleDelete(item.id as string)} disabled={actionLoading === item.id} className="row-action-btn row-action-danger" title="Delete" aria-label={`Delete ${String(item.name)}`}><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  const activeChips: { label: string; onRemove: () => void }[] = [];
  if (filters.state) activeChips.push({ label: `State: ${filters.state}`, onRemove: () => syncUrl({ ...filters, state: "", city: "" }) });
  if (filters.city) activeChips.push({ label: `City: ${filters.city}`, onRemove: () => syncUrl({ ...filters, city: "" }) });
  if (filters.category) activeChips.push({ label: `Category: ${filters.category.replace(/_/g, " ")}`, onRemove: () => syncUrl({ ...filters, category: "" }) });
  if (filters.verified) activeChips.push({ label: `Verified: ${filters.verified === "verified" ? "Yes" : "No"}`, onRemove: () => syncUrl({ ...filters, verified: "" }) });
  if (filters.featured) activeChips.push({ label: `Featured: ${filters.featured === "featured" ? "Yes" : "No"}`, onRemove: () => syncUrl({ ...filters, featured: "" }) });
  if (filters.status) activeChips.push({ label: `Status: ${filters.status.replace(/_/g, " ")}`, onRemove: () => syncUrl({ ...filters, status: "" }) });
  if (effectivePlaceSearch(filters.search)) activeChips.push({ label: `Search: ${filters.search?.trim()}`, onRemove: clearSearch });

  const dataRows = places as PlaceRow[];

  return (
    <div className="animate-fade-in">
      <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <span className="rounded-md px-1 py-0.5">Tourism</span>
        <ChevronRight size={14} className="opacity-50" />
        <Link href="/dashboard/places" className="rounded-md px-1 py-0.5 hover:bg-muted hover:text-foreground">Places</Link>
        {filters.state && (<><ChevronRight size={14} className="opacity-50" /><span className={filters.city ? "px-1 py-0.5" : "px-1 py-0.5 font-medium text-foreground"}>{filters.state}</span></>)}
        {filters.city && (<><ChevronRight size={14} className="opacity-50" /><span className="px-1 py-0.5 font-medium text-foreground">{filters.city}</span></>)}
      </nav>

      <PageHeader
        title={isCityWorkspace ? `${filters.city}, ${filters.state}` : "Places"}
        description={
          isCityWorkspace
            ? `City management workspace · ${totalRecords.toLocaleString()} tourist destinations`
            : totalRecords > 0
              ? `${totalRecords.toLocaleString()} tourist destinations across India`
              : "Single source of truth for tourism place management"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={refreshAll} className="admin-btn-secondary admin-btn-icon" aria-label="Refresh" title="Refresh"><RefreshCw size={16} /></button>
            <button type="button" onClick={() => setImportOpen(true)} className="admin-btn-secondary"><Upload size={16} /> Import</button>
            <button type="button" disabled={places.length === 0} onClick={() => exportTableCsv(allColumns, dataRows, "places")} className="admin-btn-secondary"><Download size={16} /> Export</button>
            <button type="button" onClick={() => setPlaceForm({ open: true, place: null })} className="admin-btn-primary"><Plus size={16} /> Add Place</button>
          </div>
        }
      />

      {selectedIds.size > 0 && (
        <div className="admin-card mb-4 flex flex-wrap items-center gap-3 border-primary/20 bg-primary/5 p-3">
          <CheckSquare size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {selectedIds.size} selected
          </span>
          <button type="button" disabled={bulkLoading} onClick={() => runBulkStatus("APPROVED")} className="admin-btn-primary">
            {bulkLoading ? "Working…" : (<><Check size={14} /> Approve selected</>)}
          </button>
          <button type="button" disabled={bulkLoading} onClick={() => runBulkStatus("REJECTED")} className="admin-btn-danger">
            <XIcon size={14} /> Reject selected
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            Clear selection
          </button>
        </div>
      )}

      <div className="admin-card mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                role="combobox"
                aria-expanded={showSuggestions && searchSuggestions.length > 0}
                aria-controls="places-search-listbox"
                aria-activedescendant={activeSuggestionIndex >= 0 ? `place-search-option-${activeSuggestionIndex}` : undefined}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => { if (searchSuggestions.length) setShowSuggestions(true); }}
                onBlur={() => setTimeout(() => { setShowSuggestions(false); setActiveSuggestionIndex(-1); }, 150)}
                onKeyDown={handleSearchKeyDown}
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
                <ul id="places-search-listbox" role="listbox" aria-label="Search suggestions" className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg">
                  {searchSuggestions.map((s, idx) => (
                    <li
                      key={s}
                      id={`place-search-option-${idx}`}
                      role="option"
                      aria-selected={idx === activeSuggestionIndex}
                      className={idx === activeSuggestionIndex ? "bg-muted" : ""}
                    >
                      <button
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm ${idx === activeSuggestionIndex ? "text-foreground" : "hover:bg-muted"}`}
                        onMouseDown={() => pickSuggestion(s)}
                        onMouseEnter={() => setActiveSuggestionIndex(idx)}
                      >
                        {highlightMatch(s, searchInput)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
              <input type="checkbox" checked={filters.touristOnly !== false} onChange={(e) => syncUrl({ ...filters, touristOnly: e.target.checked })} className="h-4 w-4 rounded border-border accent-primary" />
              Tourist destinations only
            </label>
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            className="admin-btn-secondary admin-btn-icon md:hidden"
            aria-label={filterOpen ? "Hide filters" : "Show filters"}
            aria-expanded={filterOpen}
          >
            <ListFilter size={16} />
          </button>
        </div>

        <div className={`mt-3 ${filterOpen ? "block" : "hidden md:block"}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <FilterSelect label="State" value={filters.state || ""} onChange={(v) => syncUrl({ ...filters, state: v, city: "" })} options={INDIAN_STATES} placeholder="All States" />
            <FilterSelect label="City" value={filters.city || ""} onChange={(v) => syncUrl({ ...filters, city: v })} options={cityOptions.map((c) => c.city)} placeholder={cityOptionsLoading ? "Loading…" : filters.state ? "All Cities" : "Select state"} disabled={!filters.state && !cityOptions.length} />
            <FilterSelect label="Category" value={filters.category || ""} onChange={(v) => syncUrl({ ...filters, category: v })} options={PLACE_CATEGORIES} placeholder="All Categories" />
            <FilterSelect label="Verified" value={filters.verified || ""} onChange={(v) => syncUrl({ ...filters, verified: v as PlacesFilters["verified"] })} options={["verified", "unverified"]} placeholder="All" />
            <FilterSelect label="Featured" value={filters.featured || ""} onChange={(v) => syncUrl({ ...filters, featured: v as PlacesFilters["featured"] })} options={["featured", "not"]} placeholder="All" />
            <FilterSelect label="Status" value={filters.status || ""} onChange={(v) => syncUrl({ ...filters, status: v })} options={["PENDING", "APPROVED", "REJECTED"]} placeholder="All Status" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button key={chip.label} type="button" onClick={chip.onRemove} className="admin-filter-chip" title={`Remove ${chip.label}`}>
              {chip.label}
              <XIcon size={12} className="opacity-70" />
            </button>
          ))}
          {activeChips.length > 0 && (
            <button type="button" onClick={resetFilters} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              Reset filters
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
          data={dataRows}
          loading={loading}
          retainRowsOnLoading={places.length > 0}
          dense
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
          selectedRowIds={selectedIds}
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