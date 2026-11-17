import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
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
  OrgIntegrations,
  OrgPolicy,
  OrgSecrets,
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
  isAllowedOrgEmail,
  validateAssetUniqueness,
  validateLdapConfig,
  validateSmtpConfig,
} from '../utils/assetRules';
import {
  isPopupFallbackError,
  isStandaloneBrowserWindow,
  mapFirebaseAuthError,
} from '../utils/authErrors';

const BOOTSTRAP_ADMIN_EMAIL = 'pandeypratik4@gmail.com';
const ORG_POLICY_DOC_ID = 'dextra-policy';
const ORG_INTEGRATIONS_DOC_ID = 'dextra-integrations';
const ORG_SECRETS_DOC_ID = 'dextra-secrets';

export const DEFAULT_ORG_POLICY: OrgPolicy = {
  id: ORG_POLICY_DOC_ID,
  orgName: 'Dextra',
  orgSlug: 'dextra',
  primaryDomain: 'dextra.com',
  allowedDomains: ['dextra.com'],
  supportEmail: 'it-support@dextra.com',
  enforceDomainRestriction: false,
  enableGoogleSso: true,
  enableOrgEmailLogin: true,
  enableLdapLogin: true,
  defaultOnboardingRole: 'Employee',
};

export const DEFAULT_ORG_INTEGRATIONS: OrgIntegrations = {
  id: ORG_INTEGRATIONS_DOC_ID,
  smtpEnabled: false,
  smtpHost: 'smtp.office365.com',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS',
  smtpFromName: 'Dextra IT Asset Management',
  smtpFromEmail: 'assets-noreply@dextra.com',
  smtpUsername: 'assets-noreply@dextra.com',
  smtpHasPassword: false,
  notifyOnAssignment: true,
  notifyOnReturn: true,
  notifyOnWarrantyExpiry: true,
  notifyOnOffboarding: true,
  ldapEnabled: false,
  ldapServerUrl: 'ldaps://ldap.dextra.com',
  ldapPort: 636,
  ldapUseTls: true,
  ldapBaseDn: 'dc=dextra,dc=com',
  ldapBindDn: 'cn=svc-assetledger,ou=ServiceAccounts,dc=dextra,dc=com',
  ldapHasBindPassword: false,
  ldapUserSearchFilter: '(&(objectClass=person)(mail={email}))',
  ldapGroupSearchFilter: '(&(objectClass=groupOfNames)(member={dn}))',
  ldapAdminGroupDn: 'cn=AssetLedger-SuperAdmins,ou=Groups,dc=dextra,dc=com',
  ldapItGroupDn: 'cn=AssetLedger-IT-Admins,ou=Groups,dc=dextra,dc=com',
  ldapHrGroupDn: 'cn=AssetLedger-HR-Admins,ou=Groups,dc=dextra,dc=com',
  ldapSyncIntervalHours: 6,
};

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs?: number;
  banner?: string;
  tlsActive?: boolean;
  testEmailSent?: boolean;
  summary?: string;
  error?: string;
}

export interface EamsContextValue {
  mode: 'unauthenticated' | 'firebase';
  authReady: boolean;
  loadingData: boolean;
  pendingVerificationEmail: string | null;
  authGateError: string | null;
  clearAuthGateError: () => void;
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
  orgPolicy: OrgPolicy;
  orgIntegrations: OrgIntegrations;
  orgSecrets: OrgSecrets | null;

  signInWithGoogle: () => Promise<void>;
  signInWithGoogleRedirect: () => Promise<void>;
  signInWithOrgEmail: (email: string, password: string) => Promise<void>;
  registerOrgAccount: (email: string, password: string, displayName: string) => Promise<void>;
  sendOrgPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthVerification: () => Promise<void>;
  logout: () => Promise<void>;

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

  // Settings & Organization Configuration actions
  addDepartment: (name: string, headName: string, costCenter: string) => Promise<void>;
  deleteDepartment: (departmentId: string) => Promise<void>;
  addLocation: (name: string, city: string, country: string) => Promise<void>;
  deleteLocation: (locationId: string) => Promise<void>;
  updateUserRole: (uid: string, role: UserRole) => Promise<void>;
  saveOrgPolicy: (policy: Omit<OrgPolicy, 'id'>) => Promise<void>;
  saveOrgIntegrations: (
    integrations: Omit<OrgIntegrations, 'id'>,
    secretsUpdate?: { smtpPassword?: string; ldapBindPassword?: string }
  ) => Promise<void>;
  testSmtpConnection: (params: {
    host: string;
    port: number;
    security: OrgIntegrations['smtpSecurity'];
    username: string;
    password?: string;
    fromEmail: string;
    fromName: string;
    testRecipient?: string;
  }) => Promise<ConnectionTestResult>;
  testLdapConnection: (params: {
    serverUrl: string;
    port: number;
    useTls: boolean;
    bindDn: string;
    bindPassword?: string;
  }) => Promise<ConnectionTestResult>;
  purgeOperationalWorkspaceData: () => Promise<{ deletedCount: number }>;
}

const EamsContext = createContext<EamsContextValue | null>(null);

export const EamsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<'unauthenticated' | 'firebase'>('unauthenticated');
  const [authReady, setAuthReady] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [authGateError, setAuthGateError] = useState<string | null>(null);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [fbProfile, setFbProfile] = useState<AppUser | null>(null);

  // Live Firestore collections
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
  const [returns, setReturns] = useState<AssetReturn[]>([]);
  const [requests, setRequests] = useState<AssetRequest[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [orgPolicy, setOrgPolicy] = useState<OrgPolicy>(DEFAULT_ORG_POLICY);
  const [orgIntegrations, setOrgIntegrations] = useState<OrgIntegrations>(DEFAULT_ORG_INTEGRATIONS);
  const [orgSecrets, setOrgSecrets] = useState<OrgSecrets | null>(null);

  // Clear any legacy demo storage keys on startup
  useEffect(() => {
    try {
      localStorage.removeItem('assetledger_demo_state_v1');
      if (localStorage.getItem('assetledger_mode') === 'demo') {
        localStorage.removeItem('assetledger_mode');
      }
    } catch {
      // Ignore storage restrictions
    }
  }, []);

  const clearAuthGateError = useCallback(() => setAuthGateError(null), []);

  // Initialize organization policy & integration settings and remove any legacy seeded demo depts/locations
  const ensureOrgConfigInitialized = useCallback(async (uid: string, displayName: string) => {
    const now = new Date().toISOString();
    const safeDisplayName = displayName.trim().slice(0, 120) || 'Super Admin';

    const LEGACY_SEED_DEPT_IDS = new Set([
      'dept-eng',
      'dept-prod',
      'dept-it',
      'dept-hr',
      'dept-fin',
      'dept-sales',
      'dept-ops',
    ]);
    const LEGACY_SEED_LOC_IDS = new Set(['loc-sf', 'loc-ny', 'loc-aus', 'loc-lon']);
    const LEGACY_SEED_TIMESTAMP = '2025-01-10T09:00:00Z';

    try {
      const [deptsSnap, locsSnap] = await Promise.all([
        getDocs(collection(db, 'departments')),
        getDocs(collection(db, 'locations')),
      ]);
      const legacyRefs = [
        ...deptsSnap.docs
          .filter(
            (d) =>
              LEGACY_SEED_DEPT_IDS.has(d.id) &&
              (d.data() as Partial<Department>).createdAt === LEGACY_SEED_TIMESTAMP
          )
          .map((d) => d.ref),
        ...locsSnap.docs
          .filter(
            (l) =>
              LEGACY_SEED_LOC_IDS.has(l.id) &&
              (l.data() as Partial<Location>).createdAt === LEGACY_SEED_TIMESTAMP
          )
          .map((l) => l.ref),
      ];
      if (legacyRefs.length > 0) {
        const cleanupBatch = writeBatch(db);
        for (const r of legacyRefs) {
          cleanupBatch.delete(r);
        }
        await cleanupBatch.commit();
      }
    } catch {
      // Non-fatal if collection read/cleanup is unavailable
    }

    const policyRef = doc(db, 'orgPolicy', ORG_POLICY_DOC_ID);
    let policySnap;
    try {
      policySnap = await getDoc(policyRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `orgPolicy/${ORG_POLICY_DOC_ID}`);
    }
    if (!policySnap.exists()) {
      try {
        const bootstrapLog: AuditLog = {
          id: makeId('log'),
          actorUid: uid,
          actorName: safeDisplayName,
          actorRole: 'Super Admin',
          action: 'ORG_WORKSPACE_INITIALIZED',
          entityType: 'OrgPolicy',
          entityId: ORG_POLICY_DOC_ID,
          summary: 'Initialized Dextra AssetLedger production workspace and security policies',
          timestamp: now,
        };
        const batch = writeBatch(db);
        batch.set(policyRef, {
          ...DEFAULT_ORG_POLICY,
          updatedByUid: uid,
          updatedByName: safeDisplayName,
          updatedAt: now,
        });
        batch.set(doc(db, 'auditLogs', bootstrapLog.id), bootstrapLog);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `orgPolicy/${ORG_POLICY_DOC_ID}`);
      }
    }

    const integrationsRef = doc(db, 'orgIntegrations', ORG_INTEGRATIONS_DOC_ID);
    let integrationsSnap;
    try {
      integrationsSnap = await getDoc(integrationsRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `orgIntegrations/${ORG_INTEGRATIONS_DOC_ID}`);
    }
    if (!integrationsSnap.exists()) {
      try {
        await setDoc(integrationsRef, {
          ...DEFAULT_ORG_INTEGRATIONS,
          updatedByUid: uid,
          updatedByName: safeDisplayName,
          updatedAt: now,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `orgIntegrations/${ORG_INTEGRATIONS_DOC_ID}`);
      }
    }
  }, []);

  const hydrateAuthenticatedUser = useCallback(
    async (user: FirebaseUser) => {
      if (!user.emailVerified) {
        setPendingVerificationEmail(user.email || '');
        setFbProfile(null);
        setMode('unauthenticated');
        setAuthReady(true);
        return;
      }

      setPendingVerificationEmail(null);
      setLoadingData(true);

      try {
        // Check organization domain restriction policy if configured
        let activePolicy = DEFAULT_ORG_POLICY;
        try {
          const policySnap = await getDoc(doc(db, 'orgPolicy', ORG_POLICY_DOC_ID));
          if (policySnap.exists()) {
            activePolicy = policySnap.data() as OrgPolicy;
            setOrgPolicy(activePolicy);
          }
        } catch {
          // Policy doc may not exist before first Super Admin login
        }

        const userRef = doc(db, 'users', user.uid);
        let snap;
        try {
          snap = await getDoc(userRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        }

        const now = new Date().toISOString();
        let profile: AppUser;

        if (snap.exists()) {
          profile = snap.data() as AppUser;
        } else {
          const isBootstrap = user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
          const rawName = user.displayName || (user.email ? user.email.split('@')[0] : 'Workspace User');
          profile = {
            uid: user.uid,
            email: (user.email || '').slice(0, 200),
            displayName: rawName.trim().slice(0, 120) || 'Workspace User',
            photoUrl: (user.photoURL || '').slice(0, 500),
            role: isBootstrap ? 'Super Admin' : 'Employee',
            department: isBootstrap ? 'IT & Security' : 'General',
            createdAt: now,
            updatedAt: now,
          };

          const domainCheck = isAllowedOrgEmail(
            profile.email,
            activePolicy.allowedDomains,
            activePolicy.enforceDomainRestriction,
            [BOOTSTRAP_ADMIN_EMAIL]
          );
          if (!domainCheck.allowed) {
            await signOut(auth);
            setAuthGateError(
              `${domainCheck.reason} Contact ${activePolicy.supportEmail || 'IT Administration'}.`
            );
            setMode('unauthenticated');
            return;
          }

          try {
            await setDoc(userRef, profile);
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
          }
        }

        if (profile.role !== 'Super Admin') {
          const domainCheck = isAllowedOrgEmail(
            profile.email,
            activePolicy.allowedDomains,
            activePolicy.enforceDomainRestriction,
            [BOOTSTRAP_ADMIN_EMAIL]
          );
          if (!domainCheck.allowed) {
            await signOut(auth);
            setAuthGateError(
              `${domainCheck.reason} Contact ${activePolicy.supportEmail || 'IT Administration'}.`
            );
            setMode('unauthenticated');
            return;
          }
        }

        if (profile.role === 'Super Admin') {
          await ensureOrgConfigInitialized(profile.uid, profile.displayName);
        }

        setFbProfile(profile);
        setMode('firebase');
      } catch (err) {
        const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
        setAuthGateError(mapFirebaseAuthError(err, host));
        setFbProfile(null);
        setMode('unauthenticated');
        await signOut(auth).catch(() => {});
      } finally {
        setLoadingData(false);
        setAuthReady(true);
      }
    },
    [ensureOrgConfigInitialized]
  );

  // Surface any Google Redirect SSO completion errors on standalone domains (e.g. Vercel)
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
      setAuthGateError(mapFirebaseAuthError(err, host));
    });
  }, []);

  // Auth state observer
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      if (user) {
        await hydrateAuthenticatedUser(user);
      } else {
        setFbProfile(null);
        setPendingVerificationEmail(null);
        setMode('unauthenticated');
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [hydrateAuthenticatedUser]);

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
        doc(db, 'orgPolicy', ORG_POLICY_DOC_ID),
        (snap) => {
          if (snap.exists()) setOrgPolicy(snap.data() as OrgPolicy);
        },
        (err) => handleFirestoreError(err, OperationType.GET, `orgPolicy/${ORG_POLICY_DOC_ID}`)
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'assets'),
        (snap) => setAssets(snap.docs.map((d) => d.data() as Asset)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'assets')
      )
    );
    unsubs.push(
      onSnapshot(
        collection(db, 'departments'),
        (snap) => setDepartments(snap.docs.map((d) => d.data() as Department)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'departments')
      )
    );
    unsubs.push(
      onSnapshot(
        collection(db, 'locations'),
        (snap) => setLocations(snap.docs.map((d) => d.data() as Location)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'locations')
      )
    );

    const empQuery = isStaff
      ? collection(db, 'employees')
      : query(collection(db, 'employees'), where('email', '==', fbProfile.email));
    unsubs.push(
      onSnapshot(
        empQuery,
        (snap) => setEmployees(snap.docs.map((d) => d.data() as Employee)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
      )
    );

    const asgQuery = isStaff
      ? collection(db, 'assetAssignments')
      : query(collection(db, 'assetAssignments'), where('employeeEmail', '==', fbProfile.email));
    unsubs.push(
      onSnapshot(
        asgQuery,
        (snap) => setAssignments(snap.docs.map((d) => d.data() as AssetAssignment)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'assetAssignments')
      )
    );

    const reqQuery = isStaff
      ? collection(db, 'assetRequests')
      : query(collection(db, 'assetRequests'), where('requesterUid', '==', fbUser.uid));
    unsubs.push(
      onSnapshot(
        reqQuery,
        (snap) => setRequests(snap.docs.map((d) => d.data() as AssetRequest)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'assetRequests')
      )
    );

    if (isStaff) {
      unsubs.push(
        onSnapshot(
          collection(db, 'assetReturns'),
          (snap) => setReturns(snap.docs.map((d) => d.data() as AssetReturn)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'assetReturns')
        )
      );
      unsubs.push(
        onSnapshot(
          collection(db, 'maintenanceRecords'),
          (snap) => setMaintenanceRecords(snap.docs.map((d) => d.data() as MaintenanceRecord)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'maintenanceRecords')
        )
      );
    }

    if (role === 'Super Admin' || role === 'IT Admin' || role === 'HR Admin') {
      unsubs.push(
        onSnapshot(
          collection(db, 'auditLogs'),
          (snap) =>
            setAuditLogs(
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
          (snap) => setUsers(snap.docs.map((d) => d.data() as AppUser)),
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      );
      unsubs.push(
        onSnapshot(
          doc(db, 'orgIntegrations', ORG_INTEGRATIONS_DOC_ID),
          (snap) => {
            if (snap.exists()) setOrgIntegrations(snap.data() as OrgIntegrations);
          },
          (err) =>
            handleFirestoreError(err, OperationType.GET, `orgIntegrations/${ORG_INTEGRATIONS_DOC_ID}`)
        )
      );
      unsubs.push(
        onSnapshot(
          doc(db, 'orgSecrets', ORG_SECRETS_DOC_ID),
          (snap) => {
            if (snap.exists()) setOrgSecrets(snap.data() as OrgSecrets);
          },
          (err) => handleFirestoreError(err, OperationType.GET, `orgSecrets/${ORG_SECRETS_DOC_ID}`)
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [mode, fbUser, fbProfile]);

  const signInWithGoogle = useCallback(async () => {
    setAuthGateError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (isPopupFallbackError(err) && isStandaloneBrowserWindow()) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      throw err;
    }
  }, []);

  const signInWithGoogleRedirect = useCallback(async () => {
    setAuthGateError(null);
    if (!isStandaloneBrowserWindow()) {
      throw new Error(
        'Redirect SSO is unavailable inside an embedded iframe. Use Corporate Google SSO popup instead.'
      );
    }
    await signInWithRedirect(auth, googleProvider);
  }, []);

  const signInWithOrgEmail = useCallback(async (email: string, password: string) => {
    setAuthGateError(null);
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    if (!cred.user.emailVerified) {
      await sendEmailVerification(cred.user);
      setPendingVerificationEmail(cred.user.email || email.trim());
    }
  }, []);

  const registerOrgAccount = useCallback(
    async (email: string, password: string, displayName: string) => {
      setAuthGateError(null);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
      await sendEmailVerification(cred.user);
      setPendingVerificationEmail(cred.user.email || email.trim());
    },
    []
  );

  const sendOrgPasswordReset = useCallback(async (email: string) => {
    setAuthGateError(null);
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (auth.currentUser && !auth.currentUser.emailVerified) {
      await sendEmailVerification(auth.currentUser);
    }
  }, []);

  const refreshAuthVerification = useCallback(async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      await hydrateAuthenticatedUser(auth.currentUser);
    }
  }, [hydrateAuthenticatedUser]);

  const logout = useCallback(async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
    setFbProfile(null);
    setPendingVerificationEmail(null);
    setMode('unauthenticated');
  }, []);

  const makeAuditEntry = useCallback(
    (action: string, entityType: string, entityId: string, summary: string): AuditLog => ({
      id: makeId('log'),
      actorUid: fbProfile?.uid || 'system',
      actorName: (fbProfile?.displayName || 'System Admin').slice(0, 120),
      actorRole: fbProfile?.role || 'Super Admin',
      action: action.slice(0, 100),
      entityType: entityType.slice(0, 60),
      entityId: entityId.slice(0, 128),
      summary: summary.slice(0, 500),
      timestamp: new Date().toISOString(),
    }),
    [fbProfile]
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

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'employees', id), record);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `employees/${id}`);
      }
      return record;
    },
    [employees, makeAuditEntry]
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

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'employees', employeeId), updated);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `employees/${employeeId}`);
      }
    },
    [assignments, employees, makeAuditEntry]
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

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'employees', employeeId), updated);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `employees/${employeeId}`);
      }
    },
    [assignments, employees, makeAuditEntry]
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

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'assets', id), record);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `assets/${id}`);
      }
      return record;
    },
    [assets, makeAuditEntry]
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
      return created;
    },
    [assets, makeAuditEntry]
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
      return created;
    },
    [employees, makeAuditEntry]
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
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'assets', assetId), updated);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `assets/${assetId}`);
      }
    },
    [assets, makeAuditEntry]
  );

  const uploadImageAsset = useCallback(
    async (file: File, folder: 'assets' | 'returns'): Promise<string> => {
      if (auth.currentUser) {
        try {
          const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
          await uploadBytes(storageRef, file);
          return await getDownloadURL(storageRef);
        } catch {
          // Fallback to data URL if storage bucket rules block or offline
        }
      }
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });
    },
    []
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
      if (!fbProfile) throw new Error('Authenticated user required.');
      if (params.employeeIds.length === 0 || params.assetIds.length === 0) {
        throw new Error('Select at least one employee and one available asset.');
      }

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
          issuedByUid: fbProfile.uid,
          issuedByName: fbProfile.displayName,
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

      try {
        await runTransaction(db, async (tx) => {
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

      return createdAssignments;
    },
    [assets, assignments, employees, fbProfile, makeAuditEntry]
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
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'assetAssignments', assignmentId), updated);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `assetAssignments/${assignmentId}`);
      }
    },
    [assignments, makeAuditEntry]
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
      if (!fbProfile) throw new Error('Authenticated user required.');
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
        processedByUid: fbProfile.uid,
        processedByName: fbProfile.displayName,
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
      return retRecord;
    },
    [assets, assignments, fbProfile, makeAuditEntry]
  );

  const createAssetRequest = useCallback(
    async (params: { category: string; urgency: RequestUrgency; justification: string }) => {
      if (!fbProfile) throw new Error('Authenticated user required.');
      const now = new Date().toISOString();
      const id = makeId('req');
      const req: AssetRequest = {
        id,
        requesterUid: fbProfile.uid,
        requesterEmployeeId: fbProfile.employeeId || fbProfile.uid,
        requesterName: fbProfile.displayName,
        department: fbProfile.department || 'Engineering',
        category: params.category,
        justification: params.justification,
        urgency: params.urgency,
        status: 'Requested',
        createdAt: now,
        updatedAt: now,
      };
      const audit = makeAuditEntry(
        'ASSET_REQUEST_SUBMITTED',
        'AssetRequest',
        id,
        `${req.requesterName} requested ${req.category} (${req.urgency})`
      );
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'assetRequests', id), req);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `assetRequests/${id}`);
      }
      return req;
    },
    [fbProfile, makeAuditEntry]
  );

  const transitionAssetRequest = useCallback(
    async (params: {
      requestId: string;
      nextStatus: RequestStatus;
      rejectionReason?: string;
      assignedAssetId?: string;
    }) => {
      if (!fbProfile) throw new Error('Authenticated user required.');
      const existingReq = requests.find((r) => r.id === params.requestId);
      if (!existingReq) throw new Error('Asset request not found.');
      if (!canTransitionRequest(fbProfile.role, existingReq.status, params.nextStatus)) {
        throw new Error(
          `Role "${fbProfile.role}" cannot transition request from ${existingReq.status} to ${params.nextStatus}.`
        );
      }

      const now = new Date().toISOString();
      const updated: AssetRequest = {
        ...existingReq,
        status: params.nextStatus,
        managerApprovedBy:
          params.nextStatus === 'Manager Approved'
            ? fbProfile.displayName
            : existingReq.managerApprovedBy,
        managerApprovedAt:
          params.nextStatus === 'Manager Approved' ? now : existingReq.managerApprovedAt,
        itApprovedBy:
          params.nextStatus === 'IT Approved' ? fbProfile.displayName : existingReq.itApprovedBy,
        itApprovedAt: params.nextStatus === 'IT Approved' ? now : existingReq.itApprovedAt,
        rejectionReason:
          params.nextStatus === 'Rejected'
            ? params.rejectionReason || 'Rejected by reviewer'
            : existingReq.rejectionReason,
        assignedAssetId: params.assignedAssetId || existingReq.assignedAssetId,
        updatedAt: now,
      };

      const audit = makeAuditEntry(
        'ASSET_REQUEST_UPDATED',
        'AssetRequest',
        existingReq.id,
        `Request ${existingReq.id} transitioned ${existingReq.status} -> ${params.nextStatus}`
      );

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'assetRequests', existingReq.id), updated);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `assetRequests/${existingReq.id}`);
      }
    },
    [fbProfile, makeAuditEntry, requests]
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

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'maintenanceRecords', id), record);
        if (fbProfile?.role === 'Super Admin' || fbProfile?.role === 'IT Admin') {
          batch.set(doc(db, 'assets', asset.id), updatedAsset);
        }
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `maintenanceRecords/${id}`);
      }
      return record;
    },
    [assets, fbProfile, makeAuditEntry]
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

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'maintenanceRecords', existingRec.id), updated);
        if (updatedAsset) batch.set(doc(db, 'assets', updatedAsset.id), updatedAsset);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `maintenanceRecords/${existingRec.id}`);
      }
    },
    [assets, maintenanceRecords, makeAuditEntry]
  );

  const addDepartment = useCallback(
    async (name: string, headName: string, costCenter: string) => {
      const id = makeId('dept');
      const dept: Department = {
        id,
        name: name.trim(),
        headName: headName.trim(),
        costCenter: costCenter.trim(),
        createdAt: new Date().toISOString(),
      };
      const audit = makeAuditEntry('DEPARTMENT_ADDED', 'Department', id, `Added department ${dept.name}`);
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'departments', id), dept);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `departments/${id}`);
      }
    },
    [makeAuditEntry]
  );

  const deleteDepartment = useCallback(
    async (departmentId: string) => {
      const target = departments.find((d) => d.id === departmentId);
      const audit = makeAuditEntry(
        'DEPARTMENT_DELETED',
        'Department',
        departmentId,
        `Removed department ${target?.name || departmentId}`
      );
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'departments', departmentId));
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `departments/${departmentId}`);
      }
    },
    [departments, makeAuditEntry]
  );

  const addLocation = useCallback(
    async (name: string, city: string, country: string) => {
      const id = makeId('loc');
      const loc: Location = {
        id,
        name: name.trim(),
        city: city.trim(),
        country: country.trim(),
        createdAt: new Date().toISOString(),
      };
      const audit = makeAuditEntry('LOCATION_ADDED', 'Location', id, `Added location ${loc.name}`);
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'locations', id), loc);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `locations/${id}`);
      }
    },
    [makeAuditEntry]
  );

  const deleteLocation = useCallback(
    async (locationId: string) => {
      const target = locations.find((l) => l.id === locationId);
      const audit = makeAuditEntry(
        'LOCATION_DELETED',
        'Location',
        locationId,
        `Removed office location ${target?.name || locationId}`
      );
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'locations', locationId));
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `locations/${locationId}`);
      }
    },
    [locations, makeAuditEntry]
  );

  const updateUserRole = useCallback(
    async (uid: string, role: UserRole) => {
      const target = users.find((u) => u.uid === uid);
      if (!target) throw new Error('User not found.');
      const updated: AppUser = { ...target, role, updatedAt: new Date().toISOString() };
      const audit = makeAuditEntry(
        'USER_ROLE_UPDATED',
        'User',
        uid,
        `Changed ${target.displayName} role to ${role}`
      );
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', uid), updated);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
      }
    },
    [makeAuditEntry, users]
  );

  const saveOrgPolicy = useCallback(
    async (input: Omit<OrgPolicy, 'id'>) => {
      if (!fbProfile) throw new Error('Authenticated Super Admin required.');
      const now = new Date().toISOString();
      const record: OrgPolicy = {
        ...input,
        id: ORG_POLICY_DOC_ID,
        orgName: input.orgName.trim().slice(0, 120) || 'Dextra',
        orgSlug:
          input.orgSlug
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .slice(0, 60) || 'dextra',
        primaryDomain: input.primaryDomain.trim().toLowerCase().slice(0, 120),
        allowedDomains: input.allowedDomains.slice(0, 10),
        supportEmail: input.supportEmail.trim().slice(0, 200),
        updatedByUid: fbProfile.uid,
        updatedByName: fbProfile.displayName,
        updatedAt: now,
      };
      const audit = makeAuditEntry(
        'ORG_POLICY_UPDATED',
        'OrgPolicy',
        ORG_POLICY_DOC_ID,
        `Updated ${record.orgName} auth policy (Domains: ${record.allowedDomains.join(', ')}, Enforce: ${record.enforceDomainRestriction})`
      );
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'orgPolicy', ORG_POLICY_DOC_ID), record);
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `orgPolicy/${ORG_POLICY_DOC_ID}`);
      }
    },
    [fbProfile, makeAuditEntry]
  );

  const saveOrgIntegrations = useCallback(
    async (
      input: Omit<OrgIntegrations, 'id'>,
      secretsUpdate?: { smtpPassword?: string; ldapBindPassword?: string }
    ) => {
      if (!fbProfile) throw new Error('Authenticated Super Admin required.');
      const smtpCheck = validateSmtpConfig(input);
      if (!smtpCheck.valid) throw new Error(smtpCheck.error);
      const ldapCheck = validateLdapConfig(input);
      if (!ldapCheck.valid) throw new Error(ldapCheck.error);

      const now = new Date().toISOString();
      const smtpHasPassword = Boolean(secretsUpdate?.smtpPassword?.trim()) || input.smtpHasPassword;
      const ldapHasBindPassword =
        Boolean(secretsUpdate?.ldapBindPassword?.trim()) || input.ldapHasBindPassword;

      const record: OrgIntegrations = {
        ...input,
        id: ORG_INTEGRATIONS_DOC_ID,
        smtpHost: input.smtpHost.trim().slice(0, 200),
        smtpFromName: input.smtpFromName.trim().slice(0, 120),
        smtpFromEmail: input.smtpFromEmail.trim().slice(0, 200),
        smtpUsername: input.smtpUsername.trim().slice(0, 200),
        smtpHasPassword,
        ldapServerUrl: input.ldapServerUrl.trim().slice(0, 250),
        ldapBaseDn: input.ldapBaseDn.trim().slice(0, 250),
        ldapBindDn: input.ldapBindDn.trim().slice(0, 250),
        ldapHasBindPassword,
        ldapUserSearchFilter: input.ldapUserSearchFilter.trim().slice(0, 250),
        ldapGroupSearchFilter: (input.ldapGroupSearchFilter || '').trim().slice(0, 250),
        ldapAdminGroupDn: (input.ldapAdminGroupDn || '').trim().slice(0, 250),
        ldapItGroupDn: (input.ldapItGroupDn || '').trim().slice(0, 250),
        ldapHrGroupDn: (input.ldapHrGroupDn || '').trim().slice(0, 250),
        updatedByUid: fbProfile.uid,
        updatedByName: fbProfile.displayName,
        updatedAt: now,
      };

      const audit = makeAuditEntry(
        'ORG_INTEGRATIONS_UPDATED',
        'OrgIntegrations',
        ORG_INTEGRATIONS_DOC_ID,
        `Updated SMTP (${record.smtpEnabled ? record.smtpHost : 'Disabled'}) & LDAP (${record.ldapEnabled ? record.ldapServerUrl : 'Disabled'})`
      );

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'orgIntegrations', ORG_INTEGRATIONS_DOC_ID), record);
        if (secretsUpdate?.smtpPassword?.trim() || secretsUpdate?.ldapBindPassword?.trim()) {
          const nextSecrets: OrgSecrets = {
            id: ORG_SECRETS_DOC_ID,
            smtpPassword: secretsUpdate.smtpPassword?.trim()
              ? secretsUpdate.smtpPassword.trim().slice(0, 256)
              : orgSecrets?.smtpPassword || '',
            ldapBindPassword: secretsUpdate.ldapBindPassword?.trim()
              ? secretsUpdate.ldapBindPassword.trim().slice(0, 256)
              : orgSecrets?.ldapBindPassword || '',
            updatedAt: now,
          };
          batch.set(doc(db, 'orgSecrets', ORG_SECRETS_DOC_ID), nextSecrets);
        }
        batch.set(doc(db, 'auditLogs', audit.id), audit);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `orgIntegrations/${ORG_INTEGRATIONS_DOC_ID}`
        );
      }
    },
    [fbProfile, makeAuditEntry, orgSecrets]
  );

  const testSmtpConnection = useCallback(
    async (params: {
      host: string;
      port: number;
      security: OrgIntegrations['smtpSecurity'];
      username: string;
      password?: string;
      fromEmail: string;
      fromName: string;
      testRecipient?: string;
    }): Promise<ConnectionTestResult> => {
      const response = await fetch('/api/org/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          password: params.password?.trim() || orgSecrets?.smtpPassword || '',
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.status === 404 || !contentType.includes('application/json')) {
        const check = validateSmtpConfig({
          smtpEnabled: true,
          smtpHost: params.host,
          smtpPort: params.port,
          smtpFromEmail: params.fromEmail,
        });
        if (!check.valid) return { ok: false, error: check.error };
        return {
          ok: true,
          latencyMs: 0,
          tlsActive: params.security !== 'None',
          banner: `Validated ${params.host}:${params.port} (${params.security}). Live TCP socket test requires running via server.ts.`,
        };
      }
      return (await response.json()) as ConnectionTestResult;
    },
    [orgSecrets]
  );

  const testLdapConnection = useCallback(
    async (params: {
      serverUrl: string;
      port: number;
      useTls: boolean;
      bindDn: string;
      bindPassword?: string;
    }): Promise<ConnectionTestResult> => {
      const response = await fetch('/api/org/test-ldap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          bindPassword: params.bindPassword?.trim() || orgSecrets?.ldapBindPassword || '',
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.status === 404 || !contentType.includes('application/json')) {
        if (!params.serverUrl.trim() || !params.bindDn.includes('=')) {
          return {
            ok: false,
            error: 'Valid LDAP server URL and Bind DN syntax are required.',
          };
        }
        return {
          ok: true,
          latencyMs: 0,
          tlsActive: params.useTls,
          summary: `Validated ${params.serverUrl}:${params.port} syntax. Live LDAP bind probe requires running via server.ts.`,
        };
      }
      return (await response.json()) as ConnectionTestResult;
    },
    [orgSecrets]
  );

  const purgeOperationalWorkspaceData = useCallback(async (): Promise<{ deletedCount: number }> => {
    if (!fbProfile || fbProfile.role !== 'Super Admin') {
      throw new Error('Only Super Admins can purge workspace operational data.');
    }

    const cleanableCollections = [
      'assets',
      'employees',
      'assetRequests',
      'maintenanceRecords',
      'departments',
      'locations',
    ] as const;

    let deletedCount = 0;

    for (const colName of cleanableCollections) {
      let snap;
      try {
        snap = await getDocs(collection(db, colName));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, colName);
      }
      if (snap.empty) continue;

      const refs = snap.docs.map((d) => d.ref);
      for (let i = 0; i < refs.length; i += 400) {
        const chunk = refs.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const r of chunk) {
          batch.delete(r);
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, colName);
        }
        deletedCount += chunk.length;
      }
    }

    const audit = makeAuditEntry(
      'WORKSPACE_DATA_CLEANED',
      'OrgPolicy',
      ORG_POLICY_DOC_ID,
      `Purged ${deletedCount} demo/operational record(s) from workspace collections`
    );
    try {
      await setDoc(doc(db, 'auditLogs', audit.id), audit);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `auditLogs/${audit.id}`);
    }

    return { deletedCount };
  }, [fbProfile, makeAuditEntry]);

  const value: EamsContextValue = {
    mode,
    authReady,
    loadingData,
    pendingVerificationEmail,
    authGateError,
    clearAuthGateError,
    currentUser: fbProfile,
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
    orgPolicy,
    orgIntegrations,
    orgSecrets,
    signInWithGoogle,
    signInWithGoogleRedirect,
    signInWithOrgEmail,
    registerOrgAccount,
    sendOrgPasswordReset,
    resendVerificationEmail,
    refreshAuthVerification,
    logout,
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
    deleteDepartment,
    addLocation,
    deleteLocation,
    updateUserRole,
    saveOrgPolicy,
    saveOrgIntegrations,
    testSmtpConnection,
    testLdapConnection,
    purgeOperationalWorkspaceData,
  };

  return <EamsContext.Provider value={value}>{children}</EamsContext.Provider>;
};

export function useEams(): EamsContextValue {
  const ctx = useContext(EamsContext);
  if (!ctx) throw new Error('useEams must be used within EamsProvider');
  return ctx;
}
