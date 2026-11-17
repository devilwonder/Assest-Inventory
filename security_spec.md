# Security Specification: AssetLedger EAMS

## 1. Data Invariants
1. **Default-Deny Safety Net**: All unspecified Firestore paths are denied by default (`match /{document=**} { allow read, write: if false; }`).
2. **Verified Identity**: All reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **No Self-Assigned Privileges**: A user creating `/users/{userId}` can only self-register as `'Employee'` unless they are the bootstrapped Super Admin (`pandeypratik4@gmail.com`) or an existing Super Admin updates their role.
4. **Immutable Historical Records**: `assetReturns` and `auditLogs` are append-only; updates and deletes are strictly forbidden (`allow update, delete: if false;`). Historical `assetAssignments` cannot be deleted (`allow delete: if false;`).
5. **Relational Integrity**: Asset assignments must reference existing `/assets/{assetId}` and `/employees/{employeeId}` documents and verify the asset is currently `'Available'` or `'Purchased'` (or updated atomically in the same transaction).
6. **PII & Employee Scoping**: Employees can only read their own employee profile, their own assignments, and their own requests; Admins (Super Admin, IT Admin, HR Admin) and Department Managers operate within their role boundaries.
7. **Strict Schema & Bounds**: Every string field enforces `.size() <= MAX` and ID fields enforce `^[a-zA-Z0-9_\\-]+$`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read**: `get(/assets/AST-1)` without `request.auth`.
2. **Unverified Email Write**: `create(/assetRequests/req-1)` with `email_verified: false`.
3. **Self-Privilege Escalation**: User creates `/users/{uid}` with `role: 'Super Admin'` when email is not bootstrapped admin.
4. **Shadow Field Injection**: User updates `/assetRequests/req-1` with extra ghost key `isVerified: true`.
5. **ID Poisoning**: Creating `/assets/<200-char-invalid-id!@#>` violating `isValidId()`.
6. **Impersonated Request**: Creating `/assetRequests/req-2` where `requesterUid != request.auth.uid`.
7. **State Shortcutting**: Employee updates `/assetRequests/req-1` directly from `'Requested'` to `'Assigned'`.
8. **Deleting Audit Trail**: Super Admin or IT Admin attempting `delete(/auditLogs/log-1)`.
9. **Deleting Historical Assignment**: Attempting `delete(/assetAssignments/asg-1)`.
10. **Mutating Return Record**: Attempting `update(/assetReturns/ret-1)` to alter damage remarks.
11. **Oversized String DoS**: Creating `/assets/AST-9` with `notes` > 1000 chars.
12. **Blanket List Scraping by Employee**: Employee running `list(/employees)` or `list(/auditLogs)` without ownership scoping.
