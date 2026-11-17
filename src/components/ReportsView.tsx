import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useEams } from '../services/eamsStore';
import { ASSET_CATEGORIES, ASSET_STATUSES, type ReportType } from '../types/eams';
import { buildReportDataset, downloadCSV, downloadExcel } from '../utils/exportReports';

const REPORT_TYPES: Array<{ id: ReportType; label: string; description: string }> = [
  { id: 'complete_inventory', label: 'Complete Asset Inventory', description: 'All registered hardware, serials, values, and custody.' },
  { id: 'employee_allocation', label: 'Employee-Wise Allocation', description: 'Active assets mapped to individual custodians.' },
  { id: 'department_allocation', label: 'Department-Wise Allocation', description: 'Headcount and total allocated asset value per department.' },
  { id: 'available_assets', label: 'Available Stockroom Assets', description: 'Ready-to-issue inventory across office locations.' },
  { id: 'under_maintenance', label: 'Assets Under Maintenance', description: 'Repair tickets, assigned technicians, vendors, and costs.' },
  { id: 'warranty_expiry', label: 'Warranty Expiry Report', description: 'Expired and upcoming 30-day warranty coverage audit.' },
  { id: 'purchase_depreciation', label: 'Purchase & Depreciation', description: '3-year straight-line depreciation and net book value.' },
  { id: 'lost_damaged', label: 'Lost & Damaged Assets', description: 'Incident assets requiring write-off or replacement.' },
  { id: 'offboarding_clearance', label: 'Employee Offboarding Clearance', description: 'Exit clearance compliance for resigned/terminated staff.' },
  { id: 'assignment_history', label: 'Assignment & Return History', description: 'Full historical custody chain and handover receipts.' },
];

export const ReportsView: React.FC = () => {
  const { assets, employees, assignments, maintenanceRecords, departments } = useEams();

  const [reportType, setReportType] = useState<ReportType>('complete_inventory');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [department, setDepartment] = useState('All');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('All');

  const dataset = useMemo(
    () =>
      buildReportDataset(
        { reportType, dateFrom, dateTo, department, category, status, referenceDate: '2026-11-17' },
        { assets, employees, assignments, maintenanceRecords }
      ),
    [reportType, dateFrom, dateTo, department, category, status, assets, employees, assignments, maintenanceRecords]
  );

  return (
    <div className="space-y-6">
      {/* Report Selector Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {REPORT_TYPES.map((rt) => {
          const active = reportType === rt.id;
          return (
            <button
              key={rt.id}
              type="button"
              onClick={() => setReportType(rt.id)}
              className={`text-left p-3.5 rounded-xl border transition-colors ${
                active
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-xs font-semibold">{rt.label}</div>
              <div className={`text-[11px] mt-1 line-clamp-2 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                {rt.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters & Export Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1">
          <div>
            <label htmlFor="rep-from" className="block text-xs font-medium text-slate-600 mb-1">
              Date From
            </label>
            <input
              id="rep-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="rep-to" className="block text-xs font-medium text-slate-600 mb-1">
              Date To
            </label>
            <input
              id="rep-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="rep-dept" className="block text-xs font-medium text-slate-600 mb-1">
              Department
            </label>
            <select
              id="rep-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="All">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rep-cat" className="block text-xs font-medium text-slate-600 mb-1">
              Category
            </label>
            <select
              id="rep-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="All">All Categories</option>
              {ASSET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rep-status" className="block text-xs font-medium text-slate-600 mb-1">
              Status
            </label>
            <select
              id="rep-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="All">All Statuses</option>
              {ASSET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => downloadCSV(dataset)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => downloadExcel(dataset)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Live Preview Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{dataset.title}</h2>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {dataset.rows.length} record(s)
          </span>
        </div>
        {dataset.rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No records match the selected report filters.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  {dataset.columns.map((col) => (
                    <th key={col} className="px-4 py-3 font-semibold whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    {dataset.columns.map((col) => (
                      <td
                        key={col}
                        className="px-4 py-2.5 text-slate-700 whitespace-nowrap tabular-nums"
                      >
                        {typeof row[col] === 'number' && col.includes('$')
                          ? `$${Number(row[col]).toLocaleString()}`
                          : String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
