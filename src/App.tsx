import React, { useMemo, useState } from 'react';
import { EamsProvider, useEams } from './services/eamsStore';
import type { AssetStatus, NavTab } from './types/eams';
import { hasPermission } from './utils/assetRules';
import { parseAssetCodeFromSearch } from './utils/assetQr';
import { AllocationView } from './components/AllocationView';
import { AuthGate } from './components/AuthGate';
import { DashboardView } from './components/DashboardView';
import { EmployeesView } from './components/EmployeesView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InventoryView } from './components/InventoryView';
import { MaintenanceView } from './components/MaintenanceView';
import { OffboardingView } from './components/OffboardingView';
import { ReportsView } from './components/ReportsView';
import { RequestsView } from './components/RequestsView';
import { ReturnsView } from './components/ReturnsView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';

function EamsShell() {
  const {
    mode,
    authReady,
    loadingData,
    currentUser,
    requests,
    employees,
    maintenanceRecords,
    switchDemoRole,
    logout,
  } = useEams();

  const [deepLinkedAssetCode] = useState<string | null>(() =>
    parseAssetCodeFromSearch(window.location.search)
  );
  const [activeTab, setActiveTab] = useState<NavTab>(() =>
    parseAssetCodeFromSearch(window.location.search) ? 'inventory' : 'dashboard'
  );
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<AssetStatus | 'All'>('All');
  const [openAddAssetSignal, setOpenAddAssetSignal] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const pendingRequestsCount = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === 'Requested' ||
          r.status === 'Manager Approved' ||
          r.status === 'IT Approved'
      ).length,
    [requests]
  );

  const pendingOffboardingCount = useMemo(
    () =>
      employees.filter(
        (e) =>
          (e.employmentStatus === 'Resigned' || e.employmentStatus === 'Terminated') &&
          e.clearanceStatus !== 'Complete'
      ).length,
    [employees]
  );

  const pendingMaintenanceCount = useMemo(
    () =>
      maintenanceRecords.filter(
        (m) => m.repairStatus === 'Pending' || m.repairStatus === 'In Progress'
      ).length,
    [maintenanceRecords]
  );

  if (mode === 'unauthenticated' && !authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">Initializing AssetLedger workspace...</div>
      </div>
    );
  }

  if (mode === 'unauthenticated' || !currentUser) {
    return <AuthGate />;
  }

  const handleNavigate = (tab: NavTab, statusFilter?: AssetStatus | 'All') => {
    if (tab === 'inventory' && statusFilter) {
      setInventoryStatusFilter(statusFilter);
    }
    setActiveTab(tab);
  };

  const handleQuickAction = () => {
    if (hasPermission(currentUser.role, 'manage_inventory')) {
      setActiveTab('inventory');
      setOpenAddAssetSignal((n) => n + 1);
    } else {
      setActiveTab('requests');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'inventory') setInventoryStatusFilter('All');
          setActiveTab(tab);
        }}
        role={currentUser.role}
        pendingRequestsCount={pendingRequestsCount}
        pendingOffboardingCount={pendingOffboardingCount}
        pendingMaintenanceCount={pendingMaintenanceCount}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          activeTab={activeTab}
          mode={mode}
          currentUser={currentUser}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onSwitchDemoRole={switchDemoRole}
          onLogout={logout}
          onQuickAction={handleQuickAction}
        />

        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          {loadingData ? (
            <div className="space-y-4">
              <div className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="grid grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
              {activeTab === 'employees' && <EmployeesView />}
              {activeTab === 'inventory' && (
                <InventoryView
                  initialStatusFilter={inventoryStatusFilter}
                  openAddSignal={openAddAssetSignal}
                  initialAssetCode={deepLinkedAssetCode}
                />
              )}
              {activeTab === 'allocation' && <AllocationView />}
              {activeTab === 'requests' && <RequestsView />}
              {activeTab === 'returns' && <ReturnsView />}
              {activeTab === 'maintenance' && <MaintenanceView />}
              {activeTab === 'offboarding' && <OffboardingView />}
              {activeTab === 'reports' && <ReportsView />}
              {activeTab === 'settings' && <SettingsView />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <EamsProvider>
        <EamsShell />
      </EamsProvider>
    </ErrorBoundary>
  );
}
