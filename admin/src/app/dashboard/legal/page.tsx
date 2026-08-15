"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { listLegalDocuments, type LegalDocumentSummary } from "@/services/legal";
import { LEGAL_TYPE_META } from "@/lib/legalTypes";

export default function LegalHubPage() {
  const [docs, setDocs] = useState<LegalDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await listLegalDocuments());
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const groups = Array.from(new Set(LEGAL_TYPE_META.map((m) => m.group)));

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Legal Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage every legal & policy document served to the mobile app. Content is versioned — publishing here goes live instantly, with no app update required.
        </p>
      </div>

      {groups.map((group) => (
        <div key={group}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{group}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LEGAL_TYPE_META.filter((m) => m.group === group).map((meta) => {
              const doc = docs.find((d) => d.type === meta.type);
              return (
                <Link
                  key={meta.type}
                  href={`/dashboard/legal/${meta.slug}`}
                  className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <FileText size={16} className="text-blue-600" />
                    <h3 className="font-semibold text-gray-900">{meta.label}</h3>
                  </div>
                  <p className="mb-3 text-xs text-gray-500 line-clamp-2">{meta.description}</p>
                  {doc?.publishedVersion ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 size={13} /> Published v{doc.publishedVersion.versionNumber}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600">
                      <AlertCircle size={13} /> Not published yet
                    </div>
                  )}
                  {doc?.draftVersion && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock size={13} /> Draft pending — v{doc.draftVersion.versionNumber}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
