import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, googleProvider, handleFirestoreError, OperationType, storage } from '../firebase';
import {
  SEED_ASSETS,
  SEED_ASSIGNMENTS,
  SEED_AUDIT_LOGS,
  SEED_DEPARTMENTS,
  SEED_EMPLOYEES,
  SEED_LOCATIONS,
  SEED_MAINTENANCE,
  SEED_REQUESTS,
  SEED_RETURNS,
} from '../data/seedData';
import type {
  AppUser,
  Asset,
  AssetAssignment,
  AssetCondition,
  AssetRequest,
  AssetReturn,
  AssetStatus,
  AuditLog,
  Department,
  Employee,
  EmploymentStatus,
  Location,
  MaintenanceRecord,
  RepairStatus,
  RequestStatus,
  RequestUrgency,
  ReturnNextStatus,
  UserRole,
} from '../types/eams';
import {
  canAssignAsset,
  canCompleteOffboarding,
  canTransitionRequest,
  generateNextAssetCode,
  generateNextEmployeeCode,
  generateReceiptNumber,
  validateAssetUniqueness,
} from '../utils/assetRules';

const DEMO_STORAGE_KEY = 'assetledger_demo_state_v1';
const BOOTSTRAP_ADMIN_EMAIL = 'pandeypratik4@gmail.com';

interface DemoSnapshot {
  employees: Employee[];
  assets: Asset[];
  assignments: AssetAssignment[];
  returns: AssetReturn[];
  requests: AssetRequest[];
  maintenanceRecords: MaintenanceRecord[];
  auditLogs: AuditLog[];
  departments: Department[];
  locations: Location[];
  users: AppUser[];
  activeDemoRole: UserRole;
}

function createInitialDemoSnapshot(): DemoSnapshot {
  const demoUsers: AppUser[] = [
    {
      uid: 'demo-super-admin',
      email: 'daniel.chen@assetledger.io',
      displayName: 'Daniel Chen',
      photoUrl: '/src/assets/images/avatar_admin_director_1794909090844.jpg',
      role: 'Super Admin',
      employeeId: 'emp-1001',
      department: 'IT & Security',
      createdAt: '2025-01-10T09:00:00Z',
    },
    {
      uid: 'emp-1010',
      email: 'aisha.patel@assetledger.io',
      displayName: 'Aisha Patel',
      role: 'IT Admin',
      employeeId: 'emp-1010',
      department: 'IT & Security',
      createdAt: '2025-01-10T09:00:00Z',
    },
    {
      uid: 'emp-1004',
      email: 'priya.nair@assetledger.io',
      displayName: 'Priya Nair',
      role: 'HR Admin',
      employeeId: 'emp-1004',
      department: 'Human Resources',
      createdAt: '2025-01-10T09:00:00Z',
    },
    {
      uid: 'emp-1002',
      email: 'marcus.vance@assetledger.io',
      displayName: 'Marcus Vance',
      role: 'Department Manager',
      employeeId: 'emp-1002',
      department: 'Engineering',
      createdAt: '2025-01-10T09:00:00Z',
    },
    {
      uid: 'emp-1008',
      email: 'hannah.brooks@assetledger.io',
      displayName: 'Hannah Brooks',
      role: 'Employee',
      employeeId: 'emp-1008',
      department: 'Engineering',
      createdAt: '2025-01-10T09:00:00Z',
    },
  ];
  return {
    employees: SEED_EMPLOYEES,
    assets: SEED_ASSETS,
    assignments: SEED_ASSIGNMENTS,
    returns: SEED_RETURNS,
    requests: SEED_REQUESTS,
    maintenanceRecords: SEED_MAINTENANCE,
    auditLogs: SEED_AUDIT_LOGS,
    departments: SEED_DEPARTMENTS,
    locations: SEED_LOCATIONS,
    users: demoUsers,
    activeDemoRole: 'Super Admin',
  };
}

function loadDemoSnapshot(): DemoSnapshot {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return createInitialDemoSnapshot();
    const parsed = JSON.parse(raw) as Partial<DemoSnapshot>;
    const base = createInitialDemoSnapshot();
    return {
      employees: parsed.employees ?? base.employees,
      assets: parsed.assets ?? base.assets,
      assignments: parsed.assignments ?? base.assignments,
      returns: parsed.returns ?? base.returns,
      requests: parsed.requests ?? base.requests,
      maintenanceRecords: parsed.maintenanceRecords ?? base.maintenanceRecords,
      auditLogs: parsed.auditLogs ?? base.auditLogs,
      departments: parsed.departments ?? base.departments,
      locations: parsed.locations ?? base.locations,
      users: parsed.users ?? base.users,
      activeDemoRole: parsed.activeDemoRole ?? 'Super Admin',
    };
  } catch {
    return createInitialDemoSnapshot();
  }
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

export interface EamsContextValue {
  mode: 'unauthenticated' | 'demo' | 'firebase';
  authReady: boolean;
  loadingData: boolean;
  currentUser: AppUser | null;
  employees: Employee[];
  assets: Asset[];
  assignments: AssetAssignment[];
  returns: AssetReturn[];
  requests: AssetRequest[];
  maintenanceRecords: MaintenanceRecord[];
  auditLogs: AuditLog[];
  departments: Department[];
  locations: Location[];
  users: AppUser[];

  signInWithGoogle: () => Promise<void>;
  enterDemoMode: (role?: UserRole) => void;
  switchDemoRole: (role: UserRole) => void;
  logout: () => Promise<void>;
  resetDemoData: () => void;

  // Employee actions
  saveEmployee: (emp: Omit<Employee, 'id' | 'employeeCode'> & { id?: string; employeeCode?: string }) => Promise<Employee>;
  bulkImportEmployees: (items: Array<Omit<Employee, 'id'>>) => Promise<Employee[]>;
  updateEmployeeStatus: (employeeId: string, status: EmploymentStatus) => Promise<void>;
  completeEmployeeClearance: (employeeId: string) => Promise<void>;

  // Asset actions
  saveAsset: (asset: Omit<Asset, 'id' | 'assetCode'> & { id?: string; assetCode?: string }) => Promise<Asset>;
  bulkImportAssets: (items: Array<Omit<Asset, 'id'>>) => Promise<Asset[]>;
  updateAssetStatusDirect: (assetId: string, status: AssetStatus, condition?: AssetCondition, notes?: string) => Promise<void>;
  uploadImageAsset: (file: File, folder: 'assets' | 'returns') => Promise<string>;

  // Assignment & Return actions
  assignAssets: (params: {
    employeeIds: string[];
    assetIds: string[];
    issueDate: string;
    expectedReturnDate?: string;
    conditionAtIssue: AssetCondition;
    accessoriesIncluded?: string;
    remarks?: string;
  }) => Promise<AssetAssignment[]>;
  acknowledgeAssignment: (assignmentId: string) => Promise<void>;
  returnAsset: (params: {
    assignmentId: string;
    returnDate: string;
    conditionAtReturn: AssetCondition;
    damageDetails?: string;
    missingAccessories?: string;
    returnPhotoUrl?: string;
    remarks?: string;
    nextAssetStatus: ReturnNextStatus;
  }) => Promise<AssetReturn>;

  // Request actions
  createAssetRequest: (params: {
    category: string;
    urgency: RequestUrgency;
    justification: string;
  }) => Promise<AssetRequest>;
  transitionAssetRequest: (params: {
    requestId: string;
    nextStatus: RequestStatus;
    rejectionReason?: string;
    assignedAssetId?: string;
  }) => Promise<void>;

  // Maintenance actions
  createMaintenanceTicket: (params: {
    assetId: string;
    issueDescription: string;
    reportedDate: string;
    assignedTechnician?: string;
    repairVendor?: string;
    repairCost?: number;
    notes?: string;
  }) => Promise<MaintenanceRecord>;
  updateMaintenanceTicket: (params: {
    recordId: string;
    repairStatus: RepairStatus;
    assignedTechnician?: string;
    repairVendor?: string;
    repairCost?: number;
    resolutionDate?: string;
    notes?: string;
    nextAssetStatus?: AssetStatus;
  }) => Promise<void>;

  // Settings actions
  addDepartment: (name: string, headName: string, costCenter: string) => Promise<void>;
  addLocation: (name: string, city: string, country: string) => Promise<void>;
  updateUserRole: (uid: string, role: UserRole) => Promise<void>;
}

const EamsContext = createContext<EamsContextValue | null>(null);

export const EamsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<'unauthenticated' | 'demo' | 'firebase'>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') return 'demo';
    if (localStorage.getItem('assetledger_mode') === 'demo') return 'demo';
    return 'unauthenticated';
  });
  const [authReady, setAuthReady] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [fbProfile, setFbProfile] = useState<AppUser | null>(null);

  const [demoState, setDemoState] = useState<DemoSnapshot>(() => loadDemoSnapshot());

  // Live Firestore collections
  const [fbEmployees, setFbEmployees] = useState<Employee[]>([]);
  const [fbAssets, setFbAssets] = useState<Asset[]>([]);
  const [fbAssignments, setFbAssignments] = useState<AssetAssignment[]>([]);
  const [fbReturns, setFbReturns] = useState<AssetReturn[]>([]);
  const [fbRequests, setFbRequests] = useState<AssetRequest[]>([]);
  const [fbMaintenance, setFbMaintenance] = useState<MaintenanceRecord[]>([]);
  const [fbAuditLogs, setFbAuditLogs] = useState<AuditLog[]>([]);
  const [fbDepartments, setFbDepartments] = useState<Department[]>([]);
  const [fbLocations, setFbLocations] = useState<Location[]>([]);
  const [fbUsers, setFbUsers] = useState<AppUser[]>([]);

  // Persist demo snapshot cleanly
  useEffect(() => {
    if (mode === 'demo') {
      try {
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoState));
      } catch {
        // Ignore quota errors
      }
    }
  }, [demoState, mode]);

  // Seed Firestore if empty when an admin logs in
  const seedFirestoreIfEmpty = useCallback(async () => {
    const assetsSnap = await getDocs(collection(db, 'assets'));
    if (!assetsSnap.empty) return;

    const batch = writeBatch(db);
    for (const d of SEED_DEPARTMENTS) batch.set(doc(db, 'departments', d.id), d);
    for (const l of SEED_LOCATIONS) batch.set(doc(db, 'locations', l.id), l);
    for (const e of SEED_EMPLOYEES) batch.set(doc(db, 'employees', e.id), e);
    for (const a of SEED_ASSETS) batch.set(doc(db, 'assets', a.id), a);
    for (const asg of SEED_ASSIGNMENTS) batch.set(doc(db, 'assetAssignments', asg.id), asg);
    for (const ret of SEED_RETURNS) batch.set(doc(db, 'assetReturns', ret.id), ret);
    for (const mnt of SEED_MAINTENANCE) batch.set(doc(db, 'maintenanceRecords', mnt.id), mnt);
    for (const req of SEED_REQUESTS) batch.set(doc(db, 'assetRequests', req.id), req);
    for (const log of SEED_AUDIT_LOGS) batch.set(doc(db, 'auditLogs', log.id), log);
    await batch.commit();
  }, []);

  // Auth state observer
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      if (user) {
        try {
          setLoadingData(true);
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          const now = new Date().toISOString();
          let profile: AppUser;
          if (snap.exists()) {
            profile = snap.data() as AppUser;
          } else {
            const isBootstrap = user.email === BOOTSTRAP_ADMIN_EMAIL;
            profile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || 'Workspace User',
              photoUrl: user.photoURL || '',
              role: isBootstrap ? 'Super Admin' : 'Employee',
              department: isBootstrap ? 'IT & Security' : 'Engineering',
              createdAt: now,
              updatedAt: now,
            };
            await setDoc(userRef, profile);
          }
          setFbProfile(profile);
          setMode('firebase');
          localStorage.setItem('assetledger_mode', 'firebase');
          if (profile.role === 'Super Admin' || profile.role === 'IT Admin') {
            await seedFirestoreIfEmpty();
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        } finally {
          setLoadingData(false);
          setAuthReady(true);
        }
      } else {
        setFbProfile(null);
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [seedFirestoreIfEmpty]);

  // Firestore real-time subscriptions when signed in
  useEffect(() => {
    if (mode !== 'firebase' || !fbUser || !fbProfile) return;
    const unsubs: Unsubscribe[] = [];
    const role = fbProfile.role;
    const isStaff =
      role === 'Super Admin' ||
      role === 'IT Admin' ||
      role === 'HR Admin' ||
      role === 'Department Manager';

    unsubs.push(
      onSnapshot(
        collection(db, 'assets'),
        (snap) => setFbAssets(snap.docs.map((d) => d.data() as Asset)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'assets')
      )
    );
    unsubs.push(
      onSnapshot(
        collection(db, 'departments'),
        (snap) => setFbDepartments(snap.docs.map((d) => d.data() as Department)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'departments')
      )
    );
    unsubs.push(
      onSnapshot(
        collection(db, 'locations'),
        (snap) => setFbLocations(snap.docs.map((d) => d.data() as Location)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'locations')
      )
    );

    const empQuery = isStaff
      ? collection(db, 'employees')
      : query(collection(db, 'employees'), where('email', '==', fbProfile.email));
    unsubs.push(
      onSnapshot(
        empQuery,
        (snap) => setFbEmployees(snap.docs.map((d) => d.data() as Employee)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
      )
    );

    const asgQuery = isStaff
      ? collection(db, 'assetAssignments')
      : query(collection(db, 'assetAssignments'), where('employeeEmail', '==', fbProfile.email));
    unsubs.push(
      onSnapshot(
        asgQuery,
        (snap) => setFbAssignments(snap.docs.map((d) => d.data() as AssetAssignment)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'assetAssignments')
      )
    );

    const reqQuery = isStaff
      ? collection(db, 'assetRequests')
      : query(collection(db, 'assetRequests'), where('requesterUid', '==', fbUser.uid));
    unsubs.push(
      onSnapshot(
        reqQuery,
        (snap) => setFbRequests(snap.docs.map((d) => d.data() as AssetRequest)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'assetRequests')
      )
    );

    if (isStaff) {
      unsubs.push(
        onSnapshot(
          collection(db, 'assetReturns'),
          (snap) => setFbReturns(snap.docs.map((d) => d.data() as AssetReturn)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'assetReturns')
        )
      );
      unsubs.push(
        onSnapshot(
          collection(db, 'maintenanceRecords'),
          (snap) => setFbMaintenance(snap.docs.map((d) => d.data() as MaintenanceRecord)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'maintenanceRecords')
        )
      );
    }

    if (role === 'Super Admin' || role === 'IT Admin' || role === 'HR Admin') {
      unsubs.push(
        onSnapshot(
          collection(db, 'auditLogs'),
          (snap) =>
            setFbAuditLogs(
              snap.docs
                .map((d) => d.data() as AuditLog)
                .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            ),
          (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
        )
      );
    }

    if (role === 'Super Admin') {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => setFbUsers(snap.docs.map((d) => d.data() as AppUser)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [mode, fbUser, fbProfile]);

  const currentUser = useMemo<AppUser | null>(() => {
    if (mode === 'firebase') return fbProfile;
    if (mode === 'demo') {
      const matched = demoState.users.find((u) => u.role === demoState.activeDemoRole);
      return matched || demoState.users[0];
    }
    return null;
  }, [mode, fbProfile, demoState]);

  const employees = mode === 'firebase' ? fbEmployees : demoState.employees;
  const assets = mode === 'firebase' ? fbAssets : demoState.assets;
  const assignments = mode === 'firebase' ? fbAssignments : demoState.assignments;
  const returns = mode === 'firebase' ? fbReturns : demoState.returns;
  const requests = mode === 'firebase' ? fbRequests : demoState.requests;
  const maintenanceRecords = mode === 'firebase' ? fbMaintenance : demoState.maintenanceRecords;
  const auditLogs = mode === 'firebase' ? fbAuditLogs : demoState.auditLogs;
  const departments = mode === 'firebase' ? fbDepartments : demoState.departments;
  const locations = mode === 'firebase' ? fbLocations : demoState.locations;
  const users = mode === 'firebase' ? fbUsers : demoState.users;

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const enterDemoMode = useCallback((role: UserRole = 'Super Admin') => {
    localStorage.setItem('assetledger_mode', 'demo');
    setDemoState((prev) => ({ ...prev, activeDemoRole: role }));
    setMode('demo');
  }, []);

  const switchDemoRole = useCallback((role: UserRole) => {
    setDemoState((prev) => ({ ...prev, activeDemoRole: role }));
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem('assetledger_mode');
    if (auth.currentUser) {
      await signOut(auth);
    }
    setMode('unauthenticated');
  }, []);

  const resetDemoData = useCallback(() => {
    const fresh = createInitialDemoSnapshot();
    setDemoState(fresh);
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fresh));
  }, []);

  const makeAuditEntry = useCallback(
    (action: string, entityType: string, entityId: string, summary: string): AuditLog => ({
      id: makeId('log'),
      actorUid: currentUser?.uid || 'system',
      actorName: currentUser?.displayName || 'System Admin',
      actorRole: currentUser?.role || 'Super Admin',
      action,
      entityType,
      entityId,
      summary,
      timestamp: new Date().toISOString(),
    }),
    [currentUser]
  );

  // --- Mutations ---
  const saveEmployee = useCallback(
    async (input: Omit<Employee, 'id' | 'employeeCode'> & { id?: string; employeeCode?: string }) => {
      const now = new Date().toISOString();
      const isEdit = Boolean(input.id);
      const id = input.id || makeId('emp');
      const employeeCode = input.employeeCode || generateNextEmployeeCode(employees);
      const record: Employee = {
        ...input,
        id,
        employeeCode,
        clearanceStatus:
          input.employmentStatus === 'Resigned' || input.employmentStatus === 'Terminated'
            ? input.clearanceStatus || 'Pending'
            : 'Not Applicable',
        createdAt: isEdit ? input.createdAt || now : now,
        updatedAt: now,
      };
      const audit = makeAuditEntry(
        isEdit ? 'EMPLOYEE_UPDATED' : 'EMPLOYEE_CREATED',
        'Employee',
        id,
        `${isEdit ? 'Updated' : 'Created'} employee ${record.fullName} (${record.employeeCode})`
      );

      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'employees', id), record);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `employees/${id}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          employees: isEdit
            ? prev.employees.map((e) => (e.id === id ? record : e))
            : [record, ...prev.employees],
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
      return record;
    },
    [employees, makeAuditEntry, mode]
  );

  const updateEmployeeStatus = useCallback(
    async (employeeId: string, status: EmploymentStatus) => {
      const target = employees.find((e) => e.id === employeeId);
      if (!target) throw new Error('Employee not found.');
      const now = new Date().toISOString();
      const isExit = status === 'Resigned' || status === 'Terminated';
      const { allowed } = canCompleteOffboarding(employeeId, assignments);
      const clearanceStatus = isExit ? (allowed ? 'Complete' : 'Pending') : 'Not Applicable';

      const updated: Employee = {
        ...target,
        employmentStatus: status,
        clearanceStatus,
        updatedAt: now,
      };
      const audit = makeAuditEntry(
        isExit ? 'OFFBOARDING_INITIATED' : 'EMPLOYEE_STATUS_UPDATED',
        'Employee',
        employeeId,
        `Updated ${target.fullName} status to ${status} (Clearance: ${clearanceStatus})`
      );

      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'employees', employeeId), updated);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `employees/${employeeId}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          employees: prev.employees.map((e) => (e.id === employeeId ? updated : e)),
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
    },
    [assignments, employees, makeAuditEntry, mode]
  );

  const completeEmployeeClearance = useCallback(
    async (employeeId: string) => {
      const target = employees.find((e) => e.id === employeeId);
      if (!target) throw new Error('Employee not found.');
      const check = canCompleteOffboarding(employeeId, assignments);
      if (!check.allowed) {
        throw new Error(`Cannot complete clearance: ${check.pendingCount} asset(s) still assigned.`);
      }
      const updated: Employee = {
        ...target,
        clearanceStatus: 'Complete',
        updatedAt: new Date().toISOString(),
      };
      const audit = makeAuditEntry(
        'OFFBOARDING_CLEARED',
        'Employee',
        employeeId,
        `Completed exit asset clearance for ${target.fullName} (${target.employeeCode})`
      );

      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'employees', employeeId), updated);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `employees/${employeeId}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          employees: prev.employees.map((e) => (e.id === employeeId ? updated : e)),
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
    },
    [assignments, employees, makeAuditEntry, mode]
  );

  const saveAsset = useCallback(
    async (input: Omit<Asset, 'id' | 'assetCode'> & { id?: string; assetCode?: string }) => {
      const now = new Date().toISOString();
      const isEdit = Boolean(input.id);
      const id = input.id || makeId('ast');
      const assetCode = input.assetCode?.trim() || generateNextAssetCode(assets);

      const uniqueCheck = validateAssetUniqueness(
        { assetCode, serialNumber: input.serialNumber },
        assets,
        isEdit ? id : undefined
      );
      if (!uniqueCheck.valid) {
        throw new Error(uniqueCheck.error);
      }

      const record: Asset = {
        ...input,
        id,
        assetCode,
        createdAt: isEdit ? input.createdAt || now : now,
        updatedAt: now,
      };
      const audit = makeAuditEntry(
        isEdit ? 'ASSET_UPDATED' : 'ASSET_CREATED',
        'Asset',
        id,
        `${isEdit ? 'Updated' : 'Registered'} asset ${record.assetCode} (${record.name})`
      );

      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'assets', id), record);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `assets/${id}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          assets: isEdit ? prev.assets.map((a) => (a.id === id ? record : a)) : [record, ...prev.assets],
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
      return record;
    },
    [assets, makeAuditEntry, mode]
  );

  const bulkImportAssets = useCallback(
    async (items: Array<Omit<Asset, 'id'>>): Promise<Asset[]> => {
      if (items.length === 0) throw new Error('No valid asset rows to import.');
      const now = new Date().toISOString();
      const created: Asset[] = [];
      let runningAssets = [...assets];

      for (let i = 0; i < items.length; i++) {
        const raw = items[i];
        const assetCode = raw.assetCode?.trim() || generateNextAssetCode(runningAssets);
        const check = validateAssetUniqueness(
          { assetCode, serialNumber: raw.serialNumber },
          runningAssets
        );
        if (!check.valid) {
          throw new Error(check.error);
        }
        const record: Asset = {
          ...raw,
          id: `${makeId('ast')}-${i}`,
          assetCode,
          assignedEmployeeId: '',
          assignedEmployeeName: '',
          createdAt: now,
          updatedAt: now,
        };
        created.push(record);
        runningAssets = [record, ...runningAssets];
      }

      const audit = makeAuditEntry(
        'ASSETS_BULK_IMPORTED',
        'Asset',
        created[0].id,
        `Bulk imported ${created.length} asset(s) from Excel (${created[0].assetCode}..${created[created.length - 1].assetCode})`
      );

      if (mode === 'firebase') {
        try {
          const CHUNK_SIZE = 400;
          for (let offset = 0; offset < created.length; offset += CHUNK_SIZE) {
            const batch = writeBatch(db);
            const slice = created.slice(offset, offset + CHUNK_SIZE);
            for (const item of slice) {
              batch.set(doc(db, 'assets', item.id), item);
            }
            if (offset === 0) {
              batch.set(doc(db, 'auditLogs', audit.id), audit);
            }
            await batch.commit();
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'assets');
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          assets: [...created, ...prev.assets],
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
      return created;
    },
    [assets, makeAuditEntry, mode]
  );

  const bulkImportEmployees = useCallback(
    async (items: Array<Omit<Employee, 'id'>>): Promise<Employee[]> => {
      if (items.length === 0) throw new Error('No valid employee rows to import.');
      const now = new Date().toISOString();
      const created: Employee[] = [];
      let runningEmployees = [...employees];

      for (let i = 0; i < items.length; i++) {
        const raw = items[i];
        const employeeCode = raw.employeeCode?.trim() || generateNextEmployeeCode(runningEmployees);
        const dupEmail = runningEmployees.some(
          (e) => e.email.trim().toLowerCase() === raw.email.trim().toLowerCase()
        );
        if (dupEmail) {
          throw new Error(`Duplicate employee email "${raw.email}".`);
        }
        const record: Employee = {
          ...raw,
          id: `${makeId('emp')}-${i}`,
          employeeCode,
          clearanceStatus:
            raw.employmentStatus === 'Resigned' || raw.employmentStatus === 'Terminated'
              ? raw.clearanceStatus || 'Pending'
              : 'Not Applicable',
          createdAt: now,
          updatedAt: now,
        };
        created.push(record);
        runningEmployees = [record, ...runningEmployees];
      }

      const audit = makeAuditEntry(
        'EMPLOYEES_BULK_IMPORTED',
        'Employee',
        created[0].id,
        `Bulk imported ${created.length} employee(s) from Excel (${created[0].employeeCode}..${created[created.length - 1].employeeCode})`
      );

      if (mode === 'firebase') {
        try {
          const CHUNK_SIZE = 400;
          for (let offset = 0; offset < created.length; offset += CHUNK_SIZE) {
            const batch = writeBatch(db);
            const slice = created.slice(offset, offset + CHUNK_SIZE);
            for (const item of slice) {
              batch.set(doc(db, 'employees', item.id), item);
            }
            if (offset === 0) {
              batch.set(doc(db, 'auditLogs', audit.id), audit);
            }
            await batch.commit();
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'employees');
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          employees: [...created, ...prev.employees],
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
      return created;
    },
    [employees, makeAuditEntry, mode]
  );

  const updateAssetStatusDirect = useCallback(
    async (assetId: string, status: AssetStatus, condition?: AssetCondition, notes?: string) => {
      const target = assets.find((a) => a.id === assetId);
      if (!target) throw new Error('Asset not found.');
      const updated: Asset = {
        ...target,
        status,
        condition: condition ?? target.condition,
        notes: notes !== undefined ? notes : target.notes,
        assignedEmployeeId: status === 'Assigned' ? target.assignedEmployeeId : '',
        assignedEmployeeName: status === 'Assigned' ? target.assignedEmployeeName : '',
        updatedAt: new Date().toISOString(),
      };
      const audit = makeAuditEntry(
        'ASSET_STATUS_CHANGED',
        'Asset',
        assetId,
        `Changed ${target.assetCode} status from ${target.status} to ${status}`
      );
      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'assets', assetId), updated);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `assets/${assetId}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          assets: prev.assets.map((a) => (a.id === assetId ? updated : a)),
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
    },
    [assets, makeAuditEntry, mode]
  );

  const uploadImageAsset = useCallback(
    async (file: File, folder: 'assets' | 'returns'): Promise<string> => {
      if (mode === 'firebase' && auth.currentUser) {
        try {
          const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
          await uploadBytes(storageRef, file);
          return await getDownloadURL(storageRef);
        } catch {
          // Fallback to local object/data URL if storage bucket rules block or offline
        }
      }
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });
    },
    [mode]
  );

  const assignAssets = useCallback(
    async (params: {
      employeeIds: string[];
      assetIds: string[];
      issueDate: string;
      expectedReturnDate?: string;
      conditionAtIssue: AssetCondition;
      accessoriesIncluded?: string;
      remarks?: string;
    }): Promise<AssetAssignment[]> => {
      if (params.employeeIds.length === 0 || params.assetIds.length === 0) {
        throw new Error('Select at least one employee and one available asset.');
      }

      // Support either 1 employee + N assets, OR N employees + N assets (1-to-1 bulk onboarding)
      const pairs: Array<{ employee: Employee; asset: Asset }> = [];
      if (params.employeeIds.length === 1) {
        const emp = employees.find((e) => e.id === params.employeeIds[0]);
        if (!emp) throw new Error('Selected employee not found.');
        for (const assetId of params.assetIds) {
          const ast = assets.find((a) => a.id === assetId);
          if (!ast) throw new Error('Selected asset not found.');
          const check = canAssignAsset(ast);
          if (!check.ok) throw new Error(check.reason);
          pairs.push({ employee: emp, asset: ast });
        }
      } else {
        if (params.employeeIds.length !== params.assetIds.length) {
          throw new Error(
            'For multi-employee bulk onboarding, select the exact same number of employees and assets (1 asset per employee).'
          );
        }
        for (let i = 0; i < params.employeeIds.length; i++) {
          const emp = employees.find((e) => e.id === params.employeeIds[i]);
          const ast = assets.find((a) => a.id === params.assetIds[i]);
          if (!emp || !ast) throw new Error('Invalid employee or asset selection.');
          const check = canAssignAsset(ast);
          if (!check.ok) throw new Error(check.reason);
          pairs.push({ employee: emp, asset: ast });
        }
      }

      const now = new Date().toISOString();
      const createdAssignments: AssetAssignment[] = [];
      const auditLogsToAdd: AuditLog[] = [];
      let runningAssignments = [...assignments];

      for (const { employee, asset } of pairs) {
        const receiptNumber = generateReceiptNumber(runningAssignments);
        const asgId = makeId('asg');
        const newAsg: AssetAssignment = {
          id: asgId,
          assetId: asset.id,
          assetCode: asset.assetCode,
          assetName: asset.name,
          employeeId: employee.id,
          employeeName: employee.fullName,
          employeeEmail: employee.email,
          department: employee.department,
          issueDate: params.issueDate,
          expectedReturnDate: params.expectedReturnDate || '',
          returnDate: '',
          conditionAtIssue: params.conditionAtIssue,
          accessoriesIncluded: params.accessoriesIncluded || '',
          remarks: params.remarks || '',
          acknowledgedByEmployee: false,
          acknowledgedAt: '',
          receiptNumber,
          status: 'Active',
          issuedByUid: currentUser?.uid || 'demo-super-admin',
          issuedByName: currentUser?.displayName || 'Daniel Chen',
          createdAt: now,
          updatedAt: now,
        };
        createdAssignments.push(newAsg);
        runningAssignments = [newAsg, ...runningAssignments];
        auditLogsToAdd.push(
          makeAuditEntry(
            'ASSET_ASSIGNED',
            'AssetAssignment',
            asgId,
            `Assigned ${asset.assetCode} (${asset.name}) to ${employee.fullName} [Receipt ${receiptNumber}]`
          )
        );
      }

      if (mode === 'firebase') {
        try {
          await runTransaction(db, async (tx) => {
            // Read all assets first to enforce transactional non-double-assignment
            const assetRefs = pairs.map((p) => doc(db, 'assets', p.asset.id));
            const assetSnaps = await Promise.all(assetRefs.map((r) => tx.get(r)));
            for (let i = 0; i < assetSnaps.length; i++) {
              const snap = assetSnaps[i];
              if (!snap.exists()) throw new Error('Asset no longer exists.');
              const freshAsset = snap.data() as Asset;
              const check = canAssignAsset(freshAsset);
              if (!check.ok) throw new Error(check.reason);
            }
            for (let i = 0; i < pairs.length; i++) {
              const { employee, asset } = pairs[i];
              const asg = createdAssignments[i];
              const log = auditLogsToAdd[i];
              tx.set(doc(db, 'assets', asset.id), {
                ...asset,
                status: 'Assigned',
                condition: params.conditionAtIssue,
                assignedEmployeeId: employee.id,
                assignedEmployeeName: employee.fullName,
                updatedAt: now,
              });
              tx.set(doc(db, 'assetAssignments', asg.id), asg);
              tx.set(doc(db, 'auditLogs', log.id), log);
            }
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'assetAssignments');
        }
      } else {
        setDemoState((prev) => {
          const updatedAssetIds = new Map(
            pairs.map((p) => [
              p.asset.id,
              {
                ...p.asset,
                status: 'Assigned' as AssetStatus,
                condition: params.conditionAtIssue,
                assignedEmployeeId: p.employee.id,
                assignedEmployeeName: p.employee.fullName,
                updatedAt: now,
              },
            ])
          );
          return {
            ...prev,
            assets: prev.assets.map((a) => updatedAssetIds.get(a.id) || a),
            assignments: [...createdAssignments, ...prev.assignments],
            auditLogs: [...auditLogsToAdd, ...prev.auditLogs],
          };
        });
      }

      return createdAssignments;
    },
    [assets, assignments, currentUser, employees, makeAuditEntry, mode]
  );

  const acknowledgeAssignment = useCallback(
    async (assignmentId: string) => {
      const target = assignments.find((a) => a.id === assignmentId);
      if (!target) throw new Error('Assignment not found.');
      const now = new Date().toISOString();
      const updated: AssetAssignment = {
        ...target,
        acknowledgedByEmployee: true,
        acknowledgedAt: now,
        updatedAt: now,
      };
      const audit = makeAuditEntry(
        'ASSET_ACKNOWLEDGED',
        'AssetAssignment',
        assignmentId,
        `${target.employeeName} acknowledged receipt of ${target.assetCode}`
      );
      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'assetAssignments', assignmentId), updated);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `assetAssignments/${assignmentId}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          assignments: prev.assignments.map((a) => (a.id === assignmentId ? updated : a)),
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
    },
    [assignments, makeAuditEntry, mode]
  );

  const returnAsset = useCallback(
    async (params: {
      assignmentId: string;
      returnDate: string;
      conditionAtReturn: AssetCondition;
      damageDetails?: string;
      missingAccessories?: string;
      returnPhotoUrl?: string;
      remarks?: string;
      nextAssetStatus: ReturnNextStatus;
    }): Promise<AssetReturn> => {
      const asg = assignments.find((a) => a.id === params.assignmentId);
      if (!asg) throw new Error('Assignment record not found.');
      if (asg.status !== 'Active') throw new Error('This asset assignment has already been returned.');
      const asset = assets.find((a) => a.id === asg.assetId);
      if (!asset) throw new Error('Linked asset not found.');

      const now = new Date().toISOString();
      const retId = makeId('ret');
      const retRecord: AssetReturn = {
        id: retId,
        assignmentId: asg.id,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        employeeId: asg.employeeId,
        employeeName: asg.employeeName,
        returnDate: params.returnDate,
        conditionAtReturn: params.conditionAtReturn,
        damageDetails: params.damageDetails || '',
        missingAccessories: params.missingAccessories || '',
        returnPhotoUrl: params.returnPhotoUrl || '',
        remarks: params.remarks || '',
        nextAssetStatus: params.nextAssetStatus,
        processedByUid: currentUser?.uid || 'demo-super-admin',
        processedByName: currentUser?.displayName || 'Daniel Chen',
        createdAt: now,
      };
      const updatedAsg: AssetAssignment = {
        ...asg,
        status: 'Returned',
        returnDate: params.returnDate,
        updatedAt: now,
      };
      const updatedAsset: Asset = {
        ...asset,
        status: params.nextAssetStatus,
        condition: params.conditionAtReturn,
        assignedEmployeeId: '',
        assignedEmployeeName: '',
        updatedAt: now,
      };
      const audit = makeAuditEntry(
        'ASSET_RETURNED',
        'AssetReturn',
        retId,
        `Returned ${asset.assetCode} from ${asg.employeeName} -> ${params.nextAssetStatus} (Condition: ${params.conditionAtReturn})`
      );

      if (mode === 'firebase') {
        try {
          await runTransaction(db, async (tx) => {
            tx.set(doc(db, 'assetReturns', retId), retRecord);
            tx.set(doc(db, 'assetAssignments', asg.id), updatedAsg);
            tx.set(doc(db, 'assets', asset.id), updatedAsset);
            tx.set(doc(db, 'auditLogs', audit.id), audit);
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `assetReturns/${retId}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          assets: prev.assets.map((a) => (a.id === asset.id ? updatedAsset : a)),
          assignments: prev.assignments.map((a) => (a.id === asg.id ? updatedAsg : a)),
          returns: [retRecord, ...prev.returns],
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
      return retRecord;
    },
    [assets, assignments, currentUser, makeAuditEntry, mode]
  );

  const createAssetRequest = useCallback(
    async (params: { category: string; urgency: RequestUrgency; justification: string }) => {
      const now = new Date().toISOString();
      const id = makeId('req');
      const req: AssetRequest = {
        id,
        requesterUid: currentUser?.uid || 'demo-user',
        requesterEmployeeId: currentUser?.employeeId || currentUser?.uid || 'emp-1008',
        requesterName: currentUser?.displayName || 'Workspace User',
        department: currentUser?.department || 'Engineering',
        category: params.category,
        justification: params.justification,
        urgency: params.urgency,
        status: 'Requested',
        createdAt: now,
        updatedAt: now,
      };
      const audit = makeAuditEntry(
        'REQUEST_CREATED',
        'AssetRequest',
        id,
        `${req.requesterName} requested ${req.category} (${req.urgency})`
      );
      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'assetRequests', id), req);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `assetRequests/${id}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          requests: [req, ...prev.requests],
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
      return req;
    },
    [currentUser, makeAuditEntry, mode]
  );

  const transitionAssetRequest = useCallback(
    async (params: {
      requestId: string;
      nextStatus: RequestStatus;
      rejectionReason?: string;
      assignedAssetId?: string;
    }) => {
      const existingReq = requests.find((r) => r.id === params.requestId);
      if (!existingReq) throw new Error('Asset request not found.');
      const role = currentUser?.role || 'Employee';
      if (!canTransitionRequest(role, existingReq.status, params.nextStatus)) {
        throw new Error(`Role "${role}" cannot move request from "${existingReq.status}" to "${params.nextStatus}".`);
      }

      const now = new Date().toISOString();
      const updated: AssetRequest = {
        ...existingReq,
        status: params.nextStatus,
        managerApprovedBy:
          params.nextStatus === 'Manager Approved'
            ? currentUser?.displayName || 'Manager'
            : existingReq.managerApprovedBy,
        managerApprovedAt:
          params.nextStatus === 'Manager Approved' ? now : existingReq.managerApprovedAt,
        itApprovedBy:
          params.nextStatus === 'IT Approved'
            ? currentUser?.displayName || 'IT Admin'
            : existingReq.itApprovedBy,
        itApprovedAt: params.nextStatus === 'IT Approved' ? now : existingReq.itApprovedAt,
        rejectionReason: params.rejectionReason || existingReq.rejectionReason,
        assignedAssetId: params.assignedAssetId || existingReq.assignedAssetId,
        updatedAt: now,
      };

      const audit = makeAuditEntry(
        `REQUEST_${params.nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
        'AssetRequest',
        existingReq.id,
        `${currentUser?.displayName} marked request ${existingReq.id} (${existingReq.category} for ${existingReq.requesterName}) as ${params.nextStatus}`
      );

      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'assetRequests', existingReq.id), updated);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `assetRequests/${existingReq.id}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          requests: prev.requests.map((r) => (r.id === existingReq.id ? updated : r)),
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
    },
    [currentUser, makeAuditEntry, mode, requests]
  );

  const createMaintenanceTicket = useCallback(
    async (params: {
      assetId: string;
      issueDescription: string;
      reportedDate: string;
      assignedTechnician?: string;
      repairVendor?: string;
      repairCost?: number;
      notes?: string;
    }) => {
      const asset = assets.find((a) => a.id === params.assetId);
      if (!asset) throw new Error('Asset not found.');
      const now = new Date().toISOString();
      const id = makeId('mnt');
      const record: MaintenanceRecord = {
        id,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        issueDescription: params.issueDescription,
        reportedDate: params.reportedDate,
        assignedTechnician: params.assignedTechnician || '',
        repairVendor: params.repairVendor || '',
        repairCost: params.repairCost || 0,
        repairStatus: 'Pending',
        notes: params.notes || '',
        createdAt: now,
        updatedAt: now,
      };
      const updatedAsset: Asset = {
        ...asset,
        status: asset.status === 'Assigned' ? asset.status : 'Under Maintenance',
        updatedAt: now,
      };
      const audit = makeAuditEntry(
        'MAINTENANCE_LOGGED',
        'MaintenanceRecord',
        id,
        `Logged maintenance ticket for ${asset.assetCode}: ${params.issueDescription.slice(0, 80)}`
      );

      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'maintenanceRecords', id), record);
          if (currentUser?.role === 'Super Admin' || currentUser?.role === 'IT Admin') {
            batch.set(doc(db, 'assets', asset.id), updatedAsset);
          }
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `maintenanceRecords/${id}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          maintenanceRecords: [record, ...prev.maintenanceRecords],
          assets: prev.assets.map((a) => (a.id === asset.id ? updatedAsset : a)),
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
      return record;
    },
    [assets, currentUser, makeAuditEntry, mode]
  );

  const updateMaintenanceTicket = useCallback(
    async (params: {
      recordId: string;
      repairStatus: RepairStatus;
      assignedTechnician?: string;
      repairVendor?: string;
      repairCost?: number;
      resolutionDate?: string;
      notes?: string;
      nextAssetStatus?: AssetStatus;
    }) => {
      const existingRec = maintenanceRecords.find((m) => m.id === params.recordId);
      if (!existingRec) throw new Error('Maintenance ticket not found.');
      const asset = assets.find((a) => a.id === existingRec.assetId);
      const now = new Date().toISOString();

      const updated: MaintenanceRecord = {
        ...existingRec,
        repairStatus: params.repairStatus,
        assignedTechnician: params.assignedTechnician ?? existingRec.assignedTechnician,
        repairVendor: params.repairVendor ?? existingRec.repairVendor,
        repairCost: params.repairCost ?? existingRec.repairCost,
        resolutionDate:
          params.resolutionDate ??
          (params.repairStatus === 'Completed' || params.repairStatus === 'Unrepairable'
            ? now.slice(0, 10)
            : existingRec.resolutionDate),
        notes: params.notes ?? existingRec.notes,
        updatedAt: now,
      };

      const nextStatus: AssetStatus | undefined =
        params.nextAssetStatus ||
        (params.repairStatus === 'Completed'
          ? 'Available'
          : params.repairStatus === 'Unrepairable'
            ? 'Damaged'
            : undefined);

      const updatedAsset =
        asset && nextStatus && asset.status !== 'Assigned'
          ? { ...asset, status: nextStatus, updatedAt: now }
          : null;

      const audit = makeAuditEntry(
        'MAINTENANCE_UPDATED',
        'MaintenanceRecord',
        existingRec.id,
        `Updated maintenance ${existingRec.assetCode || existingRec.assetId} -> ${params.repairStatus}`
      );

      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'maintenanceRecords', existingRec.id), updated);
          if (updatedAsset) batch.set(doc(db, 'assets', updatedAsset.id), updatedAsset);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `maintenanceRecords/${existingRec.id}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          maintenanceRecords: prev.maintenanceRecords.map((m) =>
            m.id === existingRec.id ? updated : m
          ),
          assets: updatedAsset
            ? prev.assets.map((a) => (a.id === updatedAsset.id ? updatedAsset : a))
            : prev.assets,
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
    },
    [assets, maintenanceRecords, makeAuditEntry, mode]
  );

  const addDepartment = useCallback(
    async (name: string, headName: string, costCenter: string) => {
      const id = makeId('dept');
      const dept: Department = { id, name: name.trim(), headName: headName.trim(), costCenter: costCenter.trim(), createdAt: new Date().toISOString() };
      const audit = makeAuditEntry('DEPARTMENT_ADDED', 'Department', id, `Added department ${dept.name}`);
      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'departments', id), dept);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `departments/${id}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          departments: [...prev.departments, dept],
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
    },
    [makeAuditEntry, mode]
  );

  const addLocation = useCallback(
    async (name: string, city: string, country: string) => {
      const id = makeId('loc');
      const loc: Location = { id, name: name.trim(), city: city.trim(), country: country.trim(), createdAt: new Date().toISOString() };
      const audit = makeAuditEntry('LOCATION_ADDED', 'Location', id, `Added location ${loc.name}`);
      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'locations', id), loc);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `locations/${id}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          locations: [...prev.locations, loc],
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
    },
    [makeAuditEntry, mode]
  );

  const updateUserRole = useCallback(
    async (uid: string, role: UserRole) => {
      const target = users.find((u) => u.uid === uid);
      if (!target) throw new Error('User not found.');
      const updated: AppUser = { ...target, role, updatedAt: new Date().toISOString() };
      const audit = makeAuditEntry('USER_ROLE_UPDATED', 'User', uid, `Changed ${target.displayName} role to ${role}`);
      if (mode === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'users', uid), updated);
          batch.set(doc(db, 'auditLogs', audit.id), audit);
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
        }
      } else {
        setDemoState((prev) => ({
          ...prev,
          users: prev.users.map((u) => (u.uid === uid ? updated : u)),
          auditLogs: [audit, ...prev.auditLogs],
        }));
      }
    },
    [makeAuditEntry, mode, users]
  );

  const value: EamsContextValue = {
    mode,
    authReady,
    loadingData,
    currentUser,
    employees,
    assets,
    assignments,
    returns,
    requests,
    maintenanceRecords,
    auditLogs,
    departments,
    locations,
    users,
    signInWithGoogle,
    enterDemoMode,
    switchDemoRole,
    logout,
    resetDemoData,
    saveEmployee,
    bulkImportEmployees,
    updateEmployeeStatus,
    completeEmployeeClearance,
    saveAsset,
    bulkImportAssets,
    updateAssetStatusDirect,
    uploadImageAsset,
    assignAssets,
    acknowledgeAssignment,
    returnAsset,
    createAssetRequest,
    transitionAssetRequest,
    createMaintenanceTicket,
    updateMaintenanceTicket,
    addDepartment,
    addLocation,
    updateUserRole,
  };

  return <EamsContext.Provider value={value}>{children}</EamsContext.Provider>;
};

export function useEams(): EamsContextValue {
  const ctx = useContext(EamsContext);
  if (!ctx) throw new Error('useEams must be used within EamsProvider');
  return ctx;
}
