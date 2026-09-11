import React, { useState, useRef } from 'react';
import { UploadCloud, X, AlertTriangle, CheckCircle, Eye } from 'lucide-react';
import client from '@/services/client';
import { getApiErrorMessage } from '@/services/client';

interface Props {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

export function ExcelImportModal({ open, onCancel, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setPreview([]);
    setSummary(null);
    setError('');
    setSuccess('');
    setRevealed({});
    setImporting(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    reset();
    setFile(selected);

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', selected);

      const res = await client.post('/admin/riddles/bulk-import/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const payload = res.data?.data;
      setPreview(Array.isArray(payload?.data) ? payload.data : []);
      setSummary(payload?.summary ?? null);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to upload and parse Excel file.'));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    const validRows = preview.filter((r) => r.status === 'VALID');
    if (validRows.length === 0 || !file) return;

    const cities = [...new Set(validRows.map((r) => r.city))];
    const totalRows = summary?.total ?? preview.length;
    const invalidRows = summary?.invalid ?? preview.length - validRows.length;

    try {
      setImporting(true);
      setError('');
      const res = await client.post('/admin/riddles/bulk-import/confirm', {
        validRows,
        fileName: file.name,
        totalRows,
        invalidRows,
        cities,
      });
      const msg = res.data?.message || res.data?.data?.message || `Imported ${validRows.length} riddles`;
      setSuccess(`Import complete! ${msg}`);
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Import failed.'));
    } finally {
      setImporting(false);
    }
  };

  const validCount = preview.filter((r) => r.status === 'VALID').length;
  const invalidCount = preview.filter((r) => r.status === 'INVALID').length;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Bulk Import Treasure Hunts</h2>
            <p className="text-sm text-gray-500 mt-1">Upload an Excel (.xlsx) file with 5 columns: City name, Riddle in English, Answer in English, Riddle in Hindi, Answer in Hindi.</p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-700">{success}</p>
            </div>
          )}

          {!preview.length && !loading && (
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center hover:bg-gray-50 hover:border-brand-300 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-sm font-medium text-gray-900 mb-1">Click to upload or drag and drop</h3>
              <p className="text-xs text-gray-500">XLSX, XLS files only</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx, .xls"
                className="hidden"
              />
            </div>
          )}

          {loading && (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-500">Parsing and validating Excel file...</p>
            </div>
          )}

          {preview.length > 0 && !loading && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-lg text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{summary?.total ?? preview.length}</span>
                    <span className="text-gray-500">Total Rows</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="font-medium text-gray-900">{validCount}</span>
                    <span className="text-gray-500">Valid Rows</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                    <span className="font-medium text-gray-900">{invalidCount}</span>
                    <span className="text-gray-500">Invalid Rows</span>
                  </div>
                  {summary && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{summary.citiesCount}</span>
                      <span className="text-gray-500">Cities Found</span>
                    </div>
                  )}
                </div>
                {invalidCount > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                    {invalidCount} invalid row(s) will be skipped. Only the {validCount} valid row(s) will be imported.
                  </p>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 font-medium">Row</th>
                      <th className="px-4 py-3 font-medium">City</th>
                      <th className="px-4 py-3 font-medium">Riddle (EN)</th>
                      <th className="px-4 py-3 font-medium">Answer (EN)</th>
                      <th className="px-4 py-3 font-medium">Riddle (HI)</th>
                      <th className="px-4 py-3 font-medium">Answer (HI)</th>
                      <th className="px-4 py-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">#{i + 2}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.city || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={row.clueEnglish}>
                          {row.clueEnglish || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[150px] truncate">
                          {row.status !== 'VALID' && !row.answerEnglish ? (
                            '-'
                          ) : revealed[i] ? (
                            <span className="text-emerald-700 font-medium" title={row.answerEnglish}>{row.answerEnglish}</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-gray-400">
                              ··········
                              <button
                                onClick={(e) => { e.stopPropagation(); setRevealed((p) => ({ ...p, [i]: true })); }}
                                className="p-0.5 text-gray-400 hover:text-gray-700"
                                title="View Answer"
                              >
                                <Eye size={14} />
                              </button>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={row.clueHindi}>
                          {row.clueHindi || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[150px] truncate">
                          {row.status !== 'VALID' && !row.answerHindi ? (
                            '-'
                          ) : revealed[i] ? (
                            <span className="text-emerald-700 font-medium" title={row.answerHindi}>{row.answerHindi}</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-gray-400">
                              ··········
                              <button
                                onClick={(e) => { e.stopPropagation(); setRevealed((p) => ({ ...p, [i]: true })); }}
                                className="p-0.5 text-gray-400 hover:text-gray-700"
                                title="View Answer"
                              >
                                <Eye size={14} />
                              </button>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.status === 'VALID' ? (
                            <span className="text-emerald-600 font-medium">Valid</span>
                          ) : (
                            <span className="text-red-600 font-medium" title={row.error}>Invalid</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {invalidCount > 0 && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
                  <h4 className="text-sm font-medium text-red-800 mb-2">Errors</h4>
                  <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
                    {preview.filter((r) => r.status === 'INVALID').map((r, i) => (
                      <li key={i}>{r.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            {preview.length > 0 && file ? `File: ${file.name}` : 'Answers are masked by default. Use the eye icon to reveal.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={importing}
              className="px-4 py-2 font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!preview.length || loading || importing || validCount === 0 || !file}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg shadow-sm shadow-brand-600/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${validCount} Riddle${validCount === 1 ? '' : 's'}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}