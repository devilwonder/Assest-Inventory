import React, { useState } from 'react';
import { Building2, MapPin, RotateCcw, Shield, UserCog } from 'lucide-react';
import { useEams } from '../services/eamsStore';
import { USER_ROLES, type UserRole } from '../types/eams';
import { hasPermission } from '../utils/assetRules';
import { ConfirmDialog } from './ConfirmDialog';

const PERMISSION_ROWS: Array<{ capability: string; roles: Record<UserRole, string> }> = [
  {
    capability: 'Manage Users, Roles & System Settings',
    roles: { 'Super Admin': 'Full', 'IT Admin': '—', 'HR Admin': '—', 'Department Manager': '—', Employee: '—' },
  },
  {
    capability: 'Manage Asset Inventory (Add, Edit, Retire)',
    roles: { 'Super Admin': 'Full', 'IT Admin': 'Full', 'HR Admin': 'View', 'Department Manager': 'View', Employee: 'Own' },
  },
  {
    capability: 'Assign & Return Assets',
    roles: { 'Super Admin': 'Full', 'IT Admin': 'Full', 'HR Admin': '—', 'Department Manager': '—', Employee: 'Acknowledge' },
  },
  {
    capability: 'Manage Employees & Offboarding Clearance',
    roles: { 'Super Admin': 'Full', 'IT Admin': 'Returns', 'HR Admin': 'Full', 'Department Manager': 'Team', Employee: 'Self' },
  },
  {
    capability: 'Approve Asset Requests',
    roles: { 'Super Admin': 'All Stages', 'IT Admin': 'IT Stage', 'HR Admin': '—', 'Department Manager': 'Manager Stage', Employee: 'Submit' },
  },
  {
    capability: 'Manage Maintenance & Repair Vendors',
    roles: { 'Super Admin': 'Full', 'IT Admin': 'Full', 'HR Admin': '—', 'Department Manager': '—', Employee: 'Report Issue' },
  },
];

export const SettingsView: React.FC = () => {
  const {
    mode,
    currentUser,
    departments,
    locations,
    users,
    auditLogs,
    addDepartment,
    addLocation,
    updateUserRole,
    switchDemoRole,
    resetDemoData,
  } = useEams();

  const [deptName, setDeptName] = useState('');
  const [deptHead, setDeptHead] = useState('');
  const [costCenter, setCostCenter] = useState('');

  const [locName, setLocName] = useState('');
  const [locCity, setLocCity] = useState('');
  const [locCountry, setLocCountry] = useState('');

  const [auditSearch, setAuditSearch] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const canManageSettings = currentUser ? hasPermission(currentUser.role, 'manage_settings') : false;

  const filteredLogs = auditLogs.filter((l) => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      l.summary.toLowerCase().includes(q) ||
      l.actorName.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Organization Structure: Departments & Locations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">Departments ({departments.length})</h2>
          </div>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
            {departments.map((d) => (
              <div key={d.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-slate-900">{d.name}</div>
                  <div className="text-slate-500">Head: {d.headName || 'Unassigned'}</div>
                </div>
                <span className="font-mono text-slate-500">{d.costCenter || '—'}</span>
              </div>
            ))}
          </div>
          {canManageSettings && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!deptName.trim()) return;
                await addDepartment(deptName, deptHead, costCenter);
                setDeptName('');
                setDeptHead('');
                setCostCenter('');
              }}
              className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100"
            >
              <input
                type="text"
                placeholder="Dept Name *"
                aria-label="New department name"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Dept Head"
                aria-label="Department head"
                value={deptHead}
                onChange={(e) => setDeptHead(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                Add Dept
              </button>
            </form>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">Office Locations ({locations.length})</h2>
          </div>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
            {locations.map((l) => (
              <div key={l.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                <div className="font-medium text-slate-900">{l.name}</div>
                <span className="text-slate-500">
                  {[l.city, l.country].filter(Boolean).join(', ')}
                </span>
              </div>
            ))}
          </div>
          {canManageSettings && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!locName.trim()) return;
                await addLocation(locName, locCity, locCountry);
                setLocName('');
                setLocCity('');
                setLocCountry('');
              }}
              className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100"
            >
              <input
                type="text"
                placeholder="Location Name *"
                aria-label="New location name"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="City"
                aria-label="Location city"
                value={locCity}
                onChange={(e) => setLocCity(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                Add Location
              </button>
            </form>
          )}
        </div>
      </div>

      {/* RBAC Matrix + User Role Assignments */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-semibold text-slate-900">
              Role-Based Access Control (RBAC) Matrix
            </h2>
          </div>
          {mode === 'demo' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Active Persona:</span>
              <select
                value={currentUser?.role}
                aria-label="Switch demo role in settings"
                onChange={(e) => switchDemoRole(e.target.value as UserRole)}
                className="text-xs font-medium border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50"
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-3 font-semibold">Capability</th>
                {USER_ROLES.map((r) => (
                  <th key={r} className="px-4 py-3 font-semibold">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PERMISSION_ROWS.map((row) => (
                <tr key={row.capability}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{row.capability}</td>
                  {USER_ROLES.map((r) => (
                    <td key={r} className="px-4 py-2.5 text-slate-600">
                      {row.roles[r]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Access Management */}
      {canManageSettings && users.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <UserCog className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-semibold text-slate-900">User Role Assignments</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Assigned Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.uid}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{u.displayName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                    <td className="px-4 py-2.5 text-slate-600">{u.department || '—'}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={u.role}
                        aria-label={`Role for ${u.displayName}`}
                        onChange={(e) => updateUserRole(u.uid, e.target.value as UserRole)}
                        className="px-2.5 py-1 border border-slate-300 rounded-md bg-white text-slate-800"
                      >
                        {USER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Immutable Audit Trail */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Audit Logs ({filteredLogs.length})
            </h2>
            <p className="text-xs text-slate-500">Append-only record of all system modifications.</p>
          </div>
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Filter audit trail..."
              aria-label="Filter audit logs"
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
            {mode === 'demo' && (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Demo Seed
              </button>
            )}
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
          {filteredLogs.map((log) => (
            <div key={log.id} className="px-5 py-2.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="font-mono font-semibold text-slate-800 mr-2">{log.action}</span>
                <span className="text-slate-700">{log.summary}</span>
                <span className="text-slate-400 ml-2">by {log.actorName}</span>
              </div>
              <span className="font-mono tabular-nums text-slate-400 shrink-0">
                {log.timestamp.replace('T', ' ').slice(0, 19)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset Demo Workspace Data?"
        description="This restores the original 30 seeded employees, 50 hardware assets, assignments, and requests."
        confirmLabel="Reset Seed Data"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemoData();
          setConfirmReset(false);
        }}
      />
    </div>
  );
};
