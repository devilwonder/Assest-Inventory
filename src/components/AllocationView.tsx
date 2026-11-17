import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, FileText, Printer, Search, Users, X } from 'lucide-react';
import { useEams } from '../services/eamsStore';
import {
  ASSET_CONDITIONS,
  type AssetAssignment,
  type AssetCondition,
} from '../types/eams';
import { StatusBadge } from './StatusBadge';

export const AllocationView: React.FC = () => {
  const { employees, assets, assignments, assignAssets } = useEams();

  const [bulkMode, setBulkMode] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [assetSearch, setAssetSearch] = useState('');

  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  const [issueDate, setIssueDate] = useState('2026-11-17');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [conditionAtIssue, setConditionAtIssue] = useState<AssetCondition>('Good');
  const [accessoriesIncluded, setAccessoriesIncluded] = useState('Power Adapter, USB-C Cable');
  const [remarks, setRemarks] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [receipts, setReceipts] = useState<AssetAssignment[] | null>(null);

  const activeEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return employees.filter((e) => {
      if (e.employmentStatus === 'Resigned' || e.employmentStatus === 'Terminated') return false;
      if (!q) return true;
      return (
        e.fullName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
      );
    });
  }, [employees, empSearch]);

  const availableAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    return assets.filter((a) => {
      if (a.status !== 'Available' && a.status !== 'Purchased') return false;
      if (!q) return true;
      return (
        a.assetCode.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.serialNumber.toLowerCase().includes(q)
      );
    });
  }, [assets, assetSearch]);

  const toggleEmployee = (id: string) => {
    if (!bulkMode) {
      setSelectedEmpIds([id]);
      return;
    }
    setSelectedEmpIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAsset = (id: string) => {
    setSelectedAssetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (selectedEmpIds.length === 0) {
      setErrorMsg('Select at least one employee.');
      return;
    }
    if (selectedAssetIds.length === 0) {
      setErrorMsg('Select at least one available asset.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await assignAssets({
        employeeIds: selectedEmpIds,
        assetIds: selectedAssetIds,
        issueDate,
        expectedReturnDate,
        conditionAtIssue,
        accessoriesIncluded,
        remarks,
      });
      setReceipts(created);
      setSelectedEmpIds([]);
      setSelectedAssetIds([]);
      setRemarks('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to assign asset(s).');
    } finally {
      setSubmitting(false);
    }
  };

  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'Active'),
    [assignments]
  );

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Asset Allocation Workflow</h2>
          <p className="text-xs text-slate-500">
            Assign single or multiple available assets to an employee, or switch to bulk onboarding for multiple new hires.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => {
              setBulkMode(false);
              setSelectedEmpIds((prev) => prev.slice(0, 1));
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              !bulkMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Single Employee (1:N)
          </button>
          <button
            type="button"
            onClick={() => setBulkMode(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              bulkMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Bulk Onboarding (N:N)
          </button>
        </div>
      </div>

      {/* Allocation Builder Form */}
      <form onSubmit={handleAssignSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Step 1: Select Employee(s) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                1. Select Employee{bulkMode ? 's' : ''}
              </h3>
              <span className="text-xs font-mono tabular-nums text-blue-700 font-medium">
                {selectedEmpIds.length} selected
              </span>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="Search employee name or ID..."
                aria-label="Search employees for allocation"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {activeEmployees.map((emp) => {
              const checked = selectedEmpIds.includes(emp.id);
              return (
                <label
                  key={emp.id}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                    checked ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <input
                    type={bulkMode ? 'checkbox' : 'radio'}
                    name="allocation-employee"
                    checked={checked}
                    onChange={() => toggleEmployee(emp.id)}
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">{emp.fullName}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {emp.employeeCode} · {emp.department}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Step 2: Select Available Asset(s) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">2. Select Available Assets</h3>
              <span className="text-xs font-mono tabular-nums text-blue-700 font-medium">
                {selectedAssetIds.length} selected
              </span>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                placeholder="Search available assets..."
                aria-label="Search available assets for allocation"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {availableAssets.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No available stockroom assets match your search.
              </div>
            ) : (
              availableAssets.map((ast) => {
                const checked = selectedAssetIds.includes(ast.id);
                return (
                  <label
                    key={ast.id}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                      checked ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAsset(ast.id)}
                      className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 truncate">{ast.name}</div>
                      <div className="text-xs text-slate-500 font-mono truncate">
                        {ast.assetCode} · {ast.category} · {ast.serialNumber}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Step 3: Issuance Details & Submit */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">3. Issuance Metadata</h3>

            {errorMsg && (
              <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="alloc-issue-date" className="block text-xs font-medium text-slate-700 mb-1">
                  Issue Date *
                </label>
                <input
                  id="alloc-issue-date"
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="alloc-ret-date" className="block text-xs font-medium text-slate-700 mb-1">
                  Expected Return
                </label>
                <input
                  id="alloc-ret-date"
                  type="date"
                  value={expectedReturnDate}
                  onChange={(e) => setExpectedReturnDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label htmlFor="alloc-condition" className="block text-xs font-medium text-slate-700 mb-1">
                Condition Before Issuing
              </label>
              <select
                id="alloc-condition"
                value={conditionAtIssue}
                onChange={(e) => setConditionAtIssue(e.target.value as AssetCondition)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {ASSET_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="alloc-acc" className="block text-xs font-medium text-slate-700 mb-1">
                Accessories Included
              </label>
              <input
                id="alloc-acc"
                type="text"
                value={accessoriesIncluded}
                onChange={(e) => setAccessoriesIncluded(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="alloc-remarks" className="block text-xs font-medium text-slate-700 mb-1">
                Remarks
              </label>
              <textarea
                id="alloc-remarks"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Handover notes or project allocation reference..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>
              {submitting
                ? 'Assigning Assets...'
                : `Assign & Generate Receipt (${selectedAssetIds.length})`}
            </span>
          </button>
        </div>
      </form>

      {/* Active Allocations Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Active Custody Ledger ({activeAssignments.length})
            </h3>
            <p className="text-xs text-slate-500">
              Click any receipt number to view or print the handover receipt.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Condition</th>
                <th className="px-4 py-3">Acknowledged</th>
                <th className="px-4 py-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeAssignments.slice(0, 15).map((asg) => (
                <tr key={asg.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{asg.receiptNumber}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{asg.assetName}</div>
                    <div className="text-xs font-mono text-slate-500">{asg.assetCode}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{asg.employeeName}</div>
                    <div className="text-xs text-slate-500">{asg.department}</div>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs text-slate-600">
                    {asg.issueDate}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={asg.conditionAtIssue} />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {asg.acknowledgedByEmployee ? (
                      <span className="text-emerald-700 font-medium">Acknowledged</span>
                    ) : (
                      <span className="text-amber-700">Pending Sign-off</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setReceipts([asg])}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      View Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Handover Receipt Modal */}
      {receipts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="handover-receipt-title"
        >
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between no-print">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <h2 id="handover-receipt-title" className="text-base font-semibold text-slate-900">
                  Asset Handover Receipt
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setReceipts(null)}
                aria-label="Close handover receipt"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <div className="text-base font-bold text-slate-900">AssetLedger Property Handover</div>
                  <div className="text-xs text-slate-500">
                    Issued by {receipts[0]?.issuedByName || 'IT Admin'} on {receipts[0]?.issueDate}
                  </div>
                </div>
                <div className="text-right font-mono text-xs text-slate-700">
                  {receipts.length === 1 ? receipts[0].receiptNumber : `${receipts.length} Receipts`}
                </div>
              </div>
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
                {receipts.map((r) => (
                  <div key={r.id} className="p-3.5 text-xs space-y-1">
                    <div className="flex items-center justify-between font-medium text-slate-900">
                      <span>
                        {r.assetCode} — {r.assetName}
                      </span>
                      <span className="font-mono text-slate-500">{r.receiptNumber}</span>
                    </div>
                    <div className="text-slate-600">
                      Custodian: <span className="font-medium text-slate-900">{r.employeeName}</span> ({r.department})
                    </div>
                    <div className="text-slate-500">
                      Condition: {r.conditionAtIssue} · Accessories: {r.accessoriesIncluded || 'None'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-6 text-xs text-slate-500">
                <div>
                  <div className="border-b border-slate-300 h-8" />
                  <div className="mt-1">IT Administrator Signature</div>
                </div>
                <div>
                  <div className="border-b border-slate-300 h-8" />
                  <div className="mt-1">Employee Acknowledgement Signature</div>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5 no-print">
              <button
                type="button"
                onClick={() => setReceipts(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Handover Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
