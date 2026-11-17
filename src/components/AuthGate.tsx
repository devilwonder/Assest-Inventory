import React, { useState } from 'react';
import { ArrowRight, Lock, ShieldCheck } from 'lucide-react';
import { useEams } from '../services/eamsStore';
import { USER_ROLES, type UserRole } from '../types/eams';

export const AuthGate: React.FC = () => {
  const { signInWithGoogle, enterDemoMode } = useEams();
  const [selectedRole, setSelectedRole] = useState<UserRole>('Super Admin');
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Google sign-in popup was closed or blocked. You can also explore via Demo Workspace.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-8 lg:p-10 bg-slate-900 text-white flex flex-col justify-between space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">AssetLedger</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight leading-tight text-balance">
              Enterprise Employee Asset Management
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Centralize physical hardware inventory, employee allocation receipts, warranty alerts,
              maintenance logs, offboarding clearances, and compliance exports in one auditable ledger.
            </p>
          </div>

          <div className="space-y-3 pt-6 border-t border-slate-800 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span>Seeded Organization Data</span>
              <span className="font-mono tabular-nums text-white">30 Employees · 50 Assets</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Lifecycle Governance</span>
              <span className="font-mono text-white">Transactional & Audited</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Role-Based Access</span>
              <span className="font-mono text-white">5 Enterprise Roles</span>
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-10 flex flex-col justify-center space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold text-slate-900">Sign in to workspace</h2>
            <p className="text-sm text-slate-500">
              Authenticate with your corporate Google account for live Cloud Firestore sync, or launch
              the pre-seeded sandbox.
            </p>
          </div>

          {authError && (
            <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <Lock className="w-4 h-4" />
            <span>{busy ? 'Connecting...' : 'Sign in with Google'}</span>
          </button>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200" />
            <span className="mx-3 text-xs text-slate-400">or evaluate immediately</span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="sandbox-role-select" className="text-xs font-medium text-slate-700">
                Demo Persona Role
              </label>
              <select
                id="sandbox-role-select"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                className="text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => enterDemoMode(selectedRole)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors"
            >
              <span>Launch Demo Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
