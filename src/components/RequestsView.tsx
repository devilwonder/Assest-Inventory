import React, { useMemo, useState } from 'react';
import { Check, ClipboardList, Plus, X, XCircle } from 'lucide-react';
import { useEams } from '../services/eamsStore';
import type { AssetRequest, RequestUrgency } from '../types/eams';
import { canTransitionRequest } from '../utils/assetRules';
import { StatusBadge } from './StatusBadge';

const REQUEST_CATEGORIES = [
  'Laptop',
  'Monitor',
  'Keyboard / Mouse',
  'Mobile Phone',
  'Headphones',
  'Tablet',
  'Other Equipment',
];

export const RequestsView: React.FC = () => {
  const {
    requests,
    assets,
    employees,
    currentUser,
    createAssetRequest,
    transitionAssetRequest,
    assignAssets,
  } = useEams();

  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [showNewModal, setShowNewModal] = useState(false);
  const [category, setCategory] = useState('Laptop');
  const [urgency, setUrgency] = useState<RequestUrgency>('Normal');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Modal for IT fulfillment (assigning an available asset to an IT-Approved request)
  const [fulfillReq, setFulfillReq] = useState<AssetRequest | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [rejectReq, setRejectReq] = useState<AssetRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const role = currentUser?.role || 'Employee';

  const availableAssets = useMemo(
    () => assets.filter((a) => a.status === 'Available' || a.status === 'Purchased'),
    [assets]
  );

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => statusFilter === 'All' || r.status === statusFilter);
  }, [requests, statusFilter]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!justification.trim()) {
      setFormError('Please provide a business justification.');
      return;
    }
    setSubmitting(true);
    try {
      await createAssetRequest({
        category,
        urgency,
        justification: justification.trim(),
      });
      setShowNewModal(false);
      setJustification('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFulfillAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fulfillReq || !selectedAssetId) return;
    const emp =
      employees.find((empItem) => empItem.id === fulfillReq.requesterEmployeeId) ||
      employees.find((empItem) => empItem.fullName === fulfillReq.requesterName);
    if (!emp) {
      setFormError('Could not resolve requester employee record.');
      return;
    }
    setSubmitting(true);
    try {
      await assignAssets({
        employeeIds: [emp.id],
        assetIds: [selectedAssetId],
        issueDate: '2026-11-17',
        conditionAtIssue: 'Good',
        accessoriesIncluded: 'Standard Kit',
        remarks: `Fulfilled Asset Request ${fulfillReq.id}`,
      });
      await transitionAssetRequest({
        requestId: fulfillReq.id,
        nextStatus: 'Assigned',
        assignedAssetId: selectedAssetId,
      });
      setFulfillReq(null);
      setSelectedAssetId('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {['All', 'Requested', 'Manager Approved', 'IT Approved', 'Assigned', 'Rejected'].map(
            (st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            )
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError('');
            setShowNewModal(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New Asset Request
        </button>
      </div>

      {/* Pipeline Explanation Strip */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <ClipboardList className="w-4 h-4 text-slate-500 shrink-0" />
        <span className="font-medium text-slate-800">Approval Workflow:</span>
        <span>Requested</span>
        <span aria-hidden="true">→</span>
        <span>Manager Approved</span>
        <span aria-hidden="true">→</span>
        <span>IT Approved</span>
        <span aria-hidden="true">→</span>
        <span>Assigned / Rejected</span>
      </div>

      {/* Requests Table */}
      {filteredRequests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <div className="text-sm font-medium text-slate-900">No asset requests in this queue</div>
          <p className="text-xs text-slate-500">Submit a new equipment request to begin.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                  <th className="px-4 py-3">Requester</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Urgency</th>
                  <th className="px-4 py-3">Justification</th>
                  <th className="px-4 py-3">Approval Trail</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Workflow Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req) => {
                  const canMgrApprove = canTransitionRequest(role, req.status, 'Manager Approved');
                  const canItApprove = canTransitionRequest(role, req.status, 'IT Approved');
                  const canAssign = canTransitionRequest(role, req.status, 'Assigned');
                  const canReject = canTransitionRequest(role, req.status, 'Rejected');

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{req.requesterName}</div>
                        <div className="text-xs text-slate-500">{req.department}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {req.category}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={req.urgency} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-xs">
                        {req.justification}
                        {req.rejectionReason && (
                          <div className="text-rose-700 mt-1">Reason: {req.rejectionReason}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 space-y-0.5">
                        {req.managerApprovedBy && <div>Mgr: {req.managerApprovedBy}</div>}
                        {req.itApprovedBy && <div>IT: {req.itApprovedBy}</div>}
                        {!req.managerApprovedBy && !req.itApprovedBy && <span>Awaiting review</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={req.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                        {canMgrApprove && (
                          <button
                            type="button"
                            onClick={() =>
                              transitionAssetRequest({
                                requestId: req.id,
                                nextStatus: 'Manager Approved',
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Manager Approve
                          </button>
                        )}
                        {canItApprove && (
                          <button
                            type="button"
                            onClick={() =>
                              transitionAssetRequest({
                                requestId: req.id,
                                nextStatus: 'IT Approved',
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                          >
                            <Check className="w-3.5 h-3.5" />
                            IT Approve
                          </button>
                        )}
                        {canAssign && (
                          <button
                            type="button"
                            onClick={() => {
                              setFulfillReq(req);
                              setSelectedAssetId(availableAssets[0]?.id || '');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
                          >
                            Fulfill & Assign
                          </button>
                        )}
                        {canReject && (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectReq(req);
                              setRejectionReason('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        )}
                        {!canMgrApprove && !canItApprove && !canAssign && !canReject && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-req-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="new-req-title" className="text-base font-semibold text-slate-900">
                Submit Asset Request
              </h2>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                aria-label="Close request modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
                  {formError}
                </div>
              )}
              <div>
                <label htmlFor="req-cat" className="block text-xs font-medium text-slate-700 mb-1">
                  Equipment Category
                </label>
                <select
                  id="req-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {REQUEST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="req-urg" className="block text-xs font-medium text-slate-700 mb-1">
                  Urgency
                </label>
                <select
                  id="req-urg"
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as RequestUrgency)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {(['Low', 'Normal', 'High', 'Urgent'] as RequestUrgency[]).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="req-just" className="block text-xs font-medium text-slate-700 mb-1">
                  Business Justification *
                </label>
                <textarea
                  id="req-just"
                  rows={3}
                  required
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Describe why this hardware is required..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
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
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fulfill & Assign Modal */}
      {fulfillReq && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fulfill-req-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="fulfill-req-title" className="text-base font-semibold text-slate-900">
                Fulfill Request for {fulfillReq.requesterName}
              </h2>
              <button
                type="button"
                onClick={() => setFulfillReq(null)}
                aria-label="Close fulfill modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleFulfillAssign} className="p-5 space-y-4">
              <div className="text-xs text-slate-600">
                Requested Category: <span className="font-semibold text-slate-900">{fulfillReq.category}</span>
              </div>
              <div>
                <label htmlFor="fulfill-asset" className="block text-xs font-medium text-slate-700 mb-1">
                  Select Available Stockroom Asset *
                </label>
                <select
                  id="fulfill-asset"
                  required
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {availableAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetCode} — {a.name} ({a.category})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setFulfillReq(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedAssetId}
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50"
                >
                  {submitting ? 'Assigning...' : 'Assign & Complete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Request Modal */}
      {rejectReq && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-req-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="reject-req-title" className="text-base font-semibold text-slate-900">
                Reject Asset Request
              </h2>
              <button
                type="button"
                onClick={() => setRejectReq(null)}
                aria-label="Close reject modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await transitionAssetRequest({
                  requestId: rejectReq.id,
                  nextStatus: 'Rejected',
                  rejectionReason: rejectionReason.trim() || 'Declined by reviewer',
                });
                setRejectReq(null);
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label htmlFor="reject-reason" className="block text-xs font-medium text-slate-700 mb-1">
                  Rejection Reason *
                </label>
                <textarea
                  id="reject-reason"
                  rows={3}
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRejectReq(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700"
                >
                  Confirm Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
