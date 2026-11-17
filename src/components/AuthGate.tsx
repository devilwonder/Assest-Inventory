import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useEams } from '../services/eamsStore';
import { isStandaloneBrowserWindow, mapFirebaseAuthError } from '../utils/authErrors';

type AuthPanelMode = 'signin' | 'register' | 'reset';

export const AuthGate: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithGoogleRedirect,
    signInWithOrgEmail,
    registerOrgAccount,
    sendOrgPasswordReset,
    resendVerificationEmail,
    refreshAuthVerification,
    logout,
    pendingVerificationEmail,
    authGateError,
    clearAuthGateError,
  } = useEams();

  const [panelMode, setPanelMode] = useState<AuthPanelMode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [statusNotice, setStatusNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const displayedError = localError || authGateError || '';

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : undefined;
  const standaloneWindow = isStandaloneBrowserWindow();

  const handleGoogleSignIn = async () => {
    setLocalError('');
    setStatusNotice('');
    clearAuthGateError();
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setLocalError(mapFirebaseAuthError(err, currentHost));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleRedirectSignIn = async () => {
    setLocalError('');
    setStatusNotice('');
    clearAuthGateError();
    setBusy(true);
    try {
      await signInWithGoogleRedirect();
    } catch (err) {
      setLocalError(mapFirebaseAuthError(err, currentHost));
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setStatusNotice('');
    clearAuthGateError();

    if (!email.trim() || !email.includes('@')) {
      setLocalError('Enter a valid corporate email address.');
      return;
    }

    setBusy(true);
    try {
      if (panelMode === 'signin') {
        if (!password) {
          setLocalError('Enter your password.');
          setBusy(false);
          return;
        }
        await signInWithOrgEmail(email, password);
      } else if (panelMode === 'register') {
        if (!fullName.trim()) {
          setLocalError('Enter your full name.');
          setBusy(false);
          return;
        }
        if (password.length < 6) {
          setLocalError('Password must be at least 6 characters.');
          setBusy(false);
          return;
        }
        await registerOrgAccount(email, password, fullName);
        setStatusNotice(`Verification link sent to ${email.trim()}.`);
      } else {
        await sendOrgPasswordReset(email);
        setStatusNotice(`Password reset email sent to ${email.trim()}. Check your inbox.`);
      }
    } catch (err) {
      setLocalError(mapFirebaseAuthError(err, currentHost));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-8 lg:p-10 bg-slate-900 text-white flex flex-col justify-between space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight leading-none">Dextra</div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
                  AssetLedger EAMS
                </div>
              </div>
            </div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight leading-tight text-balance">
              Dextra Employee Asset Management
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Centralized corporate hardware inventory, employee custody receipts, warranty
              tracking, repair workflows, exit clearance, and compliance reporting.
            </p>
          </div>

          <div className="space-y-3 pt-6 border-t border-slate-800 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span>Organization Tenant</span>
              <span className="font-mono text-white flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                Dextra Corporate
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Authentication</span>
              <span className="font-mono text-white">SSO &amp; Corporate Email</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Access Governance</span>
              <span className="font-mono text-white">Verified Identity · RBAC</span>
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-10 flex flex-col justify-center space-y-5">
          {pendingVerificationEmail ? (
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                <Mail className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-slate-900">
                  Verify your corporate email
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  We sent a verification link to{' '}
                  <span className="font-medium text-slate-900">{pendingVerificationEmail}</span>.
                  Open the link in your inbox, then click Continue below.
                </p>
              </div>

              {displayedError && (
                <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
                  {displayedError}
                </div>
              )}
              {statusNotice && (
                <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
                  {statusNotice}
                </div>
              )}

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setLocalError('');
                    try {
                      await refreshAuthVerification();
                    } catch (err) {
                      setLocalError(mapFirebaseAuthError(err, currentHost));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{busy ? 'Checking...' : "I've Verified — Continue"}</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await resendVerificationEmail();
                        setStatusNotice('Verification email resent.');
                      } catch (err) {
                        setLocalError(mapFirebaseAuthError(err, currentHost));
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Resend Email
                  </button>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="flex-1 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    Switch Account
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-slate-900">
                  Sign in to Dextra Workspace
                </h2>
                <p className="text-sm text-slate-500">
                  Authenticate with your corporate Google SSO or organization email credentials.
                </p>
              </div>

              {displayedError && (
                <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg leading-relaxed">
                  {displayedError}
                </div>
              )}

              {statusNotice && (
                <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg leading-relaxed">
                  {statusNotice}
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>{busy ? 'Connecting...' : 'Sign in with Corporate Google SSO'}</span>
                </button>
                {standaloneWindow && (
                  <button
                    type="button"
                    onClick={handleGoogleRedirectSignIn}
                    disabled={busy}
                    className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-800 py-1 disabled:opacity-50"
                  >
                    Popup blocked? Use Redirect SSO
                  </button>
                )}
              </div>

              <div className="relative flex items-center">
                <div className="flex-grow border-t border-slate-200" />
                <span className="mx-3 text-xs text-slate-400">or organization email</span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              <div className="flex border border-slate-200 rounded-lg p-0.5 bg-slate-50 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setPanelMode('signin');
                    setLocalError('');
                    setStatusNotice('');
                  }}
                  className={`flex-1 py-1.5 rounded-md transition-colors ${
                    panelMode === 'signin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Org Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPanelMode('register');
                    setLocalError('');
                    setStatusNotice('');
                  }}
                  className={`flex-1 py-1.5 rounded-md transition-colors ${
                    panelMode === 'register'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Activate Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPanelMode('reset');
                    setLocalError('');
                    setStatusNotice('');
                  }}
                  className={`flex-1 py-1.5 rounded-md transition-colors ${
                    panelMode === 'reset'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Reset Password
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-3">
                {panelMode === 'register' && (
                  <div>
                    <label
                      htmlFor="org-full-name"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Full Name
                    </label>
                    <input
                      id="org-full-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="org-email-input"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Corporate Email
                  </label>
                  <input
                    id="org-email-input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@dextra.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {panelMode !== 'reset' && (
                  <div>
                    <label
                      htmlFor="org-password-input"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Password
                    </label>
                    <input
                      id="org-password-input"
                      type="password"
                      autoComplete={
                        panelMode === 'register' ? 'new-password' : 'current-password'
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>
                    {busy
                      ? 'Please wait...'
                      : panelMode === 'signin'
                        ? 'Sign in with Organization Email'
                        : panelMode === 'register'
                          ? 'Activate Organization Account'
                          : 'Send Password Reset Link'}
                  </span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
