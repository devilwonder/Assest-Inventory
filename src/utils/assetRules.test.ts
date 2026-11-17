import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignAsset,
  canCompleteOffboarding,
  canTransitionRequest,
  computeDashboardMetrics,
  computeDepreciationValue,
  computeWarrantyAlerts,
  generateNextAssetCode,
  hasPermission,
  validateAssetUniqueness,
} from './assetRules';
import type { Asset, AssetAssignment, Employee, MaintenanceRecord } from '../types/eams';

const sampleAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'ast-1',
  assetCode: 'AST-2026-0001',
  name: 'MacBook Pro 16',
  category: 'Laptop',
  brand: 'Apple',
  model: 'M3 Max',
  serialNumber: 'SN-1001',
  purchaseDate: '2025-11-17',
  purchaseCost: 3000,
  location: 'San Francisco HQ',
  condition: 'Good',
  status: 'Available',
  ...overrides,
});

test('generateNextAssetCode increments sequence cleanly', () => {
  const assets = [
    sampleAsset({ id: '1', assetCode: 'AST-2026-0001' }),
    sampleAsset({ id: '2', assetCode: 'AST-2026-0014' }),
  ];
  assert.equal(generateNextAssetCode(assets, 2026), 'AST-2026-0015');
  assert.equal(generateNextAssetCode([], 2026), 'AST-2026-0001');
});

test('validateAssetUniqueness blocks duplicate asset codes and serial numbers', () => {
  const existing = [sampleAsset({ id: 'a1', assetCode: 'AST-2026-0001', serialNumber: 'SN-ABC' })];
  assert.equal(
    validateAssetUniqueness({ assetCode: 'AST-2026-0001', serialNumber: 'SN-NEW' }, existing).valid,
    false
  );
  assert.equal(
    validateAssetUniqueness({ assetCode: 'AST-2026-0002', serialNumber: 'sn-abc' }, existing).valid,
    false
  );
  assert.equal(
    validateAssetUniqueness({ assetCode: 'AST-2026-0001', serialNumber: 'SN-ABC' }, existing, 'a1').valid,
    true
  );
});

test('canAssignAsset forbids double assignment and maintenance assets', () => {
  assert.equal(canAssignAsset(sampleAsset({ status: 'Available' })).ok, true);
  assert.equal(canAssignAsset(sampleAsset({ status: 'Assigned', assignedEmployeeId: 'emp-1' })).ok, false);
  assert.equal(canAssignAsset(sampleAsset({ status: 'Under Maintenance' })).ok, false);
});

test('canCompleteOffboarding requires zero active assignments', () => {
  const assignments: AssetAssignment[] = [
    {
      id: 'asg-1',
      assetId: 'ast-1',
      assetCode: 'AST-2026-0001',
      assetName: 'Laptop',
      employeeId: 'emp-9',
      employeeName: 'Alex',
      issueDate: '2026-01-10',
      conditionAtIssue: 'Good',
      receiptNumber: 'HRC-2026-0001',
      status: 'Active',
      issuedByUid: 'admin-1',
    },
  ];
  assert.deepEqual(canCompleteOffboarding('emp-9', assignments), { allowed: false, pendingCount: 1 });
  assignments[0].status = 'Returned';
  assert.deepEqual(canCompleteOffboarding('emp-9', assignments), { allowed: true, pendingCount: 0 });
});

test('computeWarrantyAlerts flags expiring <=30d, expired, pending repairs, and overdue returns', () => {
  const assets = [
    sampleAsset({ id: 'a1', warrantyExpiryDate: '2026-12-01' }),
    sampleAsset({ id: 'a2', warrantyExpiryDate: '2026-10-01' }),
    sampleAsset({ id: 'a3', warrantyExpiryDate: '2027-06-01' }),
  ];
  const assignments: AssetAssignment[] = [
    {
      id: 'asg-1',
      assetId: 'a3',
      assetCode: 'AST-2026-0003',
      assetName: 'Monitor',
      employeeId: 'emp-1',
      employeeName: 'Sam',
      issueDate: '2026-09-01',
      expectedReturnDate: '2026-11-10',
      conditionAtIssue: 'Good',
      receiptNumber: 'HRC-2026-0001',
      status: 'Active',
      issuedByUid: 'u1',
    },
  ];
  const repairs: MaintenanceRecord[] = [
    {
      id: 'm1',
      assetId: 'a2',
      issueDescription: 'Fan noise',
      reportedDate: '2026-11-12',
      repairStatus: 'In Progress',
    },
  ];
  const alerts = computeWarrantyAlerts(assets, assignments, repairs, '2026-11-17');
  assert.equal(alerts.expiringSoon.length, 1);
  assert.equal(alerts.expired.length, 1);
  assert.equal(alerts.pendingRepairs.length, 1);
  assert.equal(alerts.overdueReturns.length, 1);
});

test('request workflow enforces sequential role approvals', () => {
  assert.equal(canTransitionRequest('Employee', 'Requested', 'Manager Approved'), false);
  assert.equal(canTransitionRequest('Department Manager', 'Requested', 'Manager Approved'), true);
  assert.equal(canTransitionRequest('Department Manager', 'Requested', 'IT Approved'), false);
  assert.equal(canTransitionRequest('IT Admin', 'Manager Approved', 'IT Approved'), true);
  assert.equal(canTransitionRequest('IT Admin', 'IT Approved', 'Assigned'), true);
  assert.equal(canTransitionRequest('Super Admin', 'Assigned', 'Rejected'), false);
});

test('RBAC permission matrix restricts Employee and HR vs IT', () => {
  assert.equal(hasPermission('Employee', 'manage_inventory'), false);
  assert.equal(hasPermission('Employee', 'create_request'), true);
  assert.equal(hasPermission('HR Admin', 'manage_offboarding'), true);
  assert.equal(hasPermission('HR Admin', 'manage_inventory'), false);
  assert.equal(hasPermission('IT Admin', 'assign_return_asset'), true);
});

test('computeDepreciationValue computes 12-month straight-line depreciation on 3-year life', () => {
  const res = computeDepreciationValue(3600, '2025-11-17', '2026-11-17', 3);
  assert.equal(res.ageMonths, 12);
  assert.equal(res.accumulatedDepreciation, 1200);
  assert.equal(res.currentValue, 2400);
});

test('computeDashboardMetrics aggregates counts and purchase value', () => {
  const assets = [
    sampleAsset({ id: '1', status: 'Available', purchaseCost: 2000 }),
    sampleAsset({ id: '2', status: 'Assigned', assignedEmployeeId: 'e1', purchaseCost: 1500 }),
    sampleAsset({ id: '3', status: 'Lost', purchaseCost: 500 }),
  ];
  const employees: Employee[] = [
    {
      id: 'e1',
      employeeCode: 'EMP-1001',
      fullName: 'Jane Doe',
      email: 'jane@corp.io',
      department: 'Engineering',
      designation: 'Engineer',
      joiningDate: '2024-01-01',
      employmentStatus: 'Active',
      location: 'San Francisco HQ',
    },
  ];
  const metrics = computeDashboardMetrics(assets, employees, [], [], '2026-11-17');
  assert.equal(metrics.totalAssets, 3);
  assert.equal(metrics.availableAssets, 1);
  assert.equal(metrics.assignedAssets, 1);
  assert.equal(metrics.lostAssets, 1);
  assert.equal(metrics.totalPurchaseValue, 4000);
});
