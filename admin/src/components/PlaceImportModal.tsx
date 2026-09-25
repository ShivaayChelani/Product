"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Upload, X, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { importPlaces } from "@/services/places";
import {
  downloadTemplateCsv,
  rowsFromObjects,
  type ParsePlacesResult,
  type ParsedPlaceRow,
} from "@/lib/placeImport";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  notify: (type: "success" | "error" | "info", message: string) => void;
};

type ImportResult = {
  total: number;
  created: number;
  skipped: number;
  errors: number;
  skippedReasons: { name: string; reason: string }[];
  errorDetails: { name: string; error: string }[];
};

const ACCEPTED = ".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function parseFile(file: File): Promise<ParsePlacesResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type.includes("csv") || file.type === "text/plain") {
    const text = await file.text();
    return new Promise((resolve) => {
      Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) => h.trim(),
        complete: (res) => {
          const rows = (res.data || []).filter((r) => r && typeof r === "object");
          const parsed = rowsFromObjects(rows);
          if (res.errors?.length) {
            parsed.errors = [
              ...parsed.errors,
              ...res.errors.slice(0, 5).map((e) => `CSV parse: ${e.message}`),
            ];
          }
          resolve(parsed);
        },
        error: (err: Error) => {
          resolve({ places: [], headers: [], errors: [err.message], skippedEmpty: 0 });
        },
      });
    });
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { places: [], headers: [], errors: ["Workbook has no sheets."], skippedEmpty: 0 };
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    return rowsFromObjects(rows);
  }

  return {
    places: [],
    headers: [],
    errors: ["Unsupported file type. Use .csv, .xlsx, or .xls."],
    skippedEmpty: 0,
  };
}

export default function PlaceImportModal({ open, onClose, onImported, notify }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsed, setParsed] = useState<ParsePlacesResult | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [status, setStatus] = useState<"APPROVED" | "PENDING">("APPROVED");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setFileName("");
    setParsed(null);
    setResult(null);
    setOverwrite(false);
    setStatus("APPROVED");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    if (importing) return;
    reset();
    onClose();
  }, [importing, reset, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify("error", "File exceeds 5MB limit");
      return;
    }
    setParsing(true);
    setResult(null);
    setFileName(file.name);
    try {
      const out = await parseFile(file);
      setParsed(out);
      if (!out.places.length && out.errors.length) {
        notify("error", out.errors[0]);
      }
    } catch (err) {
      setParsed({
        places: [],
        headers: [],
        errors: [err instanceof Error ? err.message : "Failed to parse file"],
        skippedEmpty: 0,
      });
    } finally {
      setParsing(false);
    }
  };

  const previewRows = useMemo(() => (parsed?.places || []).slice(0, 8), [parsed]);

  const runImport = async () => {
    if (!parsed?.places.length) {
      notify("error", "No valid places to import");
      return;
    }
    if (parsed.places.length > 1000) {
      notify("error", "Import limited to 1000 places per file");
      return;
    }
    setImporting(true);
    try {
      const payload = parsed.places.map((p: ParsedPlaceRow) => ({
        name: p.name,
        description: p.description,
        shortDescription: p.shortDescription,
        latitude: p.latitude,
        longitude: p.longitude,
        category: p.category,
        tags: p.tags,
        images: p.images,
        city: p.city,
        state: p.state,
        country: p.country,
        openingHours: p.openingHours,
        bestTimeToVisit: p.bestTimeToVisit,
        bestTimeReason: p.bestTimeReason,
        rating: p.rating,
        externalId: p.externalId,
        ticketPrice: p.ticketPrice,
        editorialPriority: p.editorialPriority,
      }));
      const res = await importPlaces(payload, {
        overwrite,
        source: "ADMIN",
        status,
      });
      setResult(res);
      notify(
        res.errors > 0 ? "error" : "success",
        `Import done: ${res.created} created, ${res.skipped} skipped, ${res.errors} errors`,
      );
      onImported();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : "Import failed");
      notify("error", msg);
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="place-import-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 id="place-import-title" className="text-lg font-bold text-foreground">Import Places</h2>
            <p className="text-xs text-muted-foreground">Upload a CSV or Excel (.xlsx / .xls) sheet</p>
          </div>
          <button type="button" onClick={handleClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadTemplateCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              <Download size={16} />
              Download CSV template
            </button>
            <span className="text-xs text-muted-foreground">
              Required: <code className="rounded bg-muted px-1">name</code>. Recommended: city, state, latitude, longitude, category.
            </span>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
              dragOver ? "border-primary bg-primary/10" : "border-input bg-muted/40"
            }`}
          >
            <FileSpreadsheet className="mx-auto mb-3 text-primary" size={36} />
            <p className="mb-1 text-sm font-medium text-foreground">
              {fileName ? fileName : "Drop CSV / Excel file here"}
            </p>
            <p className="mb-4 text-xs text-muted-foreground">Max 1000 places per import</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={parsing}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              <Upload size={16} />
              {parsing ? "Parsing…" : "Choose file"}
            </button>
          </div>

          {parsed && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Valid places</p>
                  <p className="text-xl font-bold text-primary">{parsed.places.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Row errors</p>
                  <p className="text-xl font-bold text-warning">{parsed.errors.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Empty rows skipped</p>
                  <p className="text-xl font-bold text-foreground">{parsed.skippedEmpty}</p>
                </div>
              </div>

              {parsed.errors.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
                  <div className="mb-1 flex items-center gap-1 font-semibold">
                    <AlertTriangle size={14} /> Parse issues (showing up to 8)
                  </div>
                  <ul className="list-inside list-disc space-y-0.5">
                    {parsed.errors.slice(0, 8).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewRows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Category</th>
                        <th className="px-3 py-2 font-medium">City</th>
                        <th className="px-3 py-2 font-medium">State</th>
                        <th className="px-3 py-2 font-medium">Lat / Lng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((p, i) => (
                        <tr key={`${p.name}-${i}`} className="border-t border-border">
                          <td className="px-3 py-2 font-medium text-foreground">{p.name}</td>
                          <td className="px-3 py-2 capitalize text-muted-foreground">{p.category || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{p.city || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{p.state || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {p.latitude != null && p.longitude != null
                              ? `${p.latitude}, ${p.longitude}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.places.length > previewRows.length && (
                    <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Showing {previewRows.length} of {parsed.places.length} places
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Import status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "APPROVED" | "PENDING")}
                    className="admin-input w-full"
                  >
                    <option value="APPROVED">Approved (live immediately)</option>
                    <option value="PENDING">Pending (needs review)</option>
                  </select>
                </div>
                <label className="flex cursor-pointer items-start gap-2 pt-6 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                  />
                  <span>
                    Overwrite duplicates
                    <span className="block text-xs text-muted-foreground">
                      Match by name + city + state (or same coordinates)
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-foreground">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <CheckCircle2 size={16} />
                Import complete
              </div>
              <p>
                Created <strong>{result.created}</strong> · Skipped <strong>{result.skipped}</strong> · Errors{" "}
                <strong>{result.errors}</strong> (of {result.total})
              </p>
              {result.skippedReasons.slice(0, 5).map((s) => (
                <p key={`${s.name}-${s.reason}`} className="mt-1 text-xs text-primary/80">
                  Skipped {s.name}: {s.reason}
                </p>
              ))}
              {result.errorDetails.slice(0, 5).map((e) => (
                <p key={`${e.name}-${e.error}`} className="mt-1 text-xs text-destructive">
                  {e.name}: {e.error}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-input px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            {result ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={!parsed?.places.length || importing || parsing}
            onClick={() => void runImport()}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing ? "Importing…" : `Import ${parsed?.places.length || 0} places`}
          </button>
        </div>
      </div>
    </div>
  );
}
