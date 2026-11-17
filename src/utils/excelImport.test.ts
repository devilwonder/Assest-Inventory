import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  buildAssetScanUrl,
  generateAssetQrCodeDataUrl,
  parseAssetCodeFromSearch,
} from './assetQr';
import {
  buildAssetTemplateWorkbook,
  buildEmployeeTemplateWorkbook,
  parseAndValidateAssetRows,
  parseAndValidateEmployeeRows,
} from './excelImport';
import type { Asset, Employee } from '../types/eams';

const existingAsset: Asset = {
  id: 'ast-1',
  assetCode: 'AST-2026-0050',
  name: 'Existing MacBook',
  category: 'Laptop',
  brand: 'Apple',
  model: 'M3 Pro',
  serialNumber: 'SN-EXIST-01',
  purchaseDate: '2026-01-10',
  purchaseCost: 2499,
  location: 'San Francisco HQ',
  condition: 'Good',
  status: 'Available',
};

const existingEmployee: Employee = {
  id: 'emp-1',
  employeeCode: 'EMP-1030',
  fullName: 'Daniel Chen',
  email: 'daniel.chen@assetledger.io',
  department: 'IT & Security',
  designation: 'IT Director',
  joiningDate: '2023-05-01',
  employmentStatus: 'Active',
  location: 'San Francisco HQ',
};

test('buildAssetScanUrl and parseAssetCodeFromSearch round-trip cleanly', () => {
  const url = buildAssetScanUrl('AST-2026-0042', 'https://assets.example.com');
  assert.equal(url, 'https://assets.example.com/?asset=AST-2026-0042');
  const query = url.slice(url.indexOf('?'));
  assert.equal(parseAssetCodeFromSearch(query), 'AST-2026-0042');
  assert.equal(parseAssetCodeFromSearch('?autostart=1'), null);
});

test('generateAssetQrCodeDataUrl produces unique QR PNG data URLs per asset', async () => {
  const qr1 = await generateAssetQrCodeDataUrl(
    { assetCode: 'AST-2026-0001' },
    { origin: 'https://assets.example.com' }
  );
  const qr2 = await generateAssetQrCodeDataUrl(
    { assetCode: 'AST-2026-0002' },
    { origin: 'https://assets.example.com' }
  );
  assert.ok(qr1.dataUrl.startsWith('data:image/png;base64,'));
  assert.ok(qr2.dataUrl.startsWith('data:image/png;base64,'));
  assert.notEqual(qr1.dataUrl, qr2.dataUrl);
  assert.equal(qr1.scanUrl, 'https://assets.example.com/?asset=AST-2026-0001');
});

test('buildAssetTemplateWorkbook includes Assets and Reference Values sheets with round-trippable headers', () => {
  const wb = buildAssetTemplateWorkbook(['San Francisco HQ', 'New York Hub']);
  assert.deepEqual(wb.SheetNames, ['Assets', 'Reference Values']);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Assets'], { defval: '' });
  assert.equal(rows.length, 2);
  const parsed = parseAndValidateAssetRows(rows, [existingAsset]);
  assert.equal(parsed.validCount, 2);
  assert.equal(parsed.errorCount, 0);
  assert.equal(parsed.validItems[0].assetCode, 'AST-2026-0051');
  assert.equal(parsed.validItems[1].assetCode, 'AST-2026-0052');
});

test('parseAndValidateAssetRows handles Excel serial dates, duplicates, and validation errors', () => {
  const parsed = parseAndValidateAssetRows(
    [
      {
        'Asset ID': '',
        'Asset Name *': 'Dell Monitor 27',
        'Category *': 'Monitor',
        'Brand *': 'Dell',
        'Model *': 'U2723QE',
        'Serial Number *': 'SN-NEW-900',
        'Purchase Date (YYYY-MM-DD)': 46343, // Excel serial date
        'Purchase Cost ($) *': '$649.50',
        'Location *': 'New York Hub',
      },
      {
        'Asset ID': 'AST-2026-0050', // duplicate ID
        'Asset Name *': 'Dup ID Laptop',
        'Category *': 'Laptop',
        'Brand *': 'Apple',
        'Model *': 'M4',
        'Serial Number *': 'SN-EXIST-01', // duplicate serial
        'Purchase Cost ($) *': -10, // invalid negative cost
      },
      {
        'Asset ID': '',
        'Asset Name *': 'Intra-batch Dup Serial',
        'Category *': 'Keyboard',
        'Brand *': 'Keychron',
        'Model *': 'Q1',
        'Serial Number *': 'sn-new-900', // duplicates row 1 within same upload
        'Purchase Cost ($) *': 199,
      },
    ],
    [existingAsset]
  );

  assert.equal(parsed.validCount, 1);
  assert.equal(parsed.errorCount, 2);
  assert.equal(parsed.validItems[0].assetCode, 'AST-2026-0051');
  assert.equal(parsed.validItems[0].purchaseCost, 649.5);
  assert.match(parsed.validItems[0].purchaseDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(parsed.rows[1].errors.some((e) => e.includes('Duplicate Asset ID')));
  assert.ok(parsed.rows[1].errors.some((e) => e.includes('Duplicate Serial Number')));
  assert.ok(parsed.rows[2].errors.some((e) => e.includes('Duplicate Serial Number')));
});

test('buildEmployeeTemplateWorkbook and parseAndValidateEmployeeRows validate and auto-code cleanly', () => {
  const wb = buildEmployeeTemplateWorkbook(['Engineering', 'Human Resources'], ['San Francisco HQ']);
  assert.deepEqual(wb.SheetNames, ['Employees', 'Reference Values']);
  const templateRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Employees'], {
    defval: '',
  });
  const parsed = parseAndValidateEmployeeRows(
    [
      ...templateRows,
      {
        'Full Name *': 'Duplicate Email Person',
        'Email *': 'daniel.chen@assetledger.io',
        'Designation *': 'Analyst',
      },
    ],
    [existingEmployee]
  );
  assert.equal(parsed.validCount, 1);
  assert.equal(parsed.errorCount, 1);
  assert.equal(parsed.validItems[0].employeeCode, 'EMP-1031');
  assert.ok(parsed.rows[1].errors.some((e) => e.includes('Duplicate Email')));
});
