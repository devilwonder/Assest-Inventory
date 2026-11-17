import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import type { Asset, Employee } from '../types/eams';
import {
  downloadAssetImportTemplate,
  downloadEmployeeImportTemplate,
  parseAndValidateAssetRows,
  parseAndValidateEmployeeRows,
  readExcelFileRows,
  type ImportParseResult,
} from '../utils/excelImport';

interface ExcelImportModalProps {
  open: boolean;
  target: 'assets' | 'employees';
  existingAssets?: Asset[];
  existingEmployees?: Employee[];
  departments?: string[];
  locations: string[];
  onClose: () => void;
  onImportAssets?: (items: Array<Omit<Asset, 'id'>>) => Promise<Asset[]>;
  onImportEmployees?: (items: Array<Omit<Employee, 'id'>>) => Promise<Employee[]>;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  open,
  target,
  existingAssets = [],
  existingEmployees = [],
  departments = ['Engineering'],
  locations,
  onClose,
  onImportAssets,
  onImportEmployees,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [rowFilter, setRowFilter] = useState<'all' | 'errors'>('all');
  const [assetResult, setAssetResult] = useState<ImportParseResult<Omit<Asset, 'id'>> | null>(null);
  const [employeeResult, setEmployeeResult] = useState<ImportParseResult<Omit<Employee, 'id'>> | null>(
    null
  );

  const activeResult = target === 'assets' ? assetResult : employeeResult;

  const visibleRows = useMemo(() => {
    if (!activeResult) return [];
    if (rowFilter === 'errors') return activeResult.rows.filter((r) => !r.valid);
    return activeResult.rows;
  }, [activeResult, rowFilter]);

  if (!open) return null;

  const resetState = () => {
    setFileName('');
    setParseError('');
    setRowFilter('all');
    setAssetResult(null);
    setEmployeeResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (importing) return;
    resetState();
    onClose();
  };

  const handleDownloadTemplate = () => {
    if (target === 'assets') {
      downloadAssetImportTemplate(locations);
    } else {
      downloadEmployeeImportTemplate(departments, locations);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setFileName(file.name);
    try {
      const rawRows = await readExcelFileRows(file);
      if (rawRows.length === 0) {
        setParseError('The selected spreadsheet has no data rows beneath the header.');
        setAssetResult(null);
        setEmployeeResult(null);
        return;
      }
      if (target === 'assets') {
        const res = parseAndValidateAssetRows(
          rawRows,
          existingAssets,
          locations[0] || 'San Francisco HQ'
        );
        if (res.rows.length === 0) {
          setParseError('No non-empty asset rows found in the first worksheet.');
          setAssetResult(null);
          return;
        }
        setAssetResult(res);
      } else {
        const res = parseAndValidateEmployeeRows(
          rawRows,
          existingEmployees,
          departments[0] || 'Engineering',
          locations[0] || 'San Francisco HQ'
        );
        if (res.rows.length === 0) {
          setParseError('No non-empty employee rows found in the first worksheet.');
          setEmployeeResult(null);
          return;
        }
        setEmployeeResult(res);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unable to parse the Excel file.');
      setAssetResult(null);
      setEmployeeResult(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!activeResult || activeResult.validCount === 0) return;
    setParseError('');
    setImporting(true);
    try {
      if (target === 'assets' && assetResult && onImportAssets) {
        await onImportAssets(assetResult.validItems);
      } else if (target === 'employees' && employeeResult && onImportEmployees) {
        await onImportEmployees(employeeResult.validItems);
      }
      resetState();
      onClose();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Bulk import failed.');
    } finally {
      setImporting(false);
    }
  };

  const entityPlural = target === 'assets' ? 'Assets' : 'Employees';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="excel-import-title"
    >
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 id="excel-import-title" className="text-base font-semibold text-slate-900">
              Import {entityPlural} from Excel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Download the pre-formatted workbook, populate rows, and upload to validate before saving.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Excel import modal"
            className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Step 1: Template & File Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-900">
                  1. Download {entityPlural} Template
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Includes required column headers, sample rows, and a Reference Values tab with valid{' '}
                  {target === 'assets' ? 'categories, conditions, and locations' : 'departments, statuses, and locations'}.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Download Template (.xlsx)
              </button>
            </div>

            <div className="p-4 border border-slate-200 rounded-xl bg-white flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-900">
                  2. Upload Spreadsheet (.xlsx, .xls, .csv)
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {fileName ? (
                    <span className="font-mono text-slate-800">{fileName}</span>
                  ) : (
                    'Rows are validated for required fields and duplicates before any record is saved.'
                  )}
                </p>
              </div>
              <label
                htmlFor="excel-upload-input"
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{fileName ? 'Choose Different File' : 'Select Excel / CSV File'}</span>
                <input
                  ref={fileInputRef}
                  id="excel-upload-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {parseError && (
            <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Step 2: Preview & Validation Summary */}
          {activeResult ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-600 tabular-nums">
                  <span className="font-semibold text-emerald-700">
                    {activeResult.validCount} ready to import
                  </span>
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  <span
                    className={
                      activeResult.errorCount > 0 ? 'font-semibold text-rose-700' : 'text-slate-500'
                    }
                  >
                    {activeResult.errorCount} row error(s)
                  </span>
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  <span>{activeResult.rows.length} total parsed</span>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setRowFilter('all')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                      rowFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Rows ({activeResult.rows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowFilter('errors')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                      rowFilter === 'errors'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Errors Only ({activeResult.errorCount})
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                      <tr>
                        <th className="px-3 py-2.5 font-medium whitespace-nowrap">Row</th>
                        <th className="px-3 py-2.5 font-medium whitespace-nowrap">Validation</th>
                        <th className="px-3 py-2.5 font-medium">Record Summary</th>
                        <th className="px-3 py-2.5 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                            No rows match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        visibleRows.map((row) => (
                          <tr key={row.rowNumber} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                              #{row.rowNumber}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {row.valid ? (
                                <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Valid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-medium text-rose-700">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  Error
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-900">{row.previewLabel}</div>
                              <div className="text-slate-500 font-mono">{row.previewSublabel}</div>
                            </td>
                            <td className="px-3 py-2">
                              {row.valid ? (
                                <span className="text-slate-500">Ready to save</span>
                              ) : (
                                <ul className="text-rose-700 space-y-0.5">
                                  {row.errors.map((err, i) => (
                                    <li key={i}>{err}</li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-2">
              <FileSpreadsheet className="w-7 h-7 text-slate-400 mx-auto" />
              <div className="text-xs font-medium text-slate-700">
                Upload a filled Excel or CSV file to preview and validate rows
              </div>
              <p className="text-xs text-slate-500">
                Leave the ID column blank to automatically generate sequential{' '}
                {target === 'assets' ? 'AST-2026-NNNN' : 'EMP-NNNN'} identifiers.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {activeResult && activeResult.errorCount > 0
              ? 'Only valid rows will be imported; rows with errors are skipped.'
              : 'All imported rows are recorded in the permanent audit trail.'}
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              disabled={importing}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={importing || !activeResult || activeResult.validCount === 0}
              onClick={handleConfirmImport}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
            >
              {importing
                ? 'Importing...'
                : `Import ${activeResult?.validCount || 0} Valid ${entityPlural}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
