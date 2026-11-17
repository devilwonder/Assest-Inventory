import React from 'react';
import { LogOut, Menu, Plus } from 'lucide-react';
import type { AppUser, NavTab } from '../types/eams';
import { hasPermission } from '../utils/assetRules';

const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'Executive Dashboard',
  employees: 'Employee Directory',
  inventory: 'Asset Inventory',
  allocation: 'Asset Allocation & Issuance',
  requests: 'Asset Requests & Approvals',
  returns: 'Asset Return Processing',
  maintenance: 'Maintenance & Warranty Alerts',
  offboarding: 'Employee Exit Clearance',
  reports: 'Compliance Reports & Exports',
  settings: 'System Settings & Access Control',
};

interface TopHeaderProps {
  activeTab: NavTab;
  orgName: string;
  currentUser: AppUser;
  onOpenMobileNav: () => void;
  onLogout: () => void;
  onQuickAction: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  orgName,
  currentUser,
  onOpenMobileNav,
  onLogout,
  onQuickAction,
}) => {
  const canManageInv = hasPermission(currentUser.role, 'manage_inventory');

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30 no-print">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 font-medium hidden sm:inline whitespace-nowrap">
            {orgName || 'Dextra'} · AssetLedger
          </span>
          <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
          <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
            {TAB_TITLES[activeTab]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={onQuickAction}
          aria-label={canManageInv ? 'Add Asset' : 'Request Asset'}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{canManageInv ? 'Add Asset' : 'Request Asset'}</span>
          <span className="sm:hidden">{canManageInv ? 'Add' : 'Request'}</span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2.5 pl-2 sm:pl-3 border-l border-slate-200">
          {currentUser.photoUrl ? (
            <img
              src={currentUser.photoUrl}
              alt={currentUser.displayName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-slate-200"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center">
              {currentUser.displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="hidden xl:block text-left leading-tight">
            <div className="text-xs font-semibold text-slate-900 whitespace-nowrap">
              {currentUser.displayName}
            </div>
            <div className="text-[11px] text-slate-500 whitespace-nowrap">
              {currentUser.role}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
