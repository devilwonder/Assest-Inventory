import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  FolderTree,
  GlobeLock,
  KeyRound,
  Mail,
  MapPin,
  Save,
  Send,
  Server,
  Shield,
  UserCog,
} from 'lucide-react';
import { useEams, type ConnectionTestResult } from '../services/eamsStore';
import {
  SMTP_SECURITY_MODES,
  USER_ROLES,
  type OrgIntegrations,
  type OrgPolicy,
  type SmtpSecurityMode,
  type UserRole,
} from '../types/eams';
import {
  hasPermission,
  parseAllowedDomains,
  validateLdapConfig,
  validateSmtpConfig,
} from '../utils/assetRules';

type SettingsTab = 'organization' | 'smtp' | 'ldap' | 'directory';

const PERMISSION_ROWS: Array<{ capability: string; roles: Record<UserRole, string> }> = [
  {
    capability: 'Manage Org Policy, SMTP, LDAP & User Roles',
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
    currentUser,
    departments,
    locations,
    users,
    auditLogs,
    orgPolicy,
    orgIntegrations,
    addDepartment,
    addLocation,
    updateUserRole,
    saveOrgPolicy,
    saveOrgIntegrations,
    testSmtpConnection,
    testLdapConnection,
  } = useEams();

  const canManageSettings = currentUser ? hasPermission(currentUser.role, 'manage_settings') : false;

  const [activeSubTab, setActiveSubTab] = useState<SettingsTab>(
    canManageSettings ? 'organization' : 'directory'
  );

  // Organization & Domain Policy state
  const [policyForm, setPolicyForm] = useState<Omit<OrgPolicy, 'id'>>({
    orgName: orgPolicy.orgName,
    orgSlug: orgPolicy.orgSlug,
    primaryDomain: orgPolicy.primaryDomain,
    allowedDomains: orgPolicy.allowedDomains,
    supportEmail: orgPolicy.supportEmail,
    enforceDomainRestriction: orgPolicy.enforceDomainRestriction,
    enableGoogleSso: orgPolicy.enableGoogleSso,
    enableOrgEmailLogin: orgPolicy.enableOrgEmailLogin,
    enableLdapLogin: orgPolicy.enableLdapLogin,
    defaultOnboardingRole: orgPolicy.defaultOnboardingRole,
  });
  const [allowedDomainsInput, setAllowedDomainsInput] = useState(
    orgPolicy.allowedDomains.join(', ')
  );
  const [policyFeedback, setPolicyFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [savingPolicy, setSavingPolicy] = useState(false);

  // SMTP & LDAP Integrations state
  const [intForm, setIntForm] = useState<Omit<OrgIntegrations, 'id'>>(orgIntegrations);
  const [smtpPasswordInput, setSmtpPasswordInput] = useState('');
  const [smtpTestRecipient, setSmtpTestRecipient] = useState('');
  const [smtpFeedback, setSmtpFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);

  const [ldapBindPasswordInput, setLdapBindPasswordInput] = useState('');
  const [ldapFeedback, setLdapFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [testingLdap, setTestingLdap] = useState(false);
  const [savingLdap, setSavingLdap] = useState(false);

  // Directory & Audit state
  const [deptName, setDeptName] = useState('');
  const [deptHead, setDeptHead] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [locName, setLocName] = useState('');
  const [locCity, setLocCity] = useState('');
  const [locCountry, setLocCountry] = useState('');
  const [auditSearch, setAuditSearch] = useState('');

  useEffect(() => {
    setPolicyForm({
      orgName: orgPolicy.orgName,
      orgSlug: orgPolicy.orgSlug,
      primaryDomain: orgPolicy.primaryDomain,
      allowedDomains: orgPolicy.allowedDomains,
      supportEmail: orgPolicy.supportEmail,
      enforceDomainRestriction: orgPolicy.enforceDomainRestriction,
      enableGoogleSso: orgPolicy.enableGoogleSso,
      enableOrgEmailLogin: orgPolicy.enableOrgEmailLogin,
      enableLdapLogin: orgPolicy.enableLdapLogin,
      defaultOnboardingRole: orgPolicy.defaultOnboardingRole,
    });
    setAllowedDomainsInput(orgPolicy.allowedDomains.join(', '));
  }, [orgPolicy]);

  useEffect(() => {
    setIntForm(orgIntegrations);
  }, [orgIntegrations]);

  const filteredLogs = auditLogs.filter((l) => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      l.summary.toLowerCase().includes(q) ||
      l.actorName.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q)
    );
  });

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setPolicyFeedback(null);
    const parsedDomains = parseAllowedDomains(allowedDomainsInput);
    if (parsedDomains.length === 0) {
      setPolicyFeedback({
        type: 'err',
        text: 'Specify at least one valid corporate domain (e.g. dextra.com).',
      });
      return;
    }
    setSavingPolicy(true);
    try {
      await saveOrgPolicy({
        ...policyForm,
        allowedDomains: parsedDomains,
      });
      setPolicyFeedback({
        type: 'ok',
        text: `Organization authentication & domain policy saved for ${policyForm.orgName}.`,
      });
    } catch (err) {
      setPolicyFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save organization policy.',
      });
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpFeedback(null);
    const check = validateSmtpConfig(intForm);
    if (!check.valid) {
      setSmtpFeedback({ type: 'err', text: check.error || 'Invalid SMTP configuration.' });
      return;
    }
    setSavingSmtp(true);
    try {
      await saveOrgIntegrations(
        intForm,
        smtpPasswordInput.trim() ? { smtpPassword: smtpPasswordInput.trim() } : undefined
      );
      setSmtpPasswordInput('');
      setSmtpFeedback({ type: 'ok', text: 'SMTP mail relay configuration saved securely.' });
    } catch (err) {
      setSmtpFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save SMTP configuration.',
      });
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    setSmtpFeedback(null);
    const check = validateSmtpConfig({ ...intForm, smtpEnabled: true });
    if (!check.valid) {
      setSmtpFeedback({ type: 'err', text: check.error || 'Complete SMTP host, port, and sender email first.' });
      return;
    }
    setTestingSmtp(true);
    try {
      const res: ConnectionTestResult = await testSmtpConnection({
        host: intForm.smtpHost,
        port: intForm.smtpPort,
        security: intForm.smtpSecurity,
        username: intForm.smtpUsername,
        password: smtpPasswordInput.trim() || undefined,
        fromEmail: intForm.smtpFromEmail,
        fromName: intForm.smtpFromName,
        testRecipient: smtpTestRecipient.trim() || undefined,
      });
      const statusText = res.ok
        ? `Connected (${res.latencyMs}ms · ${res.tlsActive ? 'TLS' : 'Plain'}${res.testEmailSent ? ' · Test email dispatched' : ''})`
        : `Failed: ${res.error || 'Connection error'}`;
      const nextForm: Omit<OrgIntegrations, 'id'> = {
        ...intForm,
        smtpLastTestedAt: new Date().toISOString(),
        smtpLastTestStatus: statusText.slice(0, 240),
      };
      setIntForm(nextForm);
      if (canManageSettings) {
        await saveOrgIntegrations(
          nextForm,
          smtpPasswordInput.trim() ? { smtpPassword: smtpPasswordInput.trim() } : undefined
        );
      }
      setSmtpFeedback({
        type: res.ok ? 'ok' : 'err',
        text: res.ok
          ? `${statusText}${res.banner ? ` — ${res.banner}` : ''}`
          : res.error || 'SMTP verification failed.',
      });
    } catch (err) {
      setSmtpFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'SMTP verification request failed.',
      });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleSaveLdap = async (e: React.FormEvent) => {
    e.preventDefault();
    setLdapFeedback(null);
    const check = validateLdapConfig(intForm);
    if (!check.valid) {
      setLdapFeedback({ type: 'err', text: check.error || 'Invalid LDAP configuration.' });
      return;
    }
    setSavingLdap(true);
    try {
      await saveOrgIntegrations(
        intForm,
        ldapBindPasswordInput.trim()
          ? { ldapBindPassword: ldapBindPasswordInput.trim() }
          : undefined
      );
      setLdapBindPasswordInput('');
      setLdapFeedback({
        type: 'ok',
        text: 'LDAP / Active Directory integration settings saved securely.',
      });
    } catch (err) {
      setLdapFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save LDAP settings.',
      });
    } finally {
      setSavingLdap(false);
    }
  };

  const handleTestLdap = async () => {
    setLdapFeedback(null);
    const check = validateLdapConfig({ ...intForm, ldapEnabled: true });
    if (!check.valid) {
      setLdapFeedback({ type: 'err', text: check.error || 'Complete LDAP URL, port, and Base DN first.' });
      return;
    }
    setTestingLdap(true);
    try {
      const res: ConnectionTestResult = await testLdapConnection({
        serverUrl: intForm.ldapServerUrl,
        port: intForm.ldapPort,
        useTls: intForm.ldapUseTls,
        bindDn: intForm.ldapBindDn,
        bindPassword: ldapBindPasswordInput.trim() || undefined,
      });
      const statusText = res.ok
        ? `${res.summary || 'Connected'} (${res.latencyMs}ms · ${res.tlsActive ? 'LDAPS/TLS' : 'Plain LDAP'})`
        : `Failed: ${res.error || 'Bind error'}`;
      const nextForm: Omit<OrgIntegrations, 'id'> = {
        ...intForm,
        ldapLastTestedAt: new Date().toISOString(),
        ldapLastTestStatus: statusText.slice(0, 240),
      };
      setIntForm(nextForm);
      if (canManageSettings) {
        await saveOrgIntegrations(
          nextForm,
          ldapBindPasswordInput.trim()
            ? { ldapBindPassword: ldapBindPasswordInput.trim() }
            : undefined
        );
      }
      setLdapFeedback({
        type: res.ok ? 'ok' : 'err',
        text: res.ok ? statusText : res.error || 'LDAP verification failed.',
      });
    } catch (err) {
      setLdapFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'LDAP verification request failed.',
      });
    } finally {
      setTestingLdap(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 flex flex-wrap items-center gap-1">
        {canManageSettings && (
          <>
            <button
              type="button"
              onClick={() => setActiveSubTab('organization')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
                activeSubTab === 'organization'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <GlobeLock className="w-3.5 h-3.5" />
              Org &amp; Login Policy
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('smtp')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
                activeSubTab === 'smtp'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Email &amp; SMTP Relay
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('ldap')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
                activeSubTab === 'ldap'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              LDAP / Active Directory
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setActiveSubTab('directory')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeSubTab === 'directory'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" />
          Directory, RBAC &amp; Audit
        </button>
      </div>

      {/* TAB 1: ORGANIZATION PROFILE & LOGIN POLICY */}
      {activeSubTab === 'organization' && canManageSettings && (
        <form
          onSubmit={handleSavePolicy}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Organization Identity &amp; Authentication Policy
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure tenant branding, authorized corporate email domains, and allowed sign-in methods for Dextra.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingPolicy}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              {savingPolicy ? 'Saving...' : 'Save Organization Policy'}
            </button>
          </div>

          {policyFeedback && (
            <div
              className={`p-3 text-xs rounded-lg border ${
                policyFeedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {policyFeedback.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="org-name" className="block text-xs font-medium text-slate-700 mb-1">
                Organization Name *
              </label>
              <input
                id="org-name"
                type="text"
                required
                value={policyForm.orgName}
                onChange={(e) => setPolicyForm({ ...policyForm, orgName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="org-slug" className="block text-xs font-medium text-slate-700 mb-1">
                Tenant Identifier Slug *
              </label>
              <input
                id="org-slug"
                type="text"
                required
                value={policyForm.orgSlug}
                onChange={(e) => setPolicyForm({ ...policyForm, orgSlug: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="primary-domain" className="block text-xs font-medium text-slate-700 mb-1">
                Primary Corporate Domain *
              </label>
              <input
                id="primary-domain"
                type="text"
                required
                placeholder="dextra.com"
                value={policyForm.primaryDomain}
                onChange={(e) => setPolicyForm({ ...policyForm, primaryDomain: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="support-email" className="block text-xs font-medium text-slate-700 mb-1">
                IT Support Contact Email *
              </label>
              <input
                id="support-email"
                type="email"
                required
                placeholder="it-support@dextra.com"
                value={policyForm.supportEmail}
                onChange={(e) => setPolicyForm({ ...policyForm, supportEmail: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="allowed-domains" className="block text-xs font-medium text-slate-700 mb-1">
                Allowed Corporate Email Domains (comma-separated, max 10)
              </label>
              <input
                id="allowed-domains"
                type="text"
                placeholder="dextra.com, dextra.io"
                value={allowedDomainsInput}
                onChange={(e) => setAllowedDomainsInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                When Domain Restriction is enforced below, non-Super-Admin users must sign in with an address matching one of these domains.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={policyForm.enforceDomainRestriction}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, enforceDomainRestriction: e.target.checked })
                }
                className="mt-0.5 rounded border-slate-300 text-blue-700"
              />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Enforce Corporate Domain Restriction
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Block sign-ins from external personal email domains (Bootstrap Super Admin remains exempt).
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={policyForm.enableGoogleSso}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, enableGoogleSso: e.target.checked })
                }
                className="mt-0.5 rounded border-slate-300 text-blue-700"
              />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Enable Corporate Google Workspace SSO
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Allow Dextra users to authenticate via verified Google Workspace accounts.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={policyForm.enableOrgEmailLogin}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, enableOrgEmailLogin: e.target.checked })
                }
                className="mt-0.5 rounded border-slate-300 text-blue-700"
              />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Enable Organization Email &amp; Password Login
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Requires Email/Password provider enabled in Firebase Authentication Console.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={policyForm.enableLdapLogin}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, enableLdapLogin: e.target.checked })
                }
                className="mt-0.5 rounded border-slate-300 text-blue-700"
              />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Enable LDAP / Active Directory Federation Policy
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Pair directory group DN mappings with SAML/OIDC Identity Platform federation.
                </div>
              </div>
            </label>
          </div>

          {orgPolicy.updatedAt && (
            <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
              Last saved {orgPolicy.updatedAt.replace('T', ' ').slice(0, 19)} UTC by{' '}
              {orgPolicy.updatedByName || 'Super Admin'}
            </div>
          )}
        </form>
      )}

      {/* TAB 2: EMAIL & SMTP RELAY */}
      {activeSubTab === 'smtp' && canManageSettings && (
        <form
          onSubmit={handleSaveSmtp}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Organization Email &amp; SMTP Relay Setup
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure Dextra&apos;s outbound SMTP server for asset handover receipts, return confirmations, warranty alerts, and exit clearances.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={testingSmtp}
                onClick={handleTestSmtp}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {testingSmtp ? 'Testing...' : 'Test SMTP Connection'}
              </button>
              <button
                type="submit"
                disabled={savingSmtp}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingSmtp ? 'Saving...' : 'Save SMTP'}
              </button>
            </div>
          </div>

          {smtpFeedback && (
            <div
              className={`p-3 text-xs rounded-lg border ${
                smtpFeedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {smtpFeedback.text}
            </div>
          )}

          <label className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-900">
                Enable Automated Organization SMTP Notifications
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Dispatch corporate email notifications through your configured SMTP relay.
              </div>
            </div>
            <input
              type="checkbox"
              checked={intForm.smtpEnabled}
              onChange={(e) => setIntForm({ ...intForm, smtpEnabled: e.target.checked })}
              className="rounded border-slate-300 text-blue-700 w-4 h-4"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="smtp-host" className="block text-xs font-medium text-slate-700 mb-1">
                SMTP Hostname
              </label>
              <input
                id="smtp-host"
                type="text"
                placeholder="smtp.office365.com"
                value={intForm.smtpHost}
                onChange={(e) => setIntForm({ ...intForm, smtpHost: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="smtp-port" className="block text-xs font-medium text-slate-700 mb-1">
                Port
              </label>
              <input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                value={intForm.smtpPort}
                onChange={(e) =>
                  setIntForm({
                    ...intForm,
                    smtpPort: Number.parseInt(e.target.value || '587', 10) || 587,
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="smtp-security"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Encryption / Security
              </label>
              <select
                id="smtp-security"
                value={intForm.smtpSecurity}
                onChange={(e) =>
                  setIntForm({ ...intForm, smtpSecurity: e.target.value as SmtpSecurityMode })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {SMTP_SECURITY_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="smtp-from-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Sender Display Name
              </label>
              <input
                id="smtp-from-name"
                type="text"
                placeholder="Dextra IT Asset Management"
                value={intForm.smtpFromName}
                onChange={(e) => setIntForm({ ...intForm, smtpFromName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="smtp-from-email"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Sender From Email
              </label>
              <input
                id="smtp-from-email"
                type="email"
                placeholder="assets-noreply@dextra.com"
                value={intForm.smtpFromEmail}
                onChange={(e) => setIntForm({ ...intForm, smtpFromEmail: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="smtp-user" className="block text-xs font-medium text-slate-700 mb-1">
                SMTP Username
              </label>
              <input
                id="smtp-user"
                type="text"
                placeholder="assets-noreply@dextra.com"
                value={intForm.smtpUsername}
                onChange={(e) => setIntForm({ ...intForm, smtpUsername: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="smtp-pass" className="block text-xs font-medium text-slate-700 mb-1">
                SMTP Password / App Token{' '}
                {intForm.smtpHasPassword && (
                  <span className="text-emerald-700 font-normal">(Stored securely)</span>
                )}
              </label>
              <input
                id="smtp-pass"
                type="password"
                autoComplete="new-password"
                placeholder={intForm.smtpHasPassword ? '•••••••• (leave blank to keep)' : 'Enter SMTP password'}
                value={smtpPasswordInput}
                onChange={(e) => setSmtpPasswordInput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="smtp-test-recipient"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Optional Test Email Recipient
              </label>
              <input
                id="smtp-test-recipient"
                type="email"
                placeholder="it-admin@dextra.com"
                value={smtpTestRecipient}
                onChange={(e) => setSmtpTestRecipient(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Email Notification Triggers
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <label className="flex items-center gap-2.5 p-3 border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={intForm.notifyOnAssignment}
                  onChange={(e) =>
                    setIntForm({ ...intForm, notifyOnAssignment: e.target.checked })
                  }
                />
                <span>Asset Handover Receipts</span>
              </label>
              <label className="flex items-center gap-2.5 p-3 border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={intForm.notifyOnReturn}
                  onChange={(e) => setIntForm({ ...intForm, notifyOnReturn: e.target.checked })}
                />
                <span>Asset Return Confirmations</span>
              </label>
              <label className="flex items-center gap-2.5 p-3 border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={intForm.notifyOnWarrantyExpiry}
                  onChange={(e) =>
                    setIntForm({ ...intForm, notifyOnWarrantyExpiry: e.target.checked })
                  }
                />
                <span>Warranty Expiry (≤ 30d)</span>
              </label>
              <label className="flex items-center gap-2.5 p-3 border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={intForm.notifyOnOffboarding}
                  onChange={(e) =>
                    setIntForm({ ...intForm, notifyOnOffboarding: e.target.checked })
                  }
                />
                <span>Exit Clearance Alerts</span>
              </label>
            </div>
          </div>

          {intForm.smtpLastTestStatus && (
            <div className="flex items-center gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                Last SMTP Check ({intForm.smtpLastTestedAt?.replace('T', ' ').slice(0, 19)} UTC):{' '}
                {intForm.smtpLastTestStatus}
              </span>
            </div>
          )}
        </form>
      )}

      {/* TAB 3: LDAP / ACTIVE DIRECTORY */}
      {activeSubTab === 'ldap' && canManageSettings && (
        <form
          onSubmit={handleSaveLdap}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                LDAP / Active Directory Integration
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure Dextra&apos;s enterprise directory server, bind credentials, user filters, and security group to RBAC role mappings.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={testingLdap}
                onClick={handleTestLdap}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {testingLdap ? 'Binding...' : 'Test LDAP Bind'}
              </button>
              <button
                type="submit"
                disabled={savingLdap}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingLdap ? 'Saving...' : 'Save LDAP'}
              </button>
            </div>
          </div>

          {ldapFeedback && (
            <div
              className={`p-3 text-xs rounded-lg border ${
                ldapFeedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {ldapFeedback.text}
            </div>
          )}

          <label className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-900">
                Enable LDAP / Active Directory Synchronization
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Connect Dextra directory groups and validate bind credentials over LDAPS or StartTLS.
              </div>
            </div>
            <input
              type="checkbox"
              checked={intForm.ldapEnabled}
              onChange={(e) => setIntForm({ ...intForm, ldapEnabled: e.target.checked })}
              className="rounded border-slate-300 text-blue-700 w-4 h-4"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="ldap-url" className="block text-xs font-medium text-slate-700 mb-1">
                LDAP Server URL
              </label>
              <input
                id="ldap-url"
                type="text"
                placeholder="ldaps://ldap.dextra.com"
                value={intForm.ldapServerUrl}
                onChange={(e) => setIntForm({ ...intForm, ldapServerUrl: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="ldap-port" className="block text-xs font-medium text-slate-700 mb-1">
                Port
              </label>
              <input
                id="ldap-port"
                type="number"
                min={1}
                max={65535}
                value={intForm.ldapPort}
                onChange={(e) =>
                  setIntForm({
                    ...intForm,
                    ldapPort: Number.parseInt(e.target.value || '636', 10) || 636,
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={intForm.ldapUseTls}
                  onChange={(e) => setIntForm({ ...intForm, ldapUseTls: e.target.checked })}
                />
                <span>Use LDAPS / TLS</span>
              </label>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="ldap-base-dn" className="block text-xs font-medium text-slate-700 mb-1">
                Base DN
              </label>
              <input
                id="ldap-base-dn"
                type="text"
                placeholder="dc=dextra,dc=com"
                value={intForm.ldapBaseDn}
                onChange={(e) => setIntForm({ ...intForm, ldapBaseDn: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="ldap-bind-dn" className="block text-xs font-medium text-slate-700 mb-1">
                Service Bind DN
              </label>
              <input
                id="ldap-bind-dn"
                type="text"
                placeholder="cn=svc-assetledger,ou=ServiceAccounts,dc=dextra,dc=com"
                value={intForm.ldapBindDn}
                onChange={(e) => setIntForm({ ...intForm, ldapBindDn: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="ldap-bind-pass"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Bind Password{' '}
                {intForm.ldapHasBindPassword && (
                  <span className="text-emerald-700 font-normal">(Stored securely)</span>
                )}
              </label>
              <input
                id="ldap-bind-pass"
                type="password"
                autoComplete="new-password"
                placeholder={
                  intForm.ldapHasBindPassword
                    ? '•••••••• (leave blank to keep)'
                    : 'Enter service account password'
                }
                value={ldapBindPasswordInput}
                onChange={(e) => setLdapBindPasswordInput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="ldap-user-filter"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                User Search Filter
              </label>
              <input
                id="ldap-user-filter"
                type="text"
                placeholder="(&(objectClass=person)(mail={email}))"
                value={intForm.ldapUserSearchFilter}
                onChange={(e) =>
                  setIntForm({ ...intForm, ldapUserSearchFilter: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="ldap-sync-hours"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Sync Interval (Hours)
              </label>
              <input
                id="ldap-sync-hours"
                type="number"
                min={1}
                max={168}
                value={intForm.ldapSyncIntervalHours}
                onChange={(e) =>
                  setIntForm({
                    ...intForm,
                    ldapSyncIntervalHours: Number.parseInt(e.target.value || '6', 10) || 6,
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Directory Group-to-Role Mappings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="ldap-admin-dn"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Super Admin Group DN
                </label>
                <input
                  id="ldap-admin-dn"
                  type="text"
                  value={intForm.ldapAdminGroupDn || ''}
                  onChange={(e) =>
                    setIntForm({ ...intForm, ldapAdminGroupDn: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="ldap-it-dn"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  IT Admin Group DN
                </label>
                <input
                  id="ldap-it-dn"
                  type="text"
                  value={intForm.ldapItGroupDn || ''}
                  onChange={(e) => setIntForm({ ...intForm, ldapItGroupDn: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="ldap-hr-dn"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  HR Admin Group DN
                </label>
                <input
                  id="ldap-hr-dn"
                  type="text"
                  value={intForm.ldapHrGroupDn || ''}
                  onChange={(e) => setIntForm({ ...intForm, ldapHrGroupDn: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {intForm.ldapLastTestStatus && (
            <div className="flex items-center gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                Last LDAP Check ({intForm.ldapLastTestedAt?.replace('T', ' ').slice(0, 19)} UTC):{' '}
                {intForm.ldapLastTestStatus}
              </span>
            </div>
          )}
        </form>
      )}

      {/* TAB 4: DIRECTORY, RBAC & AUDIT */}
      {activeSubTab === 'directory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-600" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Departments ({departments.length})
                </h2>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                {departments.map((d) => (
                  <div
                    key={d.id}
                    className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                  >
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
                <h2 className="text-sm font-semibold text-slate-900">
                  Office Locations ({locations.length})
                </h2>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                {locations.map((l) => (
                  <div
                    key={l.id}
                    className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                  >
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

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                Role-Based Access Control (RBAC) Matrix
              </h2>
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

          {auditLogs.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Audit Logs ({filteredLogs.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Append-only record of all system modifications.
                  </p>
                </div>
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Filter audit trail..."
                  aria-label="Filter audit logs"
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="px-5 py-2.5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-800 mr-2">
                        {log.action}
                      </span>
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
          )}
        </div>
      )}
    </div>
  );
};
