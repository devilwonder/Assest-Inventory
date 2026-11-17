export type UserRole =
  | 'Super Admin'
  | 'IT Admin'
  | 'HR Admin'
  | 'Department Manager'
  | 'Employee';

export const USER_ROLES: UserRole[] = [
  'Super Admin',
  'IT Admin',
  'HR Admin',
  'Department Manager',
  'Employee',
];

export type AssetCategory =
  | 'Laptop'
  | 'Desktop'
  | 'Monitor'
  | 'Keyboard'
  | 'Mouse'
  | 'Mobile Phone'
  | 'Tablet'
  | 'Headphones'
  | 'Charger / Adapter'
  | 'Networking Equipment'
  | 'Printer'
  | 'Office Furniture'
  | 'Other Equipment';

export const ASSET_CATEGORIES: AssetCategory[] = [
  'Laptop',
  'Desktop',
  'Monitor',
  'Keyboard',
  'Mouse',
  'Mobile Phone',
  'Tablet',
  'Headphones',
  'Charger / Adapter',
  'Networking Equipment',
  'Printer',
  'Office Furniture',
  'Other Equipment',
];

export type AssetCondition = 'New' | 'Good' | 'Fair' | 'Poor' | 'Damaged';

export const ASSET_CONDITIONS: AssetCondition[] = [
  'New',
  'Good',
  'Fair',
  'Poor',
  'Damaged',
];

export type AssetStatus =
  | 'Purchased'
  | 'Available'
  | 'Assigned'
  | 'Under Maintenance'
  | 'Damaged'
  | 'Lost'
  | 'Retired'
  | 'Disposed';

export const ASSET_STATUSES: AssetStatus[] = [
  'Purchased',
  'Available',
  'Assigned',
  'Under Maintenance',
  'Damaged',
  'Lost',
  'Retired',
  'Disposed',
];

export type ReturnNextStatus = 'Available' | 'Under Maintenance' | 'Damaged' | 'Retired';

export const RETURN_NEXT_STATUSES: ReturnNextStatus[] = [
  'Available',
  'Under Maintenance',
  'Damaged',
  'Retired',
];

export type EmploymentStatus = 'Active' | 'On Leave' | 'Resigned' | 'Terminated';

export const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  'Active',
  'On Leave',
  'Resigned',
  'Terminated',
];

export type ClearanceStatus = 'Not Applicable' | 'Pending' | 'Complete';

export type RequestUrgency = 'Low' | 'Normal' | 'High' | 'Urgent';

export type RequestStatus =
  | 'Requested'
  | 'Manager Approved'
  | 'IT Approved'
  | 'Assigned'
  | 'Rejected';

export type RepairStatus = 'Pending' | 'In Progress' | 'Completed' | 'Unrepairable';

export type NavTab =
  | 'dashboard'
  | 'employees'
  | 'inventory'
  | 'allocation'
  | 'requests'
  | 'returns'
  | 'maintenance'
  | 'offboarding'
  | 'reports'
  | 'settings';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  role: UserRole;
  employeeId?: string;
  department?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  photoUrl?: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  reportingManager?: string;
  joiningDate: string;
  employmentStatus: EmploymentStatus;
  location: string;
  clearanceStatus?: ClearanceStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Asset {
  id: string;
  assetCode: string;
  name: string;
  category: AssetCategory;
  brand: string;
  model: string;
  serialNumber: string;
  imei?: string;
  purchaseDate: string;
  purchaseCost: number;
  vendorName?: string;
  warrantyStartDate?: string;
  warrantyExpiryDate?: string;
  invoiceNumber?: string;
  location: string;
  condition: AssetCondition;
  status: AssetStatus;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  notes?: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AssetAssignment {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  employeeId: string;
  employeeName: string;
  employeeEmail?: string;
  department?: string;
  issueDate: string;
  expectedReturnDate?: string;
  returnDate?: string;
  conditionAtIssue: AssetCondition;
  accessoriesIncluded?: string;
  remarks?: string;
  acknowledgedByEmployee?: boolean;
  acknowledgedAt?: string;
  receiptNumber: string;
  status: 'Active' | 'Returned';
  issuedByUid: string;
  issuedByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AssetReturn {
  id: string;
  assignmentId: string;
  assetId: string;
  assetCode?: string;
  assetName?: string;
  employeeId: string;
  employeeName?: string;
  returnDate: string;
  conditionAtReturn: AssetCondition;
  damageDetails?: string;
  missingAccessories?: string;
  returnPhotoUrl?: string;
  remarks?: string;
  nextAssetStatus: ReturnNextStatus;
  processedByUid: string;
  processedByName?: string;
  createdAt?: string;
}

export interface AssetRequest {
  id: string;
  requesterUid: string;
  requesterEmployeeId: string;
  requesterName: string;
  department: string;
  category: string;
  justification: string;
  urgency: RequestUrgency;
  status: RequestStatus;
  managerApprovedBy?: string;
  managerApprovedAt?: string;
  itApprovedBy?: string;
  itApprovedAt?: string;
  rejectionReason?: string;
  assignedAssetId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MaintenanceRecord {
  id: string;
  assetId: string;
  assetCode?: string;
  assetName?: string;
  issueDescription: string;
  reportedDate: string;
  assignedTechnician?: string;
  repairVendor?: string;
  repairCost?: number;
  repairStatus: RepairStatus;
  resolutionDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  timestamp: string;
}

export interface Department {
  id: string;
  name: string;
  headName?: string;
  costCenter?: string;
  createdAt?: string;
}

export interface Location {
  id: string;
  name: string;
  city?: string;
  country?: string;
  createdAt?: string;
}

export type ReportType =
  | 'complete_inventory'
  | 'employee_allocation'
  | 'department_allocation'
  | 'available_assets'
  | 'under_maintenance'
  | 'warranty_expiry'
  | 'purchase_depreciation'
  | 'lost_damaged'
  | 'offboarding_clearance'
  | 'assignment_history';

export type SmtpSecurityMode = 'STARTTLS' | 'SSL/TLS' | 'None';

export const SMTP_SECURITY_MODES: SmtpSecurityMode[] = ['STARTTLS', 'SSL/TLS', 'None'];

export interface OrgPolicy {
  id: string;
  orgName: string;
  orgSlug: string;
  primaryDomain: string;
  allowedDomains: string[];
  supportEmail: string;
  enforceDomainRestriction: boolean;
  enableGoogleSso: boolean;
  enableOrgEmailLogin: boolean;
  enableLdapLogin: boolean;
  defaultOnboardingRole: UserRole;
  updatedByUid?: string;
  updatedByName?: string;
  updatedAt?: string;
}

export interface OrgIntegrations {
  id: string;
  smtpEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SmtpSecurityMode;
  smtpFromName: string;
  smtpFromEmail: string;
  smtpUsername: string;
  smtpHasPassword: boolean;
  notifyOnAssignment: boolean;
  notifyOnReturn: boolean;
  notifyOnWarrantyExpiry: boolean;
  notifyOnOffboarding: boolean;
  smtpLastTestedAt?: string;
  smtpLastTestStatus?: string;
  ldapEnabled: boolean;
  ldapServerUrl: string;
  ldapPort: number;
  ldapUseTls: boolean;
  ldapBaseDn: string;
  ldapBindDn: string;
  ldapHasBindPassword: boolean;
  ldapUserSearchFilter: string;
  ldapGroupSearchFilter?: string;
  ldapAdminGroupDn?: string;
  ldapItGroupDn?: string;
  ldapHrGroupDn?: string;
  ldapSyncIntervalHours: number;
  ldapLastTestedAt?: string;
  ldapLastTestStatus?: string;
  updatedByUid?: string;
  updatedByName?: string;
  updatedAt?: string;
}

export interface OrgSecrets {
  id: string;
  smtpPassword?: string;
  ldapBindPassword?: string;
  updatedAt?: string;
}
