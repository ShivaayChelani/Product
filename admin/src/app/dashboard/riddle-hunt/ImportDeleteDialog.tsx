"use client";

import { AlertTriangle, X, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  deleteImport,
  type ImportLog,
  type ImportDeleteResult,
} from "@/services/riddles";
import { getApiErrorMessage } from "@/services/client";

export default function ImportDeleteDialog({
  open,
  log,
  onClose,
  onDeleted,
}: {
  open: boolean;
  log: ImportLog | null;
  onClose: () => void;
  onDeleted: (result: ImportDeleteResult, message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resultMessage, setResultMessage] = useState("");

  if (!open || !log) return null;

  const handleConfirm = async () => {
    if (submitting) return; // prevent double-submit / duplicate requests
    setSubmitting(true);
    setError("");
    setResultMessage("");
    try {
      const res = await deleteImport(log.id);
      setResultMessage(res?.message || "Import deleted");
      // Parent refreshes data + shows the success message.
      onDeleted(res?.data, res?.message || "Import deleted");
      onClose();
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to delete import"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Delete {log.fileName}?
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          This will remove or archive the Treasure Hunts and Riddles created by
          THIS import only. Existing user progress and reward history will be
          preserved. No other imports, cities or files are affected.
        </p>
        {resultMessage && (
          <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
            {resultMessage}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" /> Deleting…
              </span>
            ) : (
              "Delete Import"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}