"use client";

import { useState } from "react";
import {
  FileText, Users, Store, MapPin, DollarSign, BarChart3,
  FileDown, Printer, AlertCircle, RefreshCw,
} from "lucide-react";
import { generateReport } from "@/services/reports";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { downloadTextFile, jsonRowsToHtmlTable, printReport } from "@/lib/exportUtils";

const REPORT_TYPES = [
  { value: "users", label: "Users Report", icon: Users, desc: "User registrations, roles, activity" },
  { value: "vendors", label: "Vendors Report", icon: Store, desc: "Vendor performance metrics" },
  { value: "places", label: "Places Report", icon: MapPin, desc: "Place creation, categories, statuses" },
  { value: "revenue", label: "Revenue Report", icon: DollarSign, desc: "Revenue, redemptions, trends" },
  { value: "engagement", label: "Engagement Report", icon: BarChart3, desc: "User engagement, sessions, retention" },
];

interface ReportData {
  metrics?: Record<string, unknown>;
  summary?: string;
  rows?: Record<string, unknown>[];
}

export default function ReportsPage() {
  const [selectedType, setSelectedType] = useState("users");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");

  const selectedReport = REPORT_TYPES.find((r) => r.value === selectedType);
  const Icon = selectedReport?.icon || FileText;

  const buildParams = (format: string) => {
    const params: {
      type: string;
      format?: string;
      from?: string;
      to?: string;
      city?: string;
      category?: string;
    } = { type: selectedType, format };
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
    if (city) params.city = city;
    if (category) params.category = category;
    return params;
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const result = await generateReport(buildParams("json"));
      setData(result as ReportData);
    } catch {
      setError("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await generateReport(buildParams("csv"));
      const blob = result as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Failed to export CSV");
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await generateReport(buildParams("csv"));
      const blob = result as Blob;
      const text = await blob.text();
      downloadTextFile(text, `${selectedType}-report-${new Date().toISOString().slice(0, 10)}.xls`, "text/csv;charset=utf-8;", true);
    } catch {
      setError("Failed to export Excel file");
    } finally {
      setLoading(false);
    }
  };

  const handlePrintPdf = () => {
    if (!data) return;
    let html = "";
    if (data.metrics) {
      html += "<h2>Metrics</h2><table><tbody>";
      for (const [k, v] of Object.entries(data.metrics)) {
        html += `<tr><th>${k}</th><td>${String(v)}</td></tr>`;
      }
      html += "</tbody></table>";
    }
    if (data.summary) {
      html += `<h2>Summary</h2><p>${data.summary}</p>`;
    }
    if (data.rows?.length) {
      html += "<h2>Data</h2>" + jsonRowsToHtmlTable(data.rows);
    }
    if (!html) {
      html = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }
    printReport(`${selectedReport?.label || "Report"}`, html);
  };

  return (
    <div className="animate-fade-in space-y-6 pb-20">
      <PageHeader
        title="Reports"
        description="Generate platform reports with CSV export, Excel-compatible download, and print-to-PDF."
        icon={FileText}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-bold">Report Type</h2>
            <div className="space-y-2">
              {REPORT_TYPES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => { setSelectedType(r.value); setData(null); setError(""); }}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selectedType === r.value ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"
                  }`}
                >
                  <div className={`rounded-lg p-2 ${selectedType === r.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <r.icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-bold">Filters</h2>
            <div className="space-y-3">
              <div>
                <label htmlFor="from-date" className="mb-1 block text-xs font-medium">From Date</label>
                <input id="from-date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="admin-input" />
              </div>
              <div>
                <label htmlFor="to-date" className="mb-1 block text-xs font-medium">To Date</label>
                <input id="to-date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="admin-input" />
              </div>
              <div>
                <label htmlFor="city-filter" className="mb-1 block text-xs font-medium">City</label>
                <input id="city-filter" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Filter by city" className="admin-input" />
              </div>
              <div>
                <label htmlFor="category-filter" className="mb-1 block text-xs font-medium">Category</label>
                <input id="category-filter" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Filter by category" className="admin-input" />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary p-2.5 text-primary-foreground">
                  <Icon size={20} />
                </div>
                <div>
                  <h2 className="font-bold">{selectedReport?.label}</h2>
                  <p className="text-xs text-muted-foreground">Backend provides JSON and CSV only</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void handleGenerate()} disabled={loading} className="admin-btn-primary disabled:opacity-50">
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                  Generate
                </button>
                <button type="button" onClick={() => void handleExportCsv()} disabled={loading} className="admin-btn-secondary disabled:opacity-50">
                  <FileDown size={16} /> CSV
                </button>
                <button type="button" onClick={() => void handleExportExcel()} disabled={loading} className="admin-btn-secondary disabled:opacity-50">
                  <FileDown size={16} /> Excel
                </button>
                <button type="button" onClick={handlePrintPdf} disabled={!data} className="admin-btn-secondary disabled:opacity-50">
                  <Printer size={16} /> Print / PDF
                </button>
              </div>
            </div>

            {error && (
              <EmptyState
                icon={AlertCircle}
                title="Report error"
                description={error}
                action={<button type="button" onClick={() => void handleGenerate()} className="admin-btn-primary">Retry</button>}
              />
            )}

            {loading && (
              <div className="flex items-center justify-center py-16" role="status" aria-label="Loading report">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            )}

            {!loading && data && !error && (
              <div className="space-y-4">
                {data.metrics && (
                  <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {Object.entries(data.metrics).map(([key, val]) => (
                      <div key={key} className="rounded-lg bg-muted/50 p-3">
                        <p className="mb-1 text-xs capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</p>
                        <p className="text-lg font-bold">{String(val)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {data.summary && (
                  <div className="rounded-lg bg-primary/5 p-4">
                    <h3 className="mb-2 text-sm font-semibold text-primary">Summary</h3>
                    <p className="text-sm">{data.summary}</p>
                  </div>
                )}

                {data.rows && data.rows.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Results ({data.rows.length})</h3>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            {Object.keys(data.rows[0]).slice(0, 10).map((key) => (
                              <th key={key} className="px-4 py-2.5 text-left text-xs font-medium uppercase text-muted-foreground">
                                {key.replace(/([A-Z])/g, " $1")}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.rows.slice(0, 50).map((row, i) => (
                            <tr key={i} className="hover:bg-muted/30">
                              {Object.keys(row).slice(0, 10).map((key) => (
                                <td key={key} className="whitespace-nowrap px-4 py-2.5">
                                  {String(row[key] ?? "—")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {data.rows.length > 50 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Showing 50 of {data.rows.length} rows. Use CSV export for full data.
                      </p>
                    )}
                  </div>
                )}

                {!data.metrics && !data.summary && !data.rows && (
                  <div className="rounded-lg bg-muted/30 p-4">
                    <pre className="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(data, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {!loading && !data && !error && (
              <EmptyState icon={FileText} title="No report generated" description="Select a report type and click Generate to preview data." />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
