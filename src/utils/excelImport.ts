import * as XLSX from 'xlsx';
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  EMPLOYMENT_STATUSES,
  type Asset,
  type AssetCategory,
  type AssetCondition,
  type AssetStatus,
  type Employee,
  type EmploymentStatus,
} from '../types/eams';
import { generateNextAssetCode, generateNextEmployeeCode } from './assetRules';

export interface ParsedImportRow<T> {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  data?: T;
  previewLabel: string;
  previewSublabel: string;
}

export interface ImportParseResult<T> {
  rows: Array<ParsedImportRow<T>>;
  validItems: T[];
  validCount: number;
  errorCount: number;
}

function normalizeHeaderKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeRowKeys(row: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normalizeHeaderKey(k), v);
  }
  return map;
}

function pickField(map: Map<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const val = map.get(normalizeHeaderKey(alias));
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function parseExcelDate(raw: unknown, fallback = ''): string {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial date (1900 epoch with leap-year offset)
    const utcDays = Math.floor(raw - 25569);
    const ms = utcDays * 86_400_000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return str.slice(0, 30);
}

function matchEnum<T extends string>(raw: string, allowed: readonly T[], fallback?: T): T | null {
  if (!raw) return fallback ?? null;
  const clean = raw.trim().toLowerCase();
  const exact = allowed.find((item) => item.toLowerCase() === clean);
  if (exact) return exact;
  // Soft match ignoring punctuation/spaces
  const compact = clean.replace(/[^a-z0-9]/g, '');
  const soft = allowed.find((item) => item.toLowerCase().replace(/[^a-z0-9]/g, '') === compact);
  return soft ?? null;
}

function clampStr(val: string, maxLen: number): string {
  return val.trim().slice(0, maxLen);
}

export interface CsvColumnMappingSpec {
  field: string;
  csvHeader: string;
  required: boolean;
  aliases: string[];
  notes: string;
}

export const ASSET_CSV_COLUMN_MAPPINGS: CsvColumnMappingSpec[] = [
  {
    field: 'assetCode',
    csvHeader: 'Asset ID',
    required: false,
    aliases: ['Asset ID', 'Asset Code', 'Asset Tag', 'Tag', 'assetCode', 'ID'],
    notes: 'Leave blank to auto-generate AST-2026-NNNN',
  },
  {
    field: 'name',
    csvHeader: 'Asset Name *',
    required: true,
    aliases: ['Asset Name', 'Name', 'Device Name', 'Equipment Name', 'Title', 'assetName'],
    notes: 'Descriptive device title (max 160 chars)',
  },
  {
    field: 'category',
    csvHeader: 'Category *',
    required: true,
    aliases: ['Category', 'Asset Category', 'Type', 'Device Type', 'Hardware Type'],
    notes: 'Laptop, Desktop, Monitor, Mobile Phone, etc.',
  },
  {
    field: 'brand',
    csvHeader: 'Brand *',
    required: true,
    aliases: ['Brand', 'Manufacturer', 'Make', 'OEM'],
    notes: 'Apple, Dell, Lenovo, Cisco, etc.',
  },
  {
    field: 'model',
    csvHeader: 'Model *',
    required: true,
    aliases: ['Model', 'Model Number', 'Model Name'],
    notes: 'Exact hardware model identifier',
  },
  {
    field: 'serialNumber',
    csvHeader: 'Serial Number *',
    required: true,
    aliases: ['Serial Number', 'Serial #', 'Serial No', 'Serial', 'S/N', 'SN', 'serialNumber'],
    notes: 'Must be unique across inventory (min 2 chars)',
  },
  {
    field: 'imei',
    csvHeader: 'IMEI',
    required: false,
    aliases: ['IMEI', 'IMEI Number'],
    notes: 'Optional for phones and cellular tablets',
  },
  {
    field: 'purchaseDate',
    csvHeader: 'Purchase Date (YYYY-MM-DD)',
    required: false,
    aliases: ['Purchase Date', 'Acquired Date', 'Bought Date', 'Date Purchased'],
    notes: 'YYYY-MM-DD (defaults to today if blank)',
  },
  {
    field: 'purchaseCost',
    csvHeader: 'Purchase Cost ($) *',
    required: true,
    aliases: ['Purchase Cost ($)', 'Purchase Cost', 'Cost', 'Purchase Price', 'Price', 'Value', 'purchaseCost'],
    notes: 'Numeric cost >= 0 ($ and commas stripped)',
  },
  {
    field: 'vendorName',
    csvHeader: 'Vendor Name',
    required: false,
    aliases: ['Vendor Name', 'Vendor', 'Supplier'],
    notes: 'Reseller or procurement vendor',
  },
  {
    field: 'warrantyStartDate',
    csvHeader: 'Warranty Start (YYYY-MM-DD)',
    required: false,
    aliases: ['Warranty Start', 'Warranty Start Date'],
    notes: 'Optional YYYY-MM-DD',
  },
  {
    field: 'warrantyExpiryDate',
    csvHeader: 'Warranty Expiry (YYYY-MM-DD)',
    required: false,
    aliases: ['Warranty Expiry', 'Warranty Expiry Date', 'Warranty End', 'Warranty End Date'],
    notes: 'Used for 30-day warranty expiration alerts',
  },
  {
    field: 'invoiceNumber',
    csvHeader: 'Invoice Number',
    required: false,
    aliases: ['Invoice Number', 'Invoice', 'Invoice #', 'PO Number'],
    notes: 'Procurement invoice or PO reference',
  },
  {
    field: 'location',
    csvHeader: 'Location *',
    required: true,
    aliases: ['Location', 'Current Location', 'Office Location', 'Office', 'Site'],
    notes: 'Defaults to primary office if omitted',
  },
  {
    field: 'condition',
    csvHeader: 'Condition',
    required: false,
    aliases: ['Condition', 'Asset Condition'],
    notes: 'New, Good, Fair, Poor, or Damaged (defaults to New)',
  },
  {
    field: 'status',
    csvHeader: 'Status',
    required: false,
    aliases: ['Status', 'Asset Status', 'Lifecycle Status'],
    notes: 'Available, Purchased, Under Maintenance, etc.',
  },
  {
    field: 'notes',
    csvHeader: 'Notes',
    required: false,
    aliases: ['Notes', 'Remarks', 'Comments', 'Description'],
    notes: 'Optional freeform notes (max 1000 chars)',
  },
];

export const ASSET_TEMPLATE_HEADERS = [
  'Asset ID',
  'Asset Name *',
  'Category *',
  'Brand *',
  'Model *',
  'Serial Number *',
  'IMEI',
  'Purchase Date (YYYY-MM-DD)',
  'Purchase Cost ($) *',
  'Vendor Name',
  'Warranty Start (YYYY-MM-DD)',
  'Warranty Expiry (YYYY-MM-DD)',
  'Invoice Number',
  'Location *',
  'Condition',
  'Status',
  'Notes',
] as const;

export function buildAssetTemplateWorkbook(locations: string[]): XLSX.WorkBook {
  const defaultLoc = locations[0] || 'San Francisco HQ';
  const secondLoc = locations[1] || defaultLoc;
  const sampleRows = [
    {
      'Asset ID': '',
      'Asset Name *': 'MacBook Pro 14" M4 Pro',
      'Category *': 'Laptop',
      'Brand *': 'Apple',
      'Model *': 'MacBook Pro 14 M4 Pro',
      'Serial Number *': 'SN-APP-NEW-001',
      IMEI: '',
      'Purchase Date (YYYY-MM-DD)': '2026-11-17',
      'Purchase Cost ($) *': 2399,
      'Vendor Name': 'CDW Enterprise',
      'Warranty Start (YYYY-MM-DD)': '2026-11-17',
      'Warranty Expiry (YYYY-MM-DD)': '2029-11-17',
      'Invoice Number': 'INV-2026-8801',
      'Location *': defaultLoc,
      Condition: 'New',
      Status: 'Available',
      Notes: 'Leave Asset ID blank to auto-generate AST-2026-NNNN',
    },
    {
      'Asset ID': '',
      'Asset Name *': 'Dell UltraSharp 27" 4K',
      'Category *': 'Monitor',
      'Brand *': 'Dell',
      'Model *': 'U2723QE',
      'Serial Number *': 'SN-DEL-NEW-002',
      IMEI: '',
      'Purchase Date (YYYY-MM-DD)': '2026-11-17',
      'Purchase Cost ($) *': 649,
      'Vendor Name': 'Dell Business Direct',
      'Warranty Start (YYYY-MM-DD)': '2026-11-17',
      'Warranty Expiry (YYYY-MM-DD)': '2029-11-17',
      'Invoice Number': 'INV-2026-8802',
      'Location *': secondLoc,
      Condition: 'New',
      Status: 'Available',
      Notes: 'Example monitor row — edit or replace before uploading',
    },
  ];

  const wb = XLSX.utils.book_new();
  const assetSheet = XLSX.utils.json_to_sheet(sampleRows, {
    header: [...ASSET_TEMPLATE_HEADERS],
  });
  assetSheet['!cols'] = ASSET_TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 18) }));
  XLSX.utils.book_append_sheet(wb, assetSheet, 'Assets');

  const maxLen = Math.max(
    ASSET_CATEGORIES.length,
    ASSET_CONDITIONS.length,
    ASSET_STATUSES.length,
    locations.length
  );
  const refRows = Array.from({ length: maxLen }, (_, idx) => ({
    'Valid Categories': ASSET_CATEGORIES[idx] || '',
    'Valid Conditions': ASSET_CONDITIONS[idx] || '',
    'Valid Statuses': ASSET_STATUSES[idx] || '',
    'Configured Locations': locations[idx] || '',
  }));
  const refSheet = XLSX.utils.json_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 22 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, refSheet, 'Reference Values');

  return wb;
}

export function downloadAssetImportTemplate(locations: string[]): void {
  const wb = buildAssetTemplateWorkbook(locations);
  XLSX.writeFile(wb, 'assetledger-assets-import-template.xlsx');
}

export function buildAssetCsvTemplate(locations: string[]): string {
  const wb = buildAssetTemplateWorkbook(locations);
  const sheet = wb.Sheets['Assets'];
  return XLSX.utils.sheet_to_csv(sheet);
}

export function downloadAssetCsvTemplate(locations: string[]): void {
  const csv = buildAssetCsvTemplate(locations);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dextra-assets-import-template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const EMPLOYEE_TEMPLATE_HEADERS = [
  'Employee ID',
  'Full Name *',
  'Email *',
  'Phone',
  'Department *',
  'Designation *',
  'Reporting Manager',
  'Joining Date (YYYY-MM-DD) *',
  'Employment Status',
  'Location *',
] as const;

export function buildEmployeeTemplateWorkbook(
  departments: string[],
  locations: string[]
): XLSX.WorkBook {
  const defaultDept = departments[0] || 'Engineering';
  const defaultLoc = locations[0] || 'San Francisco HQ';
  const sampleRows = [
    {
      'Employee ID': '',
      'Full Name *': 'Jordan Blake',
      'Email *': 'jordan.blake@assetledger.io',
      Phone: '+1 (415) 555-0194',
      'Department *': defaultDept,
      'Designation *': 'Senior Platform Engineer',
      'Reporting Manager': 'Marcus Vance',
      'Joining Date (YYYY-MM-DD) *': '2026-11-17',
      'Employment Status': 'Active',
      'Location *': defaultLoc,
    },
  ];

  const wb = XLSX.utils.book_new();
  const empSheet = XLSX.utils.json_to_sheet(sampleRows, {
    header: [...EMPLOYEE_TEMPLATE_HEADERS],
  });
  empSheet['!cols'] = EMPLOYEE_TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 20) }));
  XLSX.utils.book_append_sheet(wb, empSheet, 'Employees');

  const maxLen = Math.max(departments.length, locations.length, EMPLOYMENT_STATUSES.length);
  const refRows = Array.from({ length: maxLen }, (_, idx) => ({
    'Configured Departments': departments[idx] || '',
    'Configured Locations': locations[idx] || '',
    'Employment Statuses': EMPLOYMENT_STATUSES[idx] || '',
  }));
  const refSheet = XLSX.utils.json_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, refSheet, 'Reference Values');

  return wb;
}

export function downloadEmployeeImportTemplate(departments: string[], locations: string[]): void {
  const wb = buildEmployeeTemplateWorkbook(departments, locations);
  XLSX.writeFile(wb, 'assetledger-employees-import-template.xlsx');
}

export function parseCsvTextRows(csvText: string): {
  rows: Array<Record<string, unknown>>;
  headers: string[];
} {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const workbook = XLSX.read(cleanText, { type: 'string', raw: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { rows: [], headers: [] };
  }
  const sheet = workbook.Sheets[firstSheetName];
  const headerMatrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
  const headers = (headerMatrix[0] || []).map((h) => String(h).trim()).filter(Boolean);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  return { rows, headers };
}

export async function readSpreadsheetFileWithHeaders(file: File): Promise<{
  rows: Array<Record<string, unknown>>;
  headers: string[];
}> {
  if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text();
    const parsed = parseCsvTextRows(text);
    if (parsed.headers.length === 0 && parsed.rows.length === 0) {
      throw new Error('The uploaded CSV file appears to be empty.');
    }
    return parsed;
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The uploaded spreadsheet does not contain any worksheets.');
  }
  const sheet = workbook.Sheets[firstSheetName];
  const headerMatrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
  const headers = (headerMatrix[0] || []).map((h) => String(h).trim()).filter(Boolean);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return { rows, headers };
}

export async function readExcelFileRows(file: File): Promise<Array<Record<string, unknown>>> {
  const { rows } = await readSpreadsheetFileWithHeaders(file);
  return rows;
}

export function matchPredefinedAssetHeaders(headers: string[]): Array<{
  uploadedHeader: string;
  mappedField: string | null;
  targetLabel: string | null;
}> {
  return headers.map((uploadedHeader) => {
    const norm = normalizeHeaderKey(uploadedHeader);
    const match = ASSET_CSV_COLUMN_MAPPINGS.find((spec) =>
      spec.aliases.some((alias) => normalizeHeaderKey(alias) === norm)
    );
    return {
      uploadedHeader,
      mappedField: match ? match.field : null,
      targetLabel: match ? match.csvHeader : null,
    };
  });
}

export function parseAndValidateAssetRows(
  rawRows: Array<Record<string, unknown>>,
  existingAssets: Asset[],
  defaultLocation = 'San Francisco HQ',
  todayIso = '2026-11-17'
): ImportParseResult<Omit<Asset, 'id'>> {
  const existingCodes = new Set(existingAssets.map((a) => a.assetCode.trim().toUpperCase()));
  const existingSerials = new Set(existingAssets.map((a) => a.serialNumber.trim().toUpperCase()));
  const seenBatchCodes = new Set<string>();
  const seenBatchSerials = new Set<string>();
  const runningAssets: Asset[] = [...existingAssets];

  const parsedRows: Array<ParsedImportRow<Omit<Asset, 'id'>>> = [];
  const validItems: Array<Omit<Asset, 'id'>> = [];

  rawRows.forEach((raw, idx) => {
    const rowNumber = idx + 2; // Row 1 is header
    const map = normalizeRowKeys(raw);

    const rawCode = pickField(map, ['Asset ID', 'Asset Code', 'Asset Tag', 'Tag', 'assetCode', 'ID']);
    const name = clampStr(
      pickField(map, ['Asset Name', 'Name', 'Device Name', 'Equipment Name', 'Title', 'assetName']),
      160
    );
    const rawCat = pickField(map, ['Category', 'Asset Category', 'Type', 'Device Type', 'Hardware Type']);
    const brand = clampStr(pickField(map, ['Brand', 'Manufacturer', 'Make', 'OEM']), 80);
    const model = clampStr(pickField(map, ['Model', 'Model Number', 'Model Name']), 100);
    const serialNumber = clampStr(
      pickField(map, ['Serial Number', 'Serial #', 'Serial No', 'Serial', 'S/N', 'SN', 'serialNumber']),
      100
    );
    const imei = clampStr(pickField(map, ['IMEI', 'IMEI Number']), 40);
    const purchaseDateRaw =
      map.get(normalizeHeaderKey('Purchase Date')) ??
      pickField(map, ['Purchase Date', 'Acquired Date', 'Bought Date', 'Date Purchased']);
    const purchaseDate = clampStr(parseExcelDate(purchaseDateRaw, todayIso), 30);
    const costRaw = pickField(map, [
      'Purchase Cost ($)',
      'Purchase Cost',
      'Cost',
      'Purchase Price',
      'Price',
      'Value',
      'purchaseCost',
    ]);
    const vendorName = clampStr(pickField(map, ['Vendor Name', 'Vendor', 'Supplier']), 120);
    const warrantyStartRaw =
      map.get(normalizeHeaderKey('Warranty Start')) ??
      map.get(normalizeHeaderKey('Warranty Start Date')) ??
      pickField(map, ['Warranty Start', 'Warranty Start Date']);
    const warrantyExpiryRaw =
      map.get(normalizeHeaderKey('Warranty Expiry')) ??
      map.get(normalizeHeaderKey('Warranty Expiry Date')) ??
      pickField(map, ['Warranty Expiry', 'Warranty Expiry Date', 'Warranty End', 'Warranty End Date']);
    const warrantyStartDate = clampStr(parseExcelDate(warrantyStartRaw, ''), 30);
    const warrantyExpiryDate = clampStr(parseExcelDate(warrantyExpiryRaw, ''), 30);
    const invoiceNumber = clampStr(pickField(map, ['Invoice Number', 'Invoice', 'Invoice #', 'PO Number']), 80);
    const location = clampStr(
      pickField(map, ['Location', 'Current Location', 'Office Location', 'Office', 'Site']) || defaultLocation,
      120
    );
    const rawCond = pickField(map, ['Condition', 'Asset Condition']);
    const rawStatus = pickField(map, ['Status', 'Asset Status', 'Lifecycle Status']);
    const notes = clampStr(pickField(map, ['Notes', 'Remarks', 'Comments', 'Description']), 1000);

    // Skip completely empty trailing rows
    if (!name && !brand && !model && !serialNumber && !rawCode) {
      return;
    }

    const errors: string[] = [];
    if (!name) errors.push('Asset Name is required.');
    if (!brand) errors.push('Brand is required.');
    if (!model) errors.push('Model is required.');
    if (!serialNumber || serialNumber.length < 2) {
      errors.push('Serial Number must be at least 2 characters.');
    }

    const category = matchEnum<AssetCategory>(rawCat, ASSET_CATEGORIES);
    if (!category) {
      errors.push(
        rawCat
          ? `Invalid Category "${rawCat}".`
          : 'Category is required (e.g. Laptop, Monitor, Mobile Phone).'
      );
    }

    const cleanCostStr = costRaw.replace(/[$,\s]/g, '');
    const purchaseCost = cleanCostStr === '' ? 0 : Number.parseFloat(cleanCostStr);
    if (Number.isNaN(purchaseCost) || purchaseCost < 0) {
      errors.push('Purchase Cost must be a non-negative number.');
    }

    const condition = matchEnum<AssetCondition>(rawCond, ASSET_CONDITIONS, 'New');
    if (!condition) {
      errors.push(`Invalid Condition "${rawCond}".`);
    }

    const status = matchEnum<AssetStatus>(rawStatus, ASSET_STATUSES, 'Available');
    if (!status) {
      errors.push(`Invalid Status "${rawStatus}".`);
    } else if (status === 'Assigned') {
      errors.push('Imported assets cannot start as "Assigned"; import as Available or Purchased first.');
    }

    let assetCode = rawCode.toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 40);
    if (rawCode && assetCode.length < 3) {
      errors.push('Asset ID must be at least 3 alphanumeric/hyphen characters.');
    }
    if (!rawCode) {
      assetCode = generateNextAssetCode(runningAssets);
    }

    const upperCode = assetCode.toUpperCase();
    const upperSerial = serialNumber.toUpperCase();

    if (upperCode && (existingCodes.has(upperCode) || seenBatchCodes.has(upperCode))) {
      errors.push(`Duplicate Asset ID "${assetCode}".`);
    }
    if (upperSerial && (existingSerials.has(upperSerial) || seenBatchSerials.has(upperSerial))) {
      errors.push(`Duplicate Serial Number "${serialNumber}".`);
    }

    if (errors.length === 0 && category && condition && status) {
      seenBatchCodes.add(upperCode);
      seenBatchSerials.add(upperSerial);
      const item: Omit<Asset, 'id'> = {
        assetCode,
        name,
        category,
        brand,
        model,
        serialNumber,
        imei,
        purchaseDate,
        purchaseCost: Math.round(purchaseCost * 100) / 100,
        vendorName,
        warrantyStartDate,
        warrantyExpiryDate,
        invoiceNumber,
        location,
        condition,
        status,
        assignedEmployeeId: '',
        assignedEmployeeName: '',
        notes,
        imageUrl: '',
      };
      runningAssets.push({ id: `temp-${rowNumber}`, ...item });
      validItems.push(item);
      parsedRows.push({
        rowNumber,
        valid: true,
        errors: [],
        data: item,
        previewLabel: `${item.assetCode} · ${item.name}`,
        previewSublabel: `${item.category} · S/N ${item.serialNumber} · $${item.purchaseCost.toLocaleString()}`,
      });
    } else {
      parsedRows.push({
        rowNumber,
        valid: false,
        errors,
        previewLabel: `${assetCode || '(Auto ID)'} · ${name || 'Unnamed Row'}`,
        previewSublabel: `${rawCat || 'No Category'} · S/N ${serialNumber || 'Missing'}`,
      });
    }
  });

  return {
    rows: parsedRows,
    validItems,
    validCount: validItems.length,
    errorCount: parsedRows.length - validItems.length,
  };
}

export function parseAndValidateEmployeeRows(
  rawRows: Array<Record<string, unknown>>,
  existingEmployees: Employee[],
  defaultDepartment = 'Engineering',
  defaultLocation = 'San Francisco HQ',
  todayIso = '2026-11-17'
): ImportParseResult<Omit<Employee, 'id'>> {
  const existingCodes = new Set(existingEmployees.map((e) => e.employeeCode.trim().toUpperCase()));
  const existingEmails = new Set(existingEmployees.map((e) => e.email.trim().toLowerCase()));
  const seenCodes = new Set<string>();
  const seenEmails = new Set<string>();
  const runningEmployees: Employee[] = [...existingEmployees];

  const parsedRows: Array<ParsedImportRow<Omit<Employee, 'id'>>> = [];
  const validItems: Array<Omit<Employee, 'id'>> = [];

  rawRows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const map = normalizeRowKeys(raw);

    const rawCode = pickField(map, ['Employee ID', 'Employee Code', 'employeeCode', 'ID']);
    const fullName = clampStr(pickField(map, ['Full Name', 'Name', 'Employee Name']), 120);
    const email = clampStr(pickField(map, ['Email', 'Work Email', 'Email Address']).toLowerCase(), 200);
    const phone = clampStr(pickField(map, ['Phone', 'Phone Number']), 40);
    const department = clampStr(pickField(map, ['Department', 'Dept']) || defaultDepartment, 100);
    const designation = clampStr(pickField(map, ['Designation', 'Title', 'Role', 'Job Title']), 120);
    const reportingManager = clampStr(pickField(map, ['Reporting Manager', 'Manager']), 120);
    const joiningDateRaw =
      map.get(normalizeHeaderKey('Joining Date')) ?? pickField(map, ['Joining Date', 'Start Date']);
    const joiningDate = clampStr(parseExcelDate(joiningDateRaw, todayIso), 30);
    const rawStatus = pickField(map, ['Employment Status', 'Status']);
    const location = clampStr(pickField(map, ['Location', 'Office Location']) || defaultLocation, 120);

    if (!fullName && !email && !designation && !rawCode) {
      return;
    }

    const errors: string[] = [];
    if (!fullName) errors.push('Full Name is required.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Valid work Email is required.');
    }
    if (!designation) errors.push('Designation is required.');

    const employmentStatus = matchEnum<EmploymentStatus>(rawStatus, EMPLOYMENT_STATUSES, 'Active');
    if (!employmentStatus) {
      errors.push(`Invalid Employment Status "${rawStatus}".`);
    }

    let employeeCode = rawCode.toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 40);
    if (rawCode && employeeCode.length < 2) {
      errors.push('Employee ID must be at least 2 characters.');
    }
    if (!rawCode) {
      employeeCode = generateNextEmployeeCode(runningEmployees);
    }

    if (employeeCode && (existingCodes.has(employeeCode) || seenCodes.has(employeeCode))) {
      errors.push(`Duplicate Employee ID "${employeeCode}".`);
    }
    if (email && (existingEmails.has(email) || seenEmails.has(email))) {
      errors.push(`Duplicate Email "${email}".`);
    }

    if (errors.length === 0 && employmentStatus) {
      seenCodes.add(employeeCode);
      seenEmails.add(email);
      const item: Omit<Employee, 'id'> = {
        employeeCode,
        fullName,
        email,
        phone,
        department,
        designation,
        reportingManager,
        joiningDate,
        employmentStatus,
        location,
        clearanceStatus:
          employmentStatus === 'Resigned' || employmentStatus === 'Terminated'
            ? 'Pending'
            : 'Not Applicable',
        photoUrl: '',
      };
      runningEmployees.push({ id: `temp-${rowNumber}`, ...item });
      validItems.push(item);
      parsedRows.push({
        rowNumber,
        valid: true,
        errors: [],
        data: item,
        previewLabel: `${item.employeeCode} · ${item.fullName}`,
        previewSublabel: `${item.department} · ${item.designation} · ${item.email}`,
      });
    } else {
      parsedRows.push({
        rowNumber,
        valid: false,
        errors,
        previewLabel: `${employeeCode || '(Auto ID)'} · ${fullName || 'Unnamed Row'}`,
        previewSublabel: `${department} · ${email || 'Missing Email'}`,
      });
    }
  });

  return {
    rows: parsedRows,
    validItems,
    validCount: validItems.length,
    errorCount: parsedRows.length - validItems.length,
  };
}
