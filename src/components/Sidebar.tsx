import React from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  ClipboardList,
  CornerDownLeft,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  UserMinus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type { NavTab, UserRole } from '../types/eams';
import { hasPermission } from '../utils/assetRules';

export interface NavItem {
  id: NavTab;
  label: string;
  icon: React.FC<{ className?: string }>;
  badgeCount?: number;
}

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  orgName: string;
  role: UserRole;
  pendingRequestsCount: number;
  pendingOffboardingCount: number;
  pendingMaintenanceCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  orgName,
  role,
  pendingRequestsCount,
  pendingOffboardingCount,
  pendingMaintenanceCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const isStaff = role !== 'Employee';

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'employees',
      label: isStaff ? 'Employees' : 'My Profile',
      icon: Users,
    },
    { id: 'inventory', label: 'Asset Inventory', icon: Package },
    ...(hasPermission(role, 'assign_return_asset')
      ? [{ id: 'allocation' as NavTab, label: 'Asset Allocation', icon: ArrowLeftRight }]
      : []),
    {
      id: 'requests',
      label: 'Asset Requests',
      icon: ClipboardList,
      badgeCount: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
    },
    ...(hasPermission(role, 'assign_return_asset')
      ? [{ id: 'returns' as NavTab, label: 'Asset Returns', icon: CornerDownLeft }]
      : []),
    {
      id: 'maintenance',
      label: 'Maintenance',
      icon: Wrench,
      badgeCount: pendingMaintenanceCount > 0 ? pendingMaintenanceCount : undefined,
    },
    ...(hasPermission(role, 'manage_offboarding') || role === 'IT Admin' || role === 'Super Admin'
      ? [
          {
            id: 'offboarding' as NavTab,
            label: 'Offboarding',
            icon: UserMinus,
            badgeCount: pendingOffboardingCount > 0 ? pendingOffboardingCount : undefined,
          },
        ]
      : []),
    ...(hasPermission(role, 'view_reports')
      ? [{ id: 'reports' as NavTab, label: 'Reports', icon: BarChart3 }]
      : []),
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64 shrink-0">
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight text-slate-900 truncate">
              {orgName || 'Dextra'}
            </div>
            <div className="text-[10px] font-medium text-slate-500 leading-none">
              AssetLedger
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.badgeCount === 'number' && (
                <span
                  className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {item.badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 text-xs text-slate-500">
        <div className="font-medium text-slate-700">{orgName || 'Dextra'} Asset Governance</div>
        <div className="mt-0.5">Role: {role}</div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-screen sticky top-0 no-print">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-50 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
};
