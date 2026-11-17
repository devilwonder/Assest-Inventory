import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Package,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { useEams } from '../services/eamsStore';
import type { AssetStatus, NavTab } from '../types/eams';
import { computeDashboardMetrics, computeWarrantyAlerts } from '../utils/assetRules';
import { StatusBadge } from './StatusBadge';

interface DashboardViewProps {
  onNavigate: (tab: NavTab, statusFilter?: AssetStatus | 'All') => void;
}

const REFERENCE_DATE = '2026-11-17';

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { assets, employees, assignments, requests, maintenanceRecords, auditLogs, currentUser } =
    useEams();

  const metrics = useMemo(
    () => computeDashboardMetrics(assets, employees, assignments, requests, REFERENCE_DATE),
    [assets, employees, assignments, requests]
  );

  const alerts = useMemo(
    () => computeWarrantyAlerts(assets, assignments, maintenanceRecords, REFERENCE_DATE),
    [assets, assignments, maintenanceRecords]
  );

  const pendingRequests = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === 'Requested' ||
          r.status === 'Manager Approved' ||
          r.status === 'IT Approved'
      ),
    [requests]
  );

  const kpiCards: Array<{
    label: string;
    value: string | number;
    subtext: string;
    filter?: AssetStatus | 'All';
    tone: string;
  }> = [
    {
      label: 'Total Assets',
      value: metrics.totalAssets,
      subtext: 'All tracked inventory',
      filter: 'All',
      tone: 'text-slate-900',
    },
    {
      label: 'Available Assets',
      value: metrics.availableAssets,
      subtext: 'Ready to assign',
      filter: 'Available',
      tone: 'text-emerald-700',
    },
    {
      label: 'Assigned Assets',
      value: metrics.assignedAssets,
      subtext: 'Active employee custody',
      filter: 'Assigned',
      tone: 'text-blue-700',
    },
    {
      label: 'Under Maintenance',
      value: metrics.underMaintenanceAssets,
      subtext: 'In repair workflow',
      filter: 'Under Maintenance',
      tone: 'text-amber-700',
    },
    {
      label: 'Damaged Assets',
      value: metrics.damagedAssets,
      subtext: 'Needs evaluation',
      filter: 'Damaged',
      tone: 'text-rose-700',
    },
    {
      label: 'Lost Assets',
      value: metrics.lostAssets,
      subtext: 'Missing / incident open',
      filter: 'Lost',
      tone: 'text-rose-700',
    },
    {
      label: 'Retired Assets',
      value: metrics.retiredAssets,
      subtext: 'Decommissioned / disposed',
      filter: 'Retired',
      tone: 'text-slate-600',
    },
    {
      label: 'Total Purchase Value',
      value: `$${metrics.totalPurchaseValue.toLocaleString()}`,
      subtext: 'Gross hardware capitalization',
      filter: 'All',
      tone: 'text-slate-900',
    },
  ];

  // Monthly trend SVG geometry
  const maxTrendVal = Math.max(
    1,
    ...metrics.monthlyTrends.flatMap((m) => [m.issued, m.returned])
  );
  const svgW = 460;
  const svgH = 160;
  const padX = 28;
  const padY = 18;
  const stepX = (svgW - padX * 2) / Math.max(1, metrics.monthlyTrends.length - 1);

  const issuedPoints = metrics.monthlyTrends
    .map((m, i) => {
      const x = padX + i * stepX;
      const y = svgH - padY - (m.issued / maxTrendVal) * (svgH - padY * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const returnedPoints = metrics.monthlyTrends
    .map((m, i) => {
      const x = padX + i * stepX;
      const y = svgH - padY - (m.returned / maxTrendVal) * (svgH - padY * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const maxCategoryCount = Math.max(1, ...metrics.byCategory.map((c) => c.count));
  const maxDeptCount = Math.max(1, ...metrics.byDepartment.map((d) => d.count));
  const maxLocCount = Math.max(1, ...metrics.byLocation.map((l) => l.count));

  const conditionColors: Record<string, string> = {
    New: 'bg-emerald-600',
    Good: 'bg-blue-600',
    Fair: 'bg-amber-500',
    Poor: 'bg-orange-600',
    Damaged: 'bg-rose-600',
  };

  return (
    <div className="space-y-6">
      {/* Executive Welcome + Operational Alerts Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Asset Operations Overview
          </h2>
          <p className="text-sm text-slate-500">
            Signed in as {currentUser?.displayName} ({currentUser?.role}) · Portfolio valuation{' '}
            <span className="font-mono tabular-nums text-slate-800 font-medium">
              ${metrics.totalPurchaseValue.toLocaleString()}
            </span>{' '}
            across <span className="font-mono tabular-nums">{metrics.totalAssets}</span> assets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('maintenance')}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              {alerts.expiringSoon.length} Expiring ≤30d · {alerts.expired.length} Expired
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('requests')}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span className="tabular-nums">{metrics.pendingRequestsCount} Pending Requests</span>
          </button>
        </div>
      </div>

      {/* 8 KPI Cards */}
      <section aria-label="Key Performance Indicators" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => onNavigate('inventory', kpi.filter)}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors group"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{kpi.label}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 transition-colors" />
            </div>
            <div className={`mt-2 text-2xl font-bold font-mono tabular-nums tracking-tight ${kpi.tone}`}>
              {kpi.value}
            </div>
            <div className="mt-1 text-xs text-slate-400">{kpi.subtext}</div>
          </button>
        ))}
      </section>

      {/* 6 Visual Charts Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1. Asset Distribution by Category */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Assets by Category</h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {metrics.byCategory.length} categories
            </span>
          </div>
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {metrics.byCategory.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No assets registered yet. Add or import assets in Inventory.
              </p>
            ) : (
              metrics.byCategory.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 font-medium truncate">{item.label}</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {item.count} · ${item.value.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-700 rounded-full"
                      style={{ width: `${Math.max(6, (item.count / maxCategoryCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 2. Assets by Department */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Assigned Assets by Department</h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {metrics.assignedAssets} active
            </span>
          </div>
          <div className="space-y-2.5">
            {metrics.byDepartment.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-medium truncate">{item.label}</span>
                  <span className="font-mono tabular-nums text-slate-600">{item.count}</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-800 rounded-full"
                    style={{ width: `${Math.max(8, (item.count / maxDeptCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Assets by Location */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Assets by Location</h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {metrics.byLocation.length} offices
            </span>
          </div>
          <div className="space-y-3">
            {metrics.byLocation.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No location inventory recorded yet.
              </p>
            ) : (
              metrics.byLocation.map((item) => {
                const pct = Math.round((item.count / Math.max(1, metrics.totalAssets)) * 100);
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 font-medium truncate">{item.label}</span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {item.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{ width: `${Math.max(8, (item.count / maxLocCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 4. Monthly Asset Allocation Trends */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Monthly Asset Allocation Trends
              </h3>
              <p className="text-xs text-slate-500">Issuances vs. returns over the last 6 months</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-700" />
                Issued
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
                Returned
              </span>
            </div>
          </div>
          <div className="w-full overflow-hidden">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-44" role="img" aria-label="Monthly asset allocation trends">
              {[0.25, 0.5, 0.75, 1].map((frac) => {
                const y = svgH - padY - frac * (svgH - padY * 2);
                return (
                  <line
                    key={frac}
                    x1={padX}
                    y1={y}
                    x2={svgW - padX}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="3 3"
                  />
                );
              })}
              <polyline
                fill="none"
                stroke="#1d4ed8"
                strokeWidth="2.5"
                strokeLinejoin="round"
                points={issuedPoints}
              />
              <polyline
                fill="none"
                stroke="#059669"
                strokeWidth="2.5"
                strokeLinejoin="round"
                points={returnedPoints}
              />
              {metrics.monthlyTrends.map((m, i) => {
                const x = padX + i * stepX;
                const yIss = svgH - padY - (m.issued / maxTrendVal) * (svgH - padY * 2);
                const yRet = svgH - padY - (m.returned / maxTrendVal) * (svgH - padY * 2);
                return (
                  <g key={m.month}>
                    <circle cx={x} cy={yIss} r="4" fill="#1d4ed8" />
                    <circle cx={x} cy={yRet} r="4" fill="#059669" />
                    <text
                      x={x}
                      y={svgH - 2}
                      textAnchor="middle"
                      className="fill-slate-500 text-[11px] font-mono"
                    >
                      {m.month}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="grid grid-cols-6 gap-2 pt-2 border-t border-slate-100 text-center">
            {metrics.monthlyTrends.map((m) => (
              <div key={m.month} className="text-xs">
                <div className="font-medium text-slate-500">{m.month}</div>
                <div className="font-mono tabular-nums text-slate-900">
                  +{m.issued} / -{m.returned}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5 & 6. Condition Distribution + Upcoming Warranty Expirations */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Asset Condition Distribution</h3>
            <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-100">
              {metrics.byCondition.map((c) => (
                <div
                  key={c.label}
                  className={conditionColors[c.label] || 'bg-slate-400'}
                  style={{ width: `${(c.count / Math.max(1, metrics.totalAssets)) * 100}%` }}
                  title={`${c.label}: ${c.count}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {metrics.byCondition.map((c) => (
                <div key={c.label} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className={`w-2 h-2 rounded-sm ${conditionColors[c.label] || 'bg-slate-400'}`} />
                    {c.label}
                  </span>
                  <span className="font-mono tabular-nums font-medium text-slate-900">{c.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Warranty Expirations</h3>
              <button
                type="button"
                onClick={() => onNavigate('maintenance')}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                Inspect
              </button>
            </div>
            <div className="space-y-2">
              {metrics.warrantyBuckets.map((b) => {
                const badgeBg =
                  b.tone === 'critical'
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : b.tone === 'warning'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : b.tone === 'healthy'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-50 text-slate-700 border-slate-200';
                return (
                  <div
                    key={b.label}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs ${badgeBg}`}
                  >
                    <span className="font-medium">{b.label}</span>
                    <span className="font-mono tabular-nums font-semibold">{b.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Row: Pending Requests + Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Pending Asset Requests</h3>
              <p className="text-xs text-slate-500">Requests awaiting Manager or IT action</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('requests')}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Open Queue
            </button>
          </div>
          {pendingRequests.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              All asset requests have been fulfilled or closed.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingRequests.slice(0, 5).map((req) => (
                <div key={req.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {req.requesterName} · {req.category}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {req.department} · Urgency: {req.urgency}
                    </div>
                  </div>
                  <StatusBadge label={req.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Recent Asset Activity</h3>
              <p className="text-xs text-slate-500">Live audit log of issuances, returns, and updates</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Full Audit Trail
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No audit activity recorded yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="px-5 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm text-slate-900 font-medium truncate">{log.summary}</div>
                    <div className="text-xs text-slate-500">
                      {log.actorName} ({log.actorRole || 'User'}) · {log.action}
                    </div>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                    {log.timestamp.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Critical Operational Alerts Summary */}
      {(alerts.overdueReturns.length > 0 || alerts.pendingRepairs.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Operational Attention Required</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {alerts.overdueReturns.length} overdue expected return(s), {alerts.pendingRepairs.length} active repair ticket(s), and {alerts.expiringSoon.length} warranties expiring within 30 days.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('maintenance')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Wrench className="w-3.5 h-3.5" />
            Review Alerts
          </button>
        </div>
      )}
    </div>
  );
};
