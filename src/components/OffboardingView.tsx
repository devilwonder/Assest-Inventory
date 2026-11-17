import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileText, Printer, UserMinus, X } from 'lucide-react';
import { useEams } from '../services/eamsStore';
import type { Employee, EmploymentStatus, ReturnNextStatus } from '../types/eams';
import { canCompleteOffboarding } from '../utils/assetRules';
import { StatusBadge } from './StatusBadge';

export const OffboardingView: React.FC = () => {
  const {
    employees,
    assignments,
    updateEmployeeStatus,
    returnAsset,
    completeEmployeeClearance,
  } = useEams();

  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [targetEmpId, setTargetEmpId] = useState('');
  const [exitStatus, setExitStatus] = useState<EmploymentStatus>('Resigned');

  const [clearanceReportEmp, setClearanceReportEmp] = useState<Employee | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [busyId, setBusyId] = useState('');

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.employmentStatus === 'Active' || e.employmentStatus === 'On Leave'),
    [employees]
  );

  const offboardingEmployees = useMemo(
    () =>
      employees.filter(
        (e) => e.employmentStatus === 'Resigned' || e.employmentStatus === 'Terminated'
      ),
    [employees]
  );

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEmpId) return;
    await updateEmployeeStatus(targetEmpId, exitStatus);
    setShowInitiateModal(false);
    setTargetEmpId('');
  };

  const handleQuickResolveAsset = async (
    assignmentId: string,
    nextStatus: ReturnNextStatus
  ) => {
    setErrorMsg('');
    setBusyId(assignmentId);
    try {
      await returnAsset({
        assignmentId,
        returnDate: '2026-11-17',
        conditionAtReturn: nextStatus === 'Damaged' ? 'Damaged' : 'Good',
        damageDetails: nextStatus === 'Damaged' ? 'Flagged damaged during exit clearance' : '',
        remarks: 'Processed during Employee Exit Clearance',
        nextAssetStatus: nextStatus,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process asset return.');
    } finally {
      setBusyId('');
    }
  };

  const handleCompleteClearance = async (emp: Employee) => {
    setErrorMsg('');
    setBusyId(emp.id);
    try {
      await completeEmployeeClearance(emp.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to complete clearance.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Employee Exit Clearance Queue</h2>
          <p className="text-xs text-slate-500">
            Track pending asset returns for resigned or terminated staff. Clearance locks until all assets are resolved.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTargetEmpId(activeEmployees[0]?.id || '');
            setShowInitiateModal(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0"
        >
          <UserMinus className="w-3.5 h-3.5" />
          Initiate Offboarding
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
          {errorMsg}
        </div>
      )}

      {offboardingEmployees.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <div className="text-sm font-medium text-slate-900">No active exit clearances</div>
          <p className="text-xs text-slate-500">
            Initiate offboarding for a departing employee to begin asset recovery.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {offboardingEmployees.map((emp) => {
            const empActiveAsgs = assignments.filter(
              (a) => a.employeeId === emp.id && a.status === 'Active'
            );
            const empReturnedAsgs = assignments.filter(
              (a) => a.employeeId === emp.id && a.status === 'Returned'
            );
            const gate = canCompleteOffboarding(emp.id, assignments);
            const isCleared = emp.clearanceStatus === 'Complete';

            return (
              <div key={emp.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-slate-900">{emp.fullName}</span>
                      <span className="font-mono text-xs text-slate-500">{emp.employeeCode}</span>
                      <StatusBadge label={emp.employmentStatus} />
                      <StatusBadge label={emp.clearanceStatus || (gate.allowed ? 'Complete' : 'Pending')} />
                    </div>
                    <div className="text-xs text-slate-500">
                      {emp.department} · {emp.designation} · {emp.location}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setClearanceReportEmp(emp)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Clearance Report
                    </button>
                    {!isCleared && (
                      <button
                        type="button"
                        disabled={!gate.allowed || busyId === emp.id}
                        onClick={() => handleCompleteClearance(emp)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          gate.allowed
                            ? 'Mark employee asset clearance complete'
                            : `${gate.pendingCount} asset(s) still pending return`
                        }
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark Clearance Complete
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 mb-2">
                      Pending Returns ({empActiveAsgs.length})
                    </h3>
                    {empActiveAsgs.length === 0 ? (
                      <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">
                        All assigned company assets have been returned or accounted for.
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                        {empActiveAsgs.map((asg) => (
                          <div
                            key={asg.id}
                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="font-medium text-slate-900">
                                <span className="font-mono mr-2">{asg.assetCode}</span>
                                {asg.assetName}
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                Issued {asg.issueDate} · Condition: {asg.conditionAtIssue}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={busyId === asg.id}
                                onClick={() => handleQuickResolveAsset(asg.id, 'Available')}
                                className="px-3 py-1.5 font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                              >
                                Mark Returned (Available)
                              </button>
                              <button
                                type="button"
                                disabled={busyId === asg.id}
                                onClick={() => handleQuickResolveAsset(asg.id, 'Damaged')}
                                className="px-3 py-1.5 font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                              >
                                Flag Damaged
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {empReturnedAsgs.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-500 mb-1.5">
                        Resolved / Returned Assets ({empReturnedAsgs.length})
                      </h3>
                      <div className="text-xs text-slate-600 space-y-1">
                        {empReturnedAsgs.map((r) => (
                          <div key={r.id}>
                            <span className="font-mono">{r.assetCode}</span> — {r.assetName} (Returned{' '}
                            <span className="font-mono">{r.returnDate}</span>)
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Initiate Offboarding Modal */}
      {showInitiateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="init-offboard-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="init-offboard-title" className="text-base font-semibold text-slate-900">
                Initiate Employee Offboarding
              </h2>
              <button
                type="button"
                onClick={() => setShowInitiateModal(false)}
                aria-label="Close offboarding modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleInitiate} className="p-5 space-y-4">
              <div>
                <label htmlFor="off-emp" className="block text-xs font-medium text-slate-700 mb-1">
                  Select Employee *
                </label>
                <select
                  id="off-emp"
                  required
                  value={targetEmpId}
                  onChange={(e) => setTargetEmpId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName} ({e.employeeCode} · {e.department})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="off-status" className="block text-xs font-medium text-slate-700 mb-1">
                  Exit Classification
                </label>
                <select
                  id="off-status"
                  value={exitStatus}
                  onChange={(e) => setExitStatus(e.target.value as EmploymentStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Resigned">Resigned</option>
                  <option value="Terminated">Terminated</option>
                </select>
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowInitiateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                >
                  Start Exit Clearance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clearance Report Modal */}
      {clearanceReportEmp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clearance-rpt-title"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between no-print">
              <h2 id="clearance-rpt-title" className="text-base font-semibold text-slate-900">
                Employee Asset Clearance Certificate
              </h2>
              <button
                type="button"
                onClick={() => setClearanceReportEmp(null)}
                aria-label="Close clearance report"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                <div>
                  <div className="text-base font-bold text-slate-900">{clearanceReportEmp.fullName}</div>
                  <div className="text-slate-500">
                    {clearanceReportEmp.employeeCode} · {clearanceReportEmp.department} ·{' '}
                    {clearanceReportEmp.employmentStatus}
                  </div>
                </div>
                <StatusBadge
                  label={
                    clearanceReportEmp.clearanceStatus ||
                    (canCompleteOffboarding(clearanceReportEmp.id, assignments).allowed
                      ? 'Complete'
                      : 'Pending')
                  }
                />
              </div>
              <div className="space-y-2">
                <div className="font-semibold text-slate-800">Asset Custody Summary</div>
                {assignments
                  .filter((a) => a.employeeId === clearanceReportEmp.id)
                  .map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between py-1.5 border-b border-slate-100"
                    >
                      <span>
                        <span className="font-mono font-medium">{a.assetCode}</span> — {a.assetName}
                      </span>
                      <span className="font-mono">
                        {a.status === 'Returned' ? `Returned ${a.returnDate}` : 'PENDING RETURN'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5 no-print">
              <button
                type="button"
                onClick={() => setClearanceReportEmp(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
