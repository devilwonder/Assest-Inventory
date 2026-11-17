import test from 'node:test';
import assert from 'node:assert/strict';
import { isPopupFallbackError, mapFirebaseAuthError } from './authErrors';

test('mapFirebaseAuthError surfaces actionable instructions for unauthorized-domain', () => {
  const msg = mapFirebaseAuthError(
    new Error('Firebase: Error (auth/unauthorized-domain).'),
    'assest-inventory.vercel.app'
  );
  assert.match(msg, /assest-inventory\.vercel\.app/);
  assert.match(msg, /Authorized domains/);
});

test('mapFirebaseAuthError handles popup-blocked and redirect fallback detection', () => {
  const err = new Error('Firebase: Error (auth/popup-blocked).');
  assert.equal(isPopupFallbackError(err), true);
  assert.equal(isPopupFallbackError(new Error('Firebase: Error (auth/popup-closed-by-user).')), false);
  const msg = mapFirebaseAuthError(err);
  assert.match(msg, /popup was blocked/i);
  assert.match(msg, /Redirect SSO/i);
});

test('mapFirebaseAuthError handles operation-not-allowed and credential errors', () => {
  assert.match(
    mapFirebaseAuthError(new Error('Firebase: Error (auth/operation-not-allowed).')),
    /Firebase Authentication Console/
  );
  assert.match(
    mapFirebaseAuthError(new Error('Firebase: Error (auth/invalid-credential).')),
    /Invalid corporate email or password/
  );
  assert.match(
    mapFirebaseAuthError(new Error('Missing or insufficient permissions.')),
    /Firestore permissions/
  );
});
