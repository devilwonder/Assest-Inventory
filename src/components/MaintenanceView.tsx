import React, { useMemo, useState } from 'react';
import { AlertTriangle, Clock, Plus, ShieldAlert, Wrench, X } from 'lucide-react';
import { useEams } from '../services/eamsStore';
import type { MaintenanceRecord, RepairStatus } from '../types/eams';
import { computeWarrantyAlerts, hasPermission } from '../utils/assetRules';
import { StatusBadge } from './StatusBadge';

const REFERENCE_DATE = '2026-11-17';

export const MaintenanceView: React.FC = () => {
  const {
    assets,
    assignments,
    maintenanceRecords,
    currentUser,
    createMaintenanceTicket,
    updateMaintenanceTicket,
  } = useEams();

  const [showNewModal, setShowNewModal] = useState(false);
  const [editingTicket, setEditingTicket] = useState<MaintenanceRecord | null>(null);

  const [assetId, setAssetId] = useState(assets[0]?.id || '');
  const [issueDescription, setIssueDescription] = useState('');
  const [reportedDate, setReportedDate] = useState(REFERENCE_DATE);
  const [assignedTechnician, setAssignedTechnician] = useState('Julian Park');
  const [repairVendor, setRepairVendor] = useState('');
  const [repairCost, setRepairCost] = useState('0');
  const [notes, setNotes] = useState('');
  const [repairStatus, setRepairStatus] = useState<RepairStatus>('In Progress');
  const [resolutionDate, setResolutionDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canManageMaint = currentUser
    ? hasPermission(currentUser.role, 'manage_maintenance')
    : false;

  const alerts = useMemo(
    () => computeWarrantyAlerts(assets, assignments, maintenanceRecords, REFERENCE_DATE),
    [assets, assignments, maintenanceRecords]
  );

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId || !issueDescription.trim()) return;
    setSubmitting(true);
    try {
      await createMaintenanceTicket({
        assetId,
        issueDescription: issueDescription.trim(),
        reportedDate,
        assignedTechnician: assignedTechnician.trim(),
        repairVendor: repairVendor.trim(),
        repairCost: Number.parseFloat(repairCost) || 0,
        notes: notes.trim(),
      });
      setShowNewModal(false);
      setIssueDescription('');
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    setSubmitting(true);
    try {
      await updateMaintenanceTicket({
        recordId: editingTicket.id,
        repairStatus,
        assignedTechnician: assignedTechnician.trim(),
        repairVendor: repairVendor.trim(),
        repairCost: Number.parseFloat(repairCost) || 0,
        resolutionDate: resolutionDate || undefined,
        notes: notes.trim(),
      });
      setEditingTicket(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 4 Automated Alert Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-amber-800">
            <span>Warranty Expiring ≤ 30 Days</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-900">
            {alerts.expiringSoon.length}
          </div>
          <div className="text-xs text-slate-600 space-y-0.5">
            {alerts.expiringSoon.slice(0, 2).map((item) => (
              <div key={item.asset.id} className="truncate">
                {item.asset.assetCode} ({item.daysRemaining}d left)
              </div>
            ))}
            {alerts.expiringSoon.length === 0 && <div>None expiring soon</div>}
          </div>
        </div>

        <div className="bg-white border border-rose-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-rose-800">
            <span>Warranty Already Expired</span>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-900">
            {alerts.expired.length}
          </div>
          <div className="text-xs text-slate-600 space-y-0.5">
            {alerts.expired.slice(0, 2).map((item) => (
              <div key={item.asset.id} className="truncate">
                {item.asset.assetCode} ({item.daysOverdue}d ago)
              </div>
            ))}
            {alerts.expired.length === 0 && <div>All covered</div>}
          </div>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-blue-800">
            <span>Assets Pending Repair</span>
            <Wrench className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-blue-900">
            {alerts.pendingRepairs.length}
          </div>
          <div className="text-xs text-slate-600 space-y-0.5">
            {alerts.pendingRepairs.slice(0, 2).map((m) => (
              <div key={m.id} className="truncate">
                {m.assetCode || m.assetId} · {m.repairStatus}
              </div>
            ))}
            {alerts.pendingRepairs.length === 0 && <div>No open tickets</div>}
          </div>
        </div>

        <div className="bg-white border border-rose-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-rose-800">
            <span>Overdue Expected Returns</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-900">
            {alerts.overdueReturns.length}
          </div>
          <div className="text-xs text-slate-600 space-y-0.5">
            {alerts.overdueReturns.slice(0, 2).map((item) => (
              <div key={item.assignment.id} className="truncate">
                {item.assignment.assetCode} ({item.assignment.employeeName})
              </div>
            ))}
            {alerts.overdueReturns.length === 0 && <div>All returns on schedule</div>}
          </div>
        </div>
      </section>

      {/* Maintenance Tickets Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Maintenance & Repair Records ({maintenanceRecords.length})
            </h2>
            <p className="text-xs text-slate-500">
              Report hardware malfunctions, track vendor repairs, and resolve service tickets.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAssetId(assets[0]?.id || '');
              setIssueDescription('');
              setRepairVendor('');
              setRepairCost('0');
              setNotes('');
              setShowNewModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Maintenance / Issue
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Issue Description</th>
                <th className="px-4 py-3">Reported</th>
                <th className="px-4 py-3">Technician / Vendor</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {maintenanceRecords.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-semibold text-slate-900">
                      {m.assetCode || m.assetId}
                    </div>
                    <div className="text-xs text-slate-600">{m.assetName}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 max-w-xs">{m.issueDescription}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs text-slate-600">
                    {m.reportedDate}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div>{m.assignedTechnician || 'Unassigned'}</div>
                    <div className="text-slate-400">{m.repairVendor || 'Internal IT'}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    ${(m.repairCost || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={m.repairStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManageMaint ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTicket(m);
                          setRepairStatus(m.repairStatus);
                          setAssignedTechnician(m.assignedTechnician || '');
                          setRepairVendor(m.repairVendor || '');
                          setRepairCost(String(m.repairCost || 0));
                          setResolutionDate(m.resolutionDate || '');
                          setNotes(m.notes || '');
                        }}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        Update Ticket
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Read-only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log New Ticket Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-maint-title"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="new-maint-title" className="text-base font-semibold text-slate-900">
                Report Malfunction / Log Maintenance
              </h2>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                aria-label="Close maintenance modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div>
                <label htmlFor="mnt-asset" className="block text-xs font-medium text-slate-700 mb-1">
                  Asset *
                </label>
                <select
                  id="mnt-asset"
                  required
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetCode} — {a.name} ({a.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="mnt-issue" className="block text-xs font-medium text-slate-700 mb-1">
                  Issue Description *
                </label>
                <textarea
                  id="mnt-issue"
                  rows={2}
                  required
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mnt-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Reported Date
                  </label>
                  <input
                    id="mnt-date"
                    type="date"
                    value={reportedDate}
                    onChange={(e) => setReportedDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="mnt-tech" className="block text-xs font-medium text-slate-700 mb-1">
                    Assigned Technician
                  </label>
                  <input
                    id="mnt-tech"
                    type="text"
                    value={assignedTechnician}
                    onChange={(e) => setAssignedTechnician(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="mnt-vendor" className="block text-xs font-medium text-slate-700 mb-1">
                    Repair Vendor
                  </label>
                  <input
                    id="mnt-vendor"
                    type="text"
                    value={repairVendor}
                    onChange={(e) => setRepairVendor(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="mnt-cost" className="block text-xs font-medium text-slate-700 mb-1">
                    Estimated Cost ($)
                  </label>
                  <input
                    id="mnt-cost"
                    type="number"
                    min="0"
                    value={repairCost}
                    onChange={(e) => setRepairCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                >
                  {submitting ? 'Logging...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Maintenance Modal */}
      {editingTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upd-maint-title"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="upd-maint-title" className="text-base font-semibold text-slate-900">
                Update Repair Ticket ({editingTicket.assetCode})
              </h2>
              <button
                type="button"
                onClick={() => setEditingTicket(null)}
                aria-label="Close update modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="upd-status" className="block text-xs font-medium text-slate-700 mb-1">
                    Repair Status
                  </label>
                  <select
                    id="upd-status"
                    value={repairStatus}
                    onChange={(e) => setRepairStatus(e.target.value as RepairStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {(['Pending', 'In Progress', 'Completed', 'Unrepairable'] as RepairStatus[]).map(
                      (s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="upd-resdate" className="block text-xs font-medium text-slate-700 mb-1">
                    Resolution Date
                  </label>
                  <input
                    id="upd-resdate"
                    type="date"
                    value={resolutionDate}
                    onChange={(e) => setResolutionDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="upd-tech" className="block text-xs font-medium text-slate-700 mb-1">
                    Technician
                  </label>
                  <input
                    id="upd-tech"
                    type="text"
                    value={assignedTechnician}
                    onChange={(e) => setAssignedTechnician(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="upd-cost" className="block text-xs font-medium text-slate-700 mb-1">
                    Final Repair Cost ($)
                  </label>
                  <input
                    id="upd-cost"
                    type="number"
                    min="0"
                    value={repairCost}
                    onChange={(e) => setRepairCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="upd-notes" className="block text-xs font-medium text-slate-700 mb-1">
                  Maintenance Notes
                </label>
                <textarea
                  id="upd-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingTicket(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                >
                  {submitting ? 'Saving...' : 'Save Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
