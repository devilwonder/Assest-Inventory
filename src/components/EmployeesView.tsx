import React, { useMemo, useState } from 'react';
import { Check, Download, FileSpreadsheet, Layers, Plus, Search, UserCheck, X } from 'lucide-react';
import { useEams } from '../services/eamsStore';
import {
  EMPLOYMENT_STATUSES,
  type Employee,
  type EmploymentStatus,
} from '../types/eams';
import { generateNextEmployeeCode, hasPermission } from '../utils/assetRules';
import { downloadEmployeeImportTemplate } from '../utils/excelImport';
import { ExcelImportModal } from './ExcelImportModal';
import { StatusBadge } from './StatusBadge';

export const EmployeesView: React.FC = () => {
  const {
    employees,
    assignments,
    departments,
    locations,
    currentUser,
    saveEmployee,
    bulkImportEmployees,
    acknowledgeAssignment,
  } = useEams();

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [groupByDept, setGroupByDept] = useState(false);

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [formState, setFormState] = useState({
    fullName: '',
    email: '',
    phone: '',
    department: departments[0]?.name || 'Engineering',
    designation: '',
    reportingManager: '',
    joiningDate: '2026-11-17',
    employmentStatus: 'Active' as EmploymentStatus,
    location: locations[0]?.name || 'San Francisco HQ',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const canManageEmployees = currentUser ? hasPermission(currentUser.role, 'manage_employees') : false;

  const activeCountByEmp = useMemo(() => {
    const map = new Map<string, number>();
    for (const asg of assignments) {
      if (asg.status === 'Active') {
        map.set(asg.employeeId, (map.get(asg.employeeId) || 0) + 1);
      }
    }
    return map;
  }, [assignments]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (deptFilter !== 'All' && e.department !== deptFilter) return false;
      if (statusFilter !== 'All' && e.employmentStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        e.fullName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q)
      );
    });
  }, [employees, search, deptFilter, statusFilter]);

  const groupedEmployees = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const e of filteredEmployees) {
      const list = map.get(e.department) || [];
      list.push(e);
      map.set(e.department, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredEmployees]);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setFormState({
      fullName: '',
      email: '',
      phone: '',
      department: departments[0]?.name || 'Engineering',
      designation: '',
      reportingManager: '',
      joiningDate: '2026-11-17',
      employmentStatus: 'Active',
      location: locations[0]?.name || 'San Francisco HQ',
    });
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormState({
      fullName: emp.fullName,
      email: emp.email,
      phone: emp.phone || '',
      department: emp.department,
      designation: emp.designation,
      reportingManager: emp.reportingManager || '',
      joiningDate: emp.joiningDate,
      employmentStatus: emp.employmentStatus,
      location: emp.location,
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formState.fullName.trim() || !formState.email.trim() || !formState.designation.trim()) {
      setFormError('Full name, email, and designation are required.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveEmployee({
        ...(editingEmployee ? { id: editingEmployee.id, employeeCode: editingEmployee.employeeCode } : {}),
        fullName: formState.fullName.trim(),
        email: formState.email.trim(),
        phone: formState.phone.trim(),
        department: formState.department,
        designation: formState.designation.trim(),
        reportingManager: formState.reportingManager.trim(),
        joiningDate: formState.joiningDate,
        employmentStatus: formState.employmentStatus,
        location: formState.location,
      });
      if (selectedEmployee?.id === saved.id) setSelectedEmployee(saved);
      setShowModal(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save employee.');
    } finally {
      setSaving(false);
    }
  };

  const employeeDetailAssignments = useMemo(() => {
    if (!selectedEmployee) return { current: [], previous: [] };
    const all = assignments.filter((a) => a.employeeId === selectedEmployee.id);
    return {
      current: all.filter((a) => a.status === 'Active'),
      previous: all.filter((a) => a.status === 'Returned'),
    };
  }, [assignments, selectedEmployee]);

  const renderEmployeeRows = (list: Employee[]) =>
    list.map((emp) => {
      const assignedCount = activeCountByEmp.get(emp.id) || 0;
      return (
        <tr
          key={emp.id}
          className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-sm"
        >
          <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
            {emp.employeeCode}
          </td>
          <td className="px-4 py-3">
            <button
              type="button"
              onClick={() => setSelectedEmployee(emp)}
              className="flex items-center gap-3 text-left group"
            >
              {emp.photoUrl ? (
                <img
                  src={emp.photoUrl}
                  alt={emp.fullName}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center shrink-0">
                  {emp.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
              )}
              <div>
                <div className="font-medium text-slate-900 group-hover:text-blue-700">
                  {emp.fullName}
                </div>
                <div className="text-xs text-slate-500">{emp.email}</div>
              </div>
            </button>
          </td>
          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{emp.department}</td>
          <td className="px-4 py-3 text-slate-600">{emp.designation}</td>
          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{emp.location}</td>
          <td className="px-4 py-3">
            <StatusBadge label={emp.employmentStatus} />
          </td>
          <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-slate-900">
            {assignedCount}
          </td>
          <td className="px-4 py-3 text-right whitespace-nowrap">
            <button
              type="button"
              onClick={() => setSelectedEmployee(emp)}
              className="text-xs font-medium text-blue-700 hover:underline mr-3"
            >
              View Profile
            </button>
            {canManageEmployees && (
              <button
                type="button"
                onClick={() => openEditModal(emp)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Edit
              </button>
            )}
          </td>
        </tr>
      );
    });

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, email, role..."
              aria-label="Search employees"
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter by department"
            className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="All">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by employment status"
            className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="All">All Statuses</option>
            {EMPLOYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setGroupByDept((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              groupByDept
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Group by Department
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500 tabular-nums mr-1">
            Showing {filteredEmployees.length} of {employees.length}
          </span>
          {canManageEmployees && (
            <>
              <button
                type="button"
                onClick={() =>
                  downloadEmployeeImportTemplate(
                    departments.map((d) => d.name),
                    locations.map((l) => l.name)
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Template
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Import Excel
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Employee
              </button>
            </>
          )}
        </div>
      </div>

      {/* Employee Directory Table or Department Groups */}
      {filteredEmployees.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <div className="text-sm font-medium text-slate-900">No employees match your filters</div>
          <p className="text-xs text-slate-500">Adjust your search term or department filter.</p>
        </div>
      ) : groupByDept ? (
        <div className="space-y-5">
          {groupedEmployees.map(([deptName, list]) => (
            <div key={deptName} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{deptName}</h3>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {list.length} employee(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-white">
                      <th className="px-4 py-2.5">ID</th>
                      <th className="px-4 py-2.5">Employee</th>
                      <th className="px-4 py-2.5">Department</th>
                      <th className="px-4 py-2.5">Designation</th>
                      <th className="px-4 py-2.5">Location</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Assigned</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>{renderEmployeeRows(list)}</tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                  <th className="px-4 py-3">Employee ID</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Assigned Assets</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>{renderEmployeeRows(filteredEmployees)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Employee Detail Drawer */}
      {selectedEmployee && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-detail-title"
        >
          <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-xl border-l border-slate-200 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                {selectedEmployee.photoUrl ? (
                  <img
                    src={selectedEmployee.photoUrl}
                    alt={selectedEmployee.fullName}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-full object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-900 text-white text-sm font-semibold flex items-center justify-center">
                    {selectedEmployee.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                )}
                <div>
                  <h2 id="employee-detail-title" className="text-base font-semibold text-slate-900">
                    {selectedEmployee.fullName}
                  </h2>
                  <div className="text-xs text-slate-500">
                    <span className="font-mono">{selectedEmployee.employeeCode}</span> ·{' '}
                    {selectedEmployee.designation} · {selectedEmployee.department}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                aria-label="Close employee detail"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1">
              {/* Profile Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                  <div className="text-slate-500">Email</div>
                  <div className="font-medium text-slate-900 mt-0.5 break-all">
                    {selectedEmployee.email}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Phone</div>
                  <div className="font-mono text-slate-900 mt-0.5">
                    {selectedEmployee.phone || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Office Location</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {selectedEmployee.location}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Reporting Manager</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {selectedEmployee.reportingManager || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Joining Date</div>
                  <div className="font-mono tabular-nums text-slate-900 mt-0.5">
                    {selectedEmployee.joiningDate}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Total Assigned Assets</div>
                  <div className="font-mono tabular-nums font-bold text-blue-700 mt-0.5 text-sm">
                    {employeeDetailAssignments.current.length}
                  </div>
                </div>
              </div>

              {/* Currently Assigned Assets */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Currently Assigned Assets ({employeeDetailAssignments.current.length})
                  </h3>
                  <StatusBadge label={selectedEmployee.employmentStatus} />
                </div>

                {employeeDetailAssignments.current.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-500 border border-slate-200 rounded-xl">
                    No active assets currently assigned to this employee.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-200">
                    {employeeDetailAssignments.current.map((asg) => (
                      <div key={asg.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-900">
                              {asg.assetCode}
                            </span>
                            <span className="text-sm font-medium text-slate-900">
                              {asg.assetName}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            Issued: <span className="font-mono">{asg.issueDate}</span> · Condition:{' '}
                            <span className="font-medium text-slate-700">{asg.conditionAtIssue}</span> ·
                            Receipt: <span className="font-mono">{asg.receiptNumber}</span>
                          </div>
                          {asg.accessoriesIncluded && (
                            <div className="text-xs text-slate-500">
                              Accessories: {asg.accessoriesIncluded}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">
                          {asg.acknowledgedByEmployee ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
                              <Check className="w-3.5 h-3.5" />
                              Acknowledged
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => acknowledgeAssignment(asg.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Acknowledge Receipt
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Previously Assigned Assets */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Previous Assigned Assets ({employeeDetailAssignments.previous.length})
                </h3>
                {employeeDetailAssignments.previous.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-500 border border-slate-200 rounded-xl">
                    No historical returned assets on record.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="px-3.5 py-2.5">Asset</th>
                          <th className="px-3.5 py-2.5">Issued</th>
                          <th className="px-3.5 py-2.5">Returned</th>
                          <th className="px-3.5 py-2.5">Issue Cond.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {employeeDetailAssignments.previous.map((asg) => (
                          <tr key={asg.id}>
                            <td className="px-3.5 py-2.5">
                              <div className="font-mono font-medium text-slate-900">{asg.assetCode}</div>
                              <div className="text-slate-600">{asg.assetName}</div>
                            </td>
                            <td className="px-3.5 py-2.5 font-mono tabular-nums text-slate-600">
                              {asg.issueDate}
                            </td>
                            <td className="px-3.5 py-2.5 font-mono tabular-nums text-slate-600">
                              {asg.returnDate || '—'}
                            </td>
                            <td className="px-3.5 py-2.5">{asg.conditionAtIssue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-modal-title"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="employee-modal-title" className="text-base font-semibold text-slate-900">
                {editingEmployee
                  ? `Edit Employee (${editingEmployee.employeeCode})`
                  : `Add Employee (${generateNextEmployeeCode(employees)})`}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close employee modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEmployee} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="emp-fullname" className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    id="emp-fullname"
                    type="text"
                    required
                    value={formState.fullName}
                    onChange={(e) => setFormState({ ...formState, fullName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="emp-email" className="block text-xs font-medium text-slate-700 mb-1">
                    Corporate Email *
                  </label>
                  <input
                    id="emp-email"
                    type="email"
                    required
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="emp-phone" className="block text-xs font-medium text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    id="emp-phone"
                    type="text"
                    value={formState.phone}
                    onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="emp-dept" className="block text-xs font-medium text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    id="emp-dept"
                    value={formState.department}
                    onChange={(e) => setFormState({ ...formState, department: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="emp-desig" className="block text-xs font-medium text-slate-700 mb-1">
                    Designation *
                  </label>
                  <input
                    id="emp-desig"
                    type="text"
                    required
                    value={formState.designation}
                    onChange={(e) => setFormState({ ...formState, designation: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="emp-manager" className="block text-xs font-medium text-slate-700 mb-1">
                    Reporting Manager
                  </label>
                  <input
                    id="emp-manager"
                    type="text"
                    value={formState.reportingManager}
                    onChange={(e) => setFormState({ ...formState, reportingManager: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="emp-joining" className="block text-xs font-medium text-slate-700 mb-1">
                    Joining Date
                  </label>
                  <input
                    id="emp-joining"
                    type="date"
                    value={formState.joiningDate}
                    onChange={(e) => setFormState({ ...formState, joiningDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="emp-location" className="block text-xs font-medium text-slate-700 mb-1">
                    Office Location
                  </label>
                  <select
                    id="emp-location"
                    value={formState.location}
                    onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="emp-status" className="block text-xs font-medium text-slate-700 mb-1">
                    Employment Status
                  </label>
                  <select
                    id="emp-status"
                    value={formState.employmentStatus}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        employmentStatus: e.target.value as EmploymentStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {EMPLOYMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ExcelImportModal
        open={showImportModal}
        target="employees"
        existingEmployees={employees}
        departments={departments.map((d) => d.name)}
        locations={locations.map((l) => l.name)}
        onClose={() => setShowImportModal(false)}
        onImportEmployees={bulkImportEmployees}
      />
    </div>
  );
};
