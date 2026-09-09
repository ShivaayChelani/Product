import React, { useState, useRef } from 'react';
import { Upload, X, AlertTriangle, CheckCircle, UploadCloud, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import client from '@/services/client';

export interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ExcelImportModal({ isOpen, onClose, onSuccess }: ExcelImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError('');
    setPreview([]);
    setSuccess('');
    
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', selected);

      // Send to backend for parsing and validation
      const res = await client.post('/riddles/bulk-import/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data.data || res.data;
      if (res.data.summary) {
        setPreview(res.data.data);
        setSummary(res.data.summary);
      } else {
        setPreview(data);
        setSummary(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to upload and parse Excel file.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    const validRows = preview.filter((r) => r.status === 'VALID');
    if (validRows.length === 0) return;

    try {
      setImporting(true);
      setError('');
      const res = await client.post('/riddles/bulk-import/confirm', { validRows });
      setSuccess(`Import complete! ${res.data.data.message || 'Success'}`);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const validCount = preview.filter((r) => r.status === 'VALID').length;
  const needsAttentionCount = preview.filter((r) => r.status === 'NEEDS_ATTENTION').length;
  const invalidCount = preview.filter((r) => r.status === 'INVALID').length;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Bulk Import Treasure Hunts</h2>
            <p className="text-sm text-gray-500 mt-1">Upload an Excel (.xlsx) file to create multiple riddles at once.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
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
              <div className="flex flex-col gap-4 p-4 bg-gray-50 rounded-lg text-sm">
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="font-medium text-gray-900">{validCount}</span>
                    <span className="text-gray-500">Valid</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="font-medium text-gray-900">{needsAttentionCount}</span>
                    <span className="text-gray-500">Needs Attention</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                    <span className="font-medium text-gray-900">{invalidCount}</span>
                    <span className="text-gray-500">Invalid</span>
                  </div>
                </div>
                {summary?.citiesBreakdown && (
                  <div className="pt-3 border-t border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-2">Cities detected: {summary.citiesCount}</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(summary.citiesBreakdown).map(([city, count]) => (
                        <span key={city} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs font-medium text-gray-700">
                          {city} ({count as React.ReactNode})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 font-medium">Row</th>
                      <th className="px-4 py-3 font-medium">City</th>
                      <th className="px-4 py-3 font-medium">Riddle</th>
                      <th className="px-4 py-3 font-medium">Destination Match</th>
                      <th className="px-4 py-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">#{i + 2}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.city || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={row.clue}>
                          {row.clue || '-'}
                        </td>
                        <td className="px-4 py-3">
                          {row.match ? (
                            <span className="text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded text-xs border border-emerald-100">
                              ✓ {row.match.name}
                            </span>
                          ) : (
                            <span className="text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded text-xs border border-amber-100 flex items-center gap-1 w-fit">
                              <Info className="w-3 h-3" /> No exact match ({row.answer})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.status === 'VALID' && <span className="text-emerald-600 font-medium">Valid</span>}
                          {row.status === 'NEEDS_ATTENTION' && <span className="text-amber-600 font-medium">Needs Attention</span>}
                          {row.status === 'INVALID' && <span className="text-red-600 font-medium" title={row.error}>Invalid</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button 
            onClick={handleImport}
            disabled={validCount === 0 || importing}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {importing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Import {validCount} Riddles
          </button>
        </div>
      </div>
    </div>
  );
}
