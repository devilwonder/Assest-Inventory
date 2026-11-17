export function isStandaloneBrowserWindow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

export function isPopupFallbackError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.includes('auth/popup-blocked');
}

export function mapFirebaseAuthError(err: unknown, currentHost?: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const hostLabel = currentHost?.trim() || 'this domain';

  if (raw.includes('auth/unauthorized-domain')) {
    return `Sign-in is blocked because "${hostLabel}" is not listed in Firebase Authorized Domains. Add "${hostLabel}" in Firebase Console → Authentication → Settings → Authorized domains, then retry.`;
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'Google sign-in popup was blocked by your browser. Allow popups for this site or use Google Redirect SSO below.';
  }
  if (raw.includes('auth/popup-closed-by-user') || raw.includes('auth/cancelled-popup-request')) {
    return 'Google sign-in window was closed before completing authentication. Retry or use Google Redirect SSO.';
  }
  if (raw.includes('auth/operation-not-allowed')) {
    return 'This sign-in provider is not yet enabled in Firebase Authentication Console. Use Corporate Google SSO or ask your administrator to enable Email/Password in Firebase Console.';
  }
  if (raw.includes('auth/account-exists-with-different-credential')) {
    return 'An account with this email already exists under a different sign-in provider. Use your original sign-in method.';
  }
  if (raw.includes('auth/network-request-failed')) {
    return 'Network request to Firebase Auth failed. Verify your internet connection and ensure ad/tracker blockers allow firebaseapp.com and googleapis.com.';
  }
  if (raw.includes('auth/too-many-requests')) {
    return 'Too many authentication attempts. Wait a moment and try again.';
  }
  if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password')) {
    return 'Invalid corporate email or password. Verify your credentials or reset your password.';
  }
  if (raw.includes('auth/user-not-found')) {
    return 'No account found for this email. Use "Activate Account" to register your corporate email.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'This corporate email is already registered. Switch to Org Sign In or reset your password.';
  }
  if (raw.includes('auth/weak-password')) {
    return 'Password must be at least 6 characters.';
  }
  if (raw.includes('Missing or insufficient permissions')) {
    return 'Authenticated successfully, but workspace profile initialization was denied by Firestore permissions. Contact your Dextra Super Admin.';
  }
  return raw;
}
