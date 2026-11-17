import type {
  Asset,
  AssetAssignment,
  AssetRequest,
  Employee,
  MaintenanceRecord,
  RequestStatus,
  UserRole,
} from '../types/eams';

export function generateNextAssetCode(existingAssets: Asset[], year = 2026): string {
  const prefix = `AST-${year}-`;
  let maxSeq = 0;
  for (const a of existingAssets) {
    if (a.assetCode.startsWith(prefix)) {
      const seq = Number.parseInt(a.assetCode.slice(prefix.length), 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

export function generateNextEmployeeCode(existingEmployees: Employee[]): string {
  const prefix = 'EMP-';
  let maxSeq = 1000;
  for (const e of existingEmployees) {
    if (e.employeeCode.startsWith(prefix)) {
      const seq = Number.parseInt(e.employeeCode.slice(prefix.length), 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `${prefix}${maxSeq + 1}`;
}

export function generateReceiptNumber(existingAssignments: AssetAssignment[], year = 2026): string {
  const prefix = `HRC-${year}-`;
  let maxSeq = 0;
  for (const asg of existingAssignments) {
    if (asg.receiptNumber?.startsWith(prefix)) {
      const seq = Number.parseInt(asg.receiptNumber.slice(prefix.length), 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

export function validateAssetUniqueness(
  candidate: { assetCode: string; serialNumber: string },
  existingAssets: Asset[],
  ignoreAssetId?: string
): { valid: boolean; error?: string } {
  const normalizedCode = candidate.assetCode.trim().toUpperCase();
  const normalizedSerial = candidate.serialNumber.trim().toUpperCase();

  if (!normalizedCode) return { valid: false, error: 'Asset ID code is required.' };
  if (!normalizedSerial) return { valid: false, error: 'Serial number is required.' };

  for (const a of existingAssets) {
    if (ignoreAssetId && a.id === ignoreAssetId) continue;
    if (a.assetCode.trim().toUpperCase() === normalizedCode) {
      return { valid: false, error: `Duplicate Asset ID "${candidate.assetCode}" already exists.` };
    }
    if (a.serialNumber.trim().toUpperCase() === normalizedSerial) {
      return { valid: false, error: `Duplicate Serial Number "${candidate.serialNumber}" already exists on ${a.assetCode}.` };
    }
  }
  return { valid: true };
}

export function canAssignAsset(asset: Asset): { ok: boolean; reason?: string } {
  if (asset.status === 'Assigned' || asset.assignedEmployeeId) {
    return {
      ok: false,
      reason: `Asset ${asset.assetCode} is already assigned to ${asset.assignedEmployeeName || 'an employee'}.`,
    };
  }
  if (asset.status !== 'Available' && asset.status !== 'Purchased') {
    return {
      ok: false,
      reason: `Asset ${asset.assetCode} cannot be assigned while status is "${asset.status}".`,
    };
  }
  return { ok: true };
}

export interface WarrantyAndOperationalAlerts {
  expiringSoon: Array<{ asset: Asset; daysRemaining: number }>;
  expired: Array<{ asset: Asset; daysOverdue: number }>;
  pendingRepairs: MaintenanceRecord[];
  overdueReturns: Array<{ assignment: AssetAssignment; daysOverdue: number }>;
}

export function computeWarrantyAlerts(
  assets: Asset[],
  assignments: AssetAssignment[],
  maintenanceRecords: MaintenanceRecord[],
  referenceDateStr: string
): WarrantyAndOperationalAlerts {
  const refMs = Date.parse(referenceDateStr);
  const msPerDay = 86_400_000;

  const expiringSoon: Array<{ asset: Asset; daysRemaining: number }> = [];
  const expired: Array<{ asset: Asset; daysOverdue: number }> = [];

  for (const asset of assets) {
    if (!asset.warrantyExpiryDate) continue;
    if (asset.status === 'Retired' || asset.status === 'Disposed') continue;
    const expMs = Date.parse(asset.warrantyExpiryDate);
    if (Number.isNaN(expMs)) continue;
    const diffDays = Math.ceil((expMs - refMs) / msPerDay);
    if (diffDays < 0) {
      expired.push({ asset, daysOverdue: Math.abs(diffDays) });
    } else if (diffDays <= 30) {
      expiringSoon.push({ asset, daysRemaining: diffDays });
    }
  }

  expiringSoon.sort((a, b) => a.daysRemaining - b.daysRemaining);
  expired.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const pendingRepairs = maintenanceRecords.filter(
    (m) => m.repairStatus === 'Pending' || m.repairStatus === 'In Progress'
  );

  const overdueReturns: Array<{ assignment: AssetAssignment; daysOverdue: number }> = [];
  for (const asg of assignments) {
    if (asg.status !== 'Active' || !asg.expectedReturnDate) continue;
    const expMs = Date.parse(asg.expectedReturnDate);
    if (Number.isNaN(expMs)) continue;
    const diffDays = Math.ceil((refMs - expMs) / msPerDay);
    if (diffDays > 0) {
      overdueReturns.push({ assignment: asg, daysOverdue: diffDays });
    }
  }
  overdueReturns.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return { expiringSoon, expired, pendingRepairs, overdueReturns };
}

export function canCompleteOffboarding(
  employeeId: string,
  assignments: AssetAssignment[]
): { allowed: boolean; pendingCount: number } {
  const activeForEmployee = assignments.filter(
    (a) => a.employeeId === employeeId && a.status === 'Active'
  );
  return {
    allowed: activeForEmployee.length === 0,
    pendingCount: activeForEmployee.length,
  };
}

export function computeDepreciationValue(
  purchaseCost: number,
  purchaseDateStr: string,
  referenceDateStr: string,
  usefulLifeYears = 3
): { currentValue: number; accumulatedDepreciation: number; ageMonths: number } {
  const pMs = Date.parse(purchaseDateStr);
  const rMs = Date.parse(referenceDateStr);
  if (Number.isNaN(pMs) || Number.isNaN(rMs) || rMs <= pMs) {
    return { currentValue: purchaseCost, accumulatedDepreciation: 0, ageMonths: 0 };
  }
  const pDate = new Date(pMs);
  const rDate = new Date(rMs);
  let ageMonths =
    (rDate.getUTCFullYear() - pDate.getUTCFullYear()) * 12 +
    (rDate.getUTCMonth() - pDate.getUTCMonth());
  if (rDate.getUTCDate() < pDate.getUTCDate()) {
    ageMonths -= 1;
  }
  ageMonths = Math.max(0, ageMonths);
  const totalMonths = usefulLifeYears * 12;
  const ratio = Math.min(1, ageMonths / totalMonths);
  const accumulatedDepreciation = Math.round(purchaseCost * ratio * 100) / 100;
  const currentValue = Math.max(0, Math.round((purchaseCost - accumulatedDepreciation) * 100) / 100);
  return { currentValue, accumulatedDepreciation, ageMonths };
}

export type PermissionAction =
  | 'manage_settings'
  | 'manage_users'
  | 'manage_inventory'
  | 'assign_return_asset'
  | 'manage_maintenance'
  | 'manage_employees'
  | 'manage_offboarding'
  | 'approve_request_manager'
  | 'approve_request_it'
  | 'create_request'
  | 'report_issue'
  | 'view_reports'
  | 'view_all_directory';

const ROLE_MATRIX: Record<UserRole, Set<PermissionAction>> = {
  'Super Admin': new Set<PermissionAction>([
    'manage_settings',
    'manage_users',
    'manage_inventory',
    'assign_return_asset',
    'manage_maintenance',
    'manage_employees',
    'manage_offboarding',
    'approve_request_manager',
    'approve_request_it',
    'create_request',
    'report_issue',
    'view_reports',
    'view_all_directory',
  ]),
  'IT Admin': new Set<PermissionAction>([
    'manage_inventory',
    'assign_return_asset',
    'manage_maintenance',
    'approve_request_it',
    'create_request',
    'report_issue',
    'view_reports',
    'view_all_directory',
  ]),
  'HR Admin': new Set<PermissionAction>([
    'manage_employees',
    'manage_offboarding',
    'create_request',
    'report_issue',
    'view_reports',
    'view_all_directory',
  ]),
  'Department Manager': new Set<PermissionAction>([
    'approve_request_manager',
    'create_request',
    'report_issue',
    'view_reports',
    'view_all_directory',
  ]),
  Employee: new Set<PermissionAction>(['create_request', 'report_issue']),
};

export function hasPermission(role: UserRole, action: PermissionAction): boolean {
  return ROLE_MATRIX[role]?.has(action) ?? false;
}

export function canTransitionRequest(
  role: UserRole,
  currentStatus: RequestStatus,
  nextStatus: RequestStatus
): boolean {
  if (currentStatus === 'Assigned' || currentStatus === 'Rejected') return false;
  if (role === 'Super Admin') {
    if (currentStatus === 'Requested') {
      return nextStatus === 'Manager Approved' || nextStatus === 'Rejected';
    }
    if (currentStatus === 'Manager Approved') {
      return nextStatus === 'IT Approved' || nextStatus === 'Rejected';
    }
    if (currentStatus === 'IT Approved') {
      return nextStatus === 'Assigned' || nextStatus === 'Rejected';
    }
  }
  if (role === 'Department Manager' && currentStatus === 'Requested') {
    return nextStatus === 'Manager Approved' || nextStatus === 'Rejected';
  }
  if (role === 'IT Admin') {
    if (currentStatus === 'Manager Approved') {
      return nextStatus === 'IT Approved' || nextStatus === 'Rejected';
    }
    if (currentStatus === 'IT Approved') {
      return nextStatus === 'Assigned' || nextStatus === 'Rejected';
    }
  }
  return false;
}

export interface DashboardMetrics {
  totalAssets: number;
  availableAssets: number;
  assignedAssets: number;
  underMaintenanceAssets: number;
  damagedAssets: number;
  lostAssets: number;
  retiredAssets: number;
  totalPurchaseValue: number;
  byCategory: Array<{ label: string; count: number; value: number }>;
  byDepartment: Array<{ label: string; count: number }>;
  byLocation: Array<{ label: string; count: number }>;
  byCondition: Array<{ label: string; count: number }>;
  monthlyTrends: Array<{ month: string; issued: number; returned: number }>;
  warrantyBuckets: Array<{ label: string; count: number; tone: 'critical' | 'warning' | 'healthy' | 'muted' }>;
  pendingRequestsCount: number;
}

export function computeDashboardMetrics(
  assets: Asset[],
  employees: Employee[],
  assignments: AssetAssignment[],
  requests: AssetRequest[],
  referenceDateStr: string
): DashboardMetrics {
  let availableAssets = 0;
  let assignedAssets = 0;
  let underMaintenanceAssets = 0;
  let damagedAssets = 0;
  let lostAssets = 0;
  let retiredAssets = 0;
  let totalPurchaseValue = 0;

  const catMap = new Map<string, { count: number; value: number }>();
  const locMap = new Map<string, number>();
  const condMap = new Map<string, number>();

  for (const a of assets) {
    totalPurchaseValue += a.purchaseCost || 0;
    if (a.status === 'Available' || a.status === 'Purchased') availableAssets++;
    else if (a.status === 'Assigned') assignedAssets++;
    else if (a.status === 'Under Maintenance') underMaintenanceAssets++;
    else if (a.status === 'Damaged') damagedAssets++;
    else if (a.status === 'Lost') lostAssets++;
    else if (a.status === 'Retired' || a.status === 'Disposed') retiredAssets++;

    const cEntry = catMap.get(a.category) || { count: 0, value: 0 };
    cEntry.count += 1;
    cEntry.value += a.purchaseCost || 0;
    catMap.set(a.category, cEntry);

    locMap.set(a.location, (locMap.get(a.location) || 0) + 1);
    condMap.set(a.condition, (condMap.get(a.condition) || 0) + 1);
  }

  const empDeptMap = new Map<string, string>();
  for (const e of employees) {
    empDeptMap.set(e.id, e.department);
  }

  const deptMap = new Map<string, number>();
  for (const a of assets) {
    if (a.status === 'Assigned' && a.assignedEmployeeId) {
      const dept = empDeptMap.get(a.assignedEmployeeId) || 'Unassigned';
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    }
  }
  if (deptMap.size === 0) {
    deptMap.set('IT Stockroom', availableAssets);
  }

  const byCategory = Array.from(catMap.entries())
    .map(([label, v]) => ({ label, count: v.count, value: v.value }))
    .sort((a, b) => b.count - a.count);

  const byDepartment = Array.from(deptMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const byLocation = Array.from(locMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const byCondition = Array.from(condMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Build last 6 months trend ending at referenceDateStr
  const refDate = new Date(referenceDateStr);
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - i, 1));
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const monthlyMap = new Map<string, { issued: number; returned: number }>();
  for (const mk of monthKeys) {
    monthlyMap.set(mk, { issued: 0, returned: 0 });
  }
  for (const asg of assignments) {
    const issueKey = asg.issueDate?.slice(0, 7);
    if (issueKey && monthlyMap.has(issueKey)) {
      monthlyMap.get(issueKey)!.issued += 1;
    }
    const retKey = asg.returnDate?.slice(0, 7);
    if (retKey && monthlyMap.has(retKey)) {
      monthlyMap.get(retKey)!.returned += 1;
    }
  }
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyTrends = monthKeys.map((mk) => {
    const [, m] = mk.split('-');
    const idx = Number.parseInt(m, 10) - 1;
    const entry = monthlyMap.get(mk)!;
    return { month: monthNames[idx] || mk, issued: entry.issued, returned: entry.returned };
  });

  // Warranty buckets
  const refMs = Date.parse(referenceDateStr);
  let expExpired = 0;
  let exp30 = 0;
  let exp90 = 0;
  let expHealthy = 0;
  for (const a of assets) {
    if (!a.warrantyExpiryDate || a.status === 'Retired' || a.status === 'Disposed') continue;
    const diff = Math.ceil((Date.parse(a.warrantyExpiryDate) - refMs) / 86_400_000);
    if (diff < 0) expExpired++;
    else if (diff <= 30) exp30++;
    else if (diff <= 90) exp90++;
    else expHealthy++;
  }

  const warrantyBuckets: DashboardMetrics['warrantyBuckets'] = [
    { label: 'Expired', count: expExpired, tone: 'critical' },
    { label: 'Expiring ≤ 30d', count: exp30, tone: 'warning' },
    { label: 'Expiring 31–90d', count: exp90, tone: 'muted' },
    { label: 'Active > 90d', count: expHealthy, tone: 'healthy' },
  ];

  const pendingRequestsCount = requests.filter(
    (r) => r.status === 'Requested' || r.status === 'Manager Approved' || r.status === 'IT Approved'
  ).length;

  return {
    totalAssets: assets.length,
    availableAssets,
    assignedAssets,
    underMaintenanceAssets,
    damagedAssets,
    lostAssets,
    retiredAssets,
    totalPurchaseValue,
    byCategory,
    byDepartment,
    byLocation,
    byCondition,
    monthlyTrends,
    warrantyBuckets,
    pendingRequestsCount,
  };
}
