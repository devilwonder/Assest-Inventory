import React, { useMemo, useState } from 'react';
import { CheckCircle2, CornerDownLeft, Upload } from 'lucide-react';
import { useEams } from '../services/eamsStore';
import {
  ASSET_CONDITIONS,
  RETURN_NEXT_STATUSES,
  type AssetCondition,
  type ReturnNextStatus,
} from '../types/eams';
import { StatusBadge } from './StatusBadge';

export const ReturnsView: React.FC = () => {
  const { employees, assignments, returns, returnAsset, uploadImageAsset } = useEams();

  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'Active'),
    [assignments]
  );

  const employeesWithAssets = useMemo(() => {
    const activeEmpIds = new Set(activeAssignments.map((a) => a.employeeId));
    return employees.filter((e) => activeEmpIds.has(e.id));
  }, [employees, activeAssignments]);

  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [returnDate, setReturnDate] = useState('2026-11-17');
  const [conditionAtReturn, setConditionAtReturn] = useState<AssetCondition>('Good');
  const [nextAssetStatus, setNextAssetStatus] = useState<ReturnNextStatus>('Available');
  const [damageDetails, setDamageDetails] = useState('');
  const [missingAccessories, setMissingAccessories] = useState('');
  const [returnPhotoUrl, setReturnPhotoUrl] = useState('');
  const [remarks, setRemarks] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const employeeAssignments = useMemo(
    () => activeAssignments.filter((a) => !selectedEmpId || a.employeeId === selectedEmpId),
    [activeAssignments, selectedEmpId]
  );

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImageAsset(file, 'returns');
      setReturnPhotoUrl(url);
    } catch {
      setErrorMsg('Failed to read return photograph.');
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!selectedAssignmentId) {
      setErrorMsg('Please select an active assigned asset to process return.');
      return;
    }
    setSubmitting(true);
    try {
      const ret = await returnAsset({
        assignmentId: selectedAssignmentId,
        returnDate,
        conditionAtReturn,
        damageDetails: damageDetails.trim(),
        missingAccessories: missingAccessories.trim(),
        returnPhotoUrl,
        remarks: remarks.trim(),
        nextAssetStatus,
      });
      setSuccessMsg(
        `Processed return for ${ret.assetCode} from ${ret.employeeName}. Status updated to "${ret.nextAssetStatus}".`
      );
      setSelectedAssignmentId('');
      setDamageDetails('');
      setMissingAccessories('');
      setReturnPhotoUrl('');
      setRemarks('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process return.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Return Processing Form */}
        <form
          onSubmit={handleReturnSubmit}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">Process Asset Return</h2>
            <p className="text-xs text-slate-500">
              Record return inspection, damage or missing accessories, and transition lifecycle status.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label htmlFor="ret-emp" className="block text-xs font-medium text-slate-700 mb-1">
              1. Filter by Employee
            </label>
            <select
              id="ret-emp"
              value={selectedEmpId}
              onChange={(e) => {
                setSelectedEmpId(e.target.value);
                setSelectedAssignmentId('');
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Employees with Active Assets ({employeesWithAssets.length})</option>
              {employeesWithAssets.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeCode} · {e.department})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ret-asset" className="block text-xs font-medium text-slate-700 mb-1">
              2. Select Assigned Asset *
            </label>
            <select
              id="ret-asset"
              required
              value={selectedAssignmentId}
              onChange={(e) => setSelectedAssignmentId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Select active custody item...</option>
              {employeeAssignments.map((asg) => (
                <option key={asg.id} value={asg.id}>
                  {asg.assetCode} — {asg.assetName} ({asg.employeeName})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ret-date" className="block text-xs font-medium text-slate-700 mb-1">
                Return Date *
              </label>
              <input
                id="ret-date"
                type="date"
                required
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="ret-cond" className="block text-xs font-medium text-slate-700 mb-1">
                Returned Condition
              </label>
              <select
                id="ret-cond"
                value={conditionAtReturn}
                onChange={(e) => setConditionAtReturn(e.target.value as AssetCondition)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {ASSET_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="ret-next-status" className="block text-xs font-medium text-slate-700 mb-1">
              Next Asset Lifecycle Status *
            </label>
            <select
              id="ret-next-status"
              value={nextAssetStatus}
              onChange={(e) => setNextAssetStatus(e.target.value as ReturnNextStatus)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {RETURN_NEXT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ret-damage" className="block text-xs font-medium text-slate-700 mb-1">
              Damage Details (if any)
            </label>
            <input
              id="ret-damage"
              type="text"
              value={damageDetails}
              onChange={(e) => setDamageDetails(e.target.value)}
              placeholder="e.g. Minor lid scratch, cracked trackpad..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="ret-missing" className="block text-xs font-medium text-slate-700 mb-1">
              Missing Accessories
            </label>
            <input
              id="ret-missing"
              type="text"
              value={missingAccessories}
              onChange={(e) => setMissingAccessories(e.target.value)}
              placeholder="e.g. Missing 140W USB-C power brick..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="ret-photo" className="block text-xs font-medium text-slate-700 mb-1">
              Return Inspection Photograph
            </label>
            <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100">
              <Upload className="w-3.5 h-3.5" />
              <span>{returnPhotoUrl ? 'Photo Attached (Change)' : 'Upload Return Photo'}</span>
              <input
                id="ret-photo"
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label htmlFor="ret-remarks" className="block text-xs font-medium text-slate-700 mb-1">
              Remarks
            </label>
            <textarea
              id="ret-remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
          >
            <CornerDownLeft className="w-4 h-4" />
            <span>{submitting ? 'Recording Return...' : 'Complete Asset Return'}</span>
          </button>
        </form>

        {/* Return History Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Immutable Return History ({returns.length})
              </h3>
              <p className="text-xs text-slate-500">
                Permanent log of returned equipment, inspection condition, and post-return status.
              </p>
            </div>
          </div>
          {returns.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No asset returns recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                    <th className="px-4 py-3">Asset</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Return Date</th>
                    <th className="px-4 py-3">Condition</th>
                    <th className="px-4 py-3">Next Status</th>
                    <th className="px-4 py-3">Inspection Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {returns.map((ret) => (
                    <tr key={ret.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{ret.assetName}</div>
                        <div className="text-xs font-mono text-slate-500">{ret.assetCode}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-800">{ret.employeeName}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-xs text-slate-600">
                        {ret.returnDate}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={ret.conditionAtReturn} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={ret.nextAssetStatus} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-xs">
                        {ret.damageDetails && ret.damageDetails !== 'None' ? (
                          <div className="text-rose-700 font-medium">Damage: {ret.damageDetails}</div>
                        ) : null}
                        {ret.missingAccessories && ret.missingAccessories !== 'None' ? (
                          <div className="text-amber-700">Missing: {ret.missingAccessories}</div>
                        ) : null}
                        <div>{ret.remarks || '—'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
