import * as XLSX from 'xlsx';
import type {
  Asset,
  AssetAssignment,
  Employee,
  MaintenanceRecord,
  ReportType,
} from '../types/eams';
import { computeDepreciationValue } from './assetRules';

export interface ReportFilterOptions {
  reportType: ReportType;
  dateFrom?: string;
  dateTo?: string;
  department?: string;
  category?: string;
  status?: string;
  referenceDate?: string;
}

export interface ReportDataset {
  title: string;
  fileNameBase: string;
  columns: string[];
  rows: Array<Record<string, string | number>>;
}

function inDateRange(dateStr: string | undefined, from?: string, to?: string): boolean {
  if (!dateStr) return !from && !to;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function buildReportDataset(
  filters: ReportFilterOptions,
  data: {
    assets: Asset[];
    employees: Employee[];
    assignments: AssetAssignment[];
    maintenanceRecords: MaintenanceRecord[];
  }
): ReportDataset {
  const refDate = filters.referenceDate || '2026-11-17';
  const empMap = new Map(data.employees.map((e) => [e.id, e]));

  const filteredAssets = data.assets.filter((a) => {
    if (filters.category && filters.category !== 'All' && a.category !== filters.category) return false;
    if (filters.status && filters.status !== 'All' && a.status !== filters.status) return false;
    if (filters.department && filters.department !== 'All') {
      const emp = a.assignedEmployeeId ? empMap.get(a.assignedEmployeeId) : undefined;
      if (!emp || emp.department !== filters.department) return false;
    }
    if (!inDateRange(a.purchaseDate, filters.dateFrom, filters.dateTo)) return false;
    return true;
  });

  switch (filters.reportType) {
    case 'complete_inventory':
      return {
        title: 'Complete Asset Inventory Report',
        fileNameBase: 'complete-asset-inventory',
        columns: ['Asset ID', 'Name', 'Category', 'Brand', 'Model', 'Serial Number', 'Status', 'Condition', 'Location', 'Purchase Date', 'Purchase Cost ($)', 'Warranty Expiry', 'Assigned To'],
        rows: filteredAssets.map((a) => ({
          'Asset ID': a.assetCode,
          Name: a.name,
          Category: a.category,
          Brand: a.brand,
          Model: a.model,
          'Serial Number': a.serialNumber,
          Status: a.status,
          Condition: a.condition,
          Location: a.location,
          'Purchase Date': a.purchaseDate,
          'Purchase Cost ($)': a.purchaseCost,
          'Warranty Expiry': a.warrantyExpiryDate || 'N/A',
          'Assigned To': a.assignedEmployeeName || 'Unassigned',
        })),
      };

    case 'employee_allocation': {
      const activeAsg = data.assignments.filter((asg) => {
        if (asg.status !== 'Active') return false;
        const emp = empMap.get(asg.employeeId);
        if (filters.department && filters.department !== 'All' && emp?.department !== filters.department) return false;
        if (!inDateRange(asg.issueDate, filters.dateFrom, filters.dateTo)) return false;
        return true;
      });
      return {
        title: 'Employee-Wise Asset Allocation Report',
        fileNameBase: 'employee-asset-allocation',
        columns: ['Employee ID', 'Employee Name', 'Department', 'Asset ID', 'Asset Name', 'Issue Date', 'Condition at Issue', 'Acknowledged', 'Receipt #'],
        rows: activeAsg.map((asg) => {
          const emp = empMap.get(asg.employeeId);
          return {
            'Employee ID': emp?.employeeCode || asg.employeeId,
            'Employee Name': asg.employeeName,
            Department: emp?.department || asg.department || 'N/A',
            'Asset ID': asg.assetCode,
            'Asset Name': asg.assetName,
            'Issue Date': asg.issueDate,
            'Condition at Issue': asg.conditionAtIssue,
            Acknowledged: asg.acknowledgedByEmployee ? 'Yes' : 'Pending',
            'Receipt #': asg.receiptNumber,
          };
        }),
      };
    }

    case 'department_allocation': {
      const deptAgg = new Map<string, { employees: number; assignedAssets: number; totalValue: number }>();
      for (const e of data.employees) {
        if (filters.department && filters.department !== 'All' && e.department !== filters.department) continue;
        const cur = deptAgg.get(e.department) || { employees: 0, assignedAssets: 0, totalValue: 0 };
        cur.employees += 1;
        deptAgg.set(e.department, cur);
      }
      for (const a of filteredAssets) {
        if (a.status === 'Assigned' && a.assignedEmployeeId) {
          const emp = empMap.get(a.assignedEmployeeId);
          const dept = emp?.department || 'Unassigned';
          if (filters.department && filters.department !== 'All' && dept !== filters.department) continue;
          const cur = deptAgg.get(dept) || { employees: 0, assignedAssets: 0, totalValue: 0 };
          cur.assignedAssets += 1;
          cur.totalValue += a.purchaseCost;
          deptAgg.set(dept, cur);
        }
      }
      return {
        title: 'Department-Wise Asset Allocation Report',
        fileNameBase: 'department-asset-allocation',
        columns: ['Department', 'Headcount', 'Assigned Assets', 'Total Allocated Value ($)'],
        rows: Array.from(deptAgg.entries()).map(([dept, stats]) => ({
          Department: dept,
          Headcount: stats.employees,
          'Assigned Assets': stats.assignedAssets,
          'Total Allocated Value ($)': stats.totalValue,
        })),
      };
    }

    case 'available_assets':
      return {
        title: 'Available Stockroom Assets Report',
        fileNameBase: 'available-assets',
        columns: ['Asset ID', 'Name', 'Category', 'Brand', 'Serial Number', 'Condition', 'Location', 'Purchase Cost ($)'],
        rows: filteredAssets
          .filter((a) => a.status === 'Available' || a.status === 'Purchased')
          .map((a) => ({
            'Asset ID': a.assetCode,
            Name: a.name,
            Category: a.category,
            Brand: a.brand,
            'Serial Number': a.serialNumber,
            Condition: a.condition,
            Location: a.location,
            'Purchase Cost ($)': a.purchaseCost,
          })),
      };

    case 'under_maintenance': {
      const records = data.maintenanceRecords.filter((m) =>
        inDateRange(m.reportedDate, filters.dateFrom, filters.dateTo)
      );
      return {
        title: 'Assets Under Maintenance & Repair Report',
        fileNameBase: 'maintenance-repairs',
        columns: ['Ticket ID', 'Asset ID', 'Asset Name', 'Reported Date', 'Issue Description', 'Technician', 'Vendor', 'Repair Cost ($)', 'Status', 'Resolution Date'],
        rows: records.map((m) => ({
          'Ticket ID': m.id,
          'Asset ID': m.assetCode || m.assetId,
          'Asset Name': m.assetName || 'N/A',
          'Reported Date': m.reportedDate,
          'Issue Description': m.issueDescription,
          Technician: m.assignedTechnician || 'Unassigned',
          Vendor: m.repairVendor || 'Internal',
          'Repair Cost ($)': m.repairCost || 0,
          Status: m.repairStatus,
          'Resolution Date': m.resolutionDate || 'Open',
        })),
      };
    }

    case 'warranty_expiry': {
      const refMs = Date.parse(refDate);
      return {
        title: 'Warranty Expiry & Coverage Report',
        fileNameBase: 'warranty-expiry-report',
        columns: ['Asset ID', 'Name', 'Category', 'Vendor', 'Purchase Date', 'Warranty Expiry', 'Days Remaining', 'Coverage State'],
        rows: filteredAssets
          .filter((a) => Boolean(a.warrantyExpiryDate))
          .map((a) => {
            const days = Math.ceil((Date.parse(a.warrantyExpiryDate!) - refMs) / 86_400_000);
            const state = days < 0 ? 'Expired' : days <= 30 ? 'Expiring <= 30 Days' : 'Active';
            return {
              'Asset ID': a.assetCode,
              Name: a.name,
              Category: a.category,
              Vendor: a.vendorName || 'N/A',
              'Purchase Date': a.purchaseDate,
              'Warranty Expiry': a.warrantyExpiryDate!,
              'Days Remaining': days,
              'Coverage State': state,
            };
          }),
      };
    }

    case 'purchase_depreciation':
      return {
        title: 'Asset Purchase & Straight-Line Depreciation Report (3-Year Life)',
        fileNameBase: 'purchase-depreciation-report',
        columns: ['Asset ID', 'Name', 'Category', 'Purchase Date', 'Age (Months)', 'Original Cost ($)', 'Accumulated Depreciation ($)', 'Net Book Value ($)'],
        rows: filteredAssets.map((a) => {
          const dep = computeDepreciationValue(a.purchaseCost, a.purchaseDate, refDate, 3);
          return {
            'Asset ID': a.assetCode,
            Name: a.name,
            Category: a.category,
            'Purchase Date': a.purchaseDate,
            'Age (Months)': dep.ageMonths,
            'Original Cost ($)': a.purchaseCost,
            'Accumulated Depreciation ($)': dep.accumulatedDepreciation,
            'Net Book Value ($)': dep.currentValue,
          };
        }),
      };

    case 'lost_damaged':
      return {
        title: 'Lost, Damaged & Unserviceable Assets Report',
        fileNameBase: 'lost-damaged-assets',
        columns: ['Asset ID', 'Name', 'Category', 'Serial Number', 'Status', 'Condition', 'Location', 'Purchase Cost ($)', 'Notes'],
        rows: filteredAssets
          .filter((a) => a.status === 'Lost' || a.status === 'Damaged' || a.condition === 'Damaged')
          .map((a) => ({
            'Asset ID': a.assetCode,
            Name: a.name,
            Category: a.category,
            'Serial Number': a.serialNumber,
            Status: a.status,
            Condition: a.condition,
            Location: a.location,
            'Purchase Cost ($)': a.purchaseCost,
            Notes: a.notes || '',
          })),
      };

    case 'offboarding_clearance': {
      const offboardingEmps = data.employees.filter(
        (e) =>
          (e.employmentStatus === 'Resigned' || e.employmentStatus === 'Terminated') &&
          (!filters.department || filters.department === 'All' || e.department === filters.department)
      );
      return {
        title: 'Employee Offboarding Asset Clearance Report',
        fileNameBase: 'offboarding-clearance',
        columns: ['Employee ID', 'Employee Name', 'Department', 'Employment Status', 'Pending Assets', 'Clearance Status'],
        rows: offboardingEmps.map((e) => {
          const pending = data.assignments.filter((asg) => asg.employeeId === e.id && asg.status === 'Active').length;
          return {
            'Employee ID': e.employeeCode,
            'Employee Name': e.fullName,
            Department: e.department,
            'Employment Status': e.employmentStatus,
            'Pending Assets': pending,
            'Clearance Status': e.clearanceStatus || (pending === 0 ? 'Complete' : 'Pending'),
          };
        }),
      };
    }

    case 'assignment_history': {
      const allHist = data.assignments.filter((asg) => {
        const emp = empMap.get(asg.employeeId);
        if (filters.department && filters.department !== 'All' && emp?.department !== filters.department) return false;
        if (!inDateRange(asg.issueDate, filters.dateFrom, filters.dateTo)) return false;
        return true;
      });
      return {
        title: 'Complete Asset Assignment & Return History',
        fileNameBase: 'assignment-return-history',
        columns: ['Receipt #', 'Asset ID', 'Asset Name', 'Employee', 'Department', 'Issue Date', 'Return Date', 'Status', 'Condition at Issue', 'Issued By'],
        rows: allHist.map((asg) => ({
          'Receipt #': asg.receiptNumber,
          'Asset ID': asg.assetCode,
          'Asset Name': asg.assetName,
          Employee: asg.employeeName,
          Department: asg.department || empMap.get(asg.employeeId)?.department || 'N/A',
          'Issue Date': asg.issueDate,
          'Return Date': asg.returnDate || 'Still Active',
          Status: asg.status,
          'Condition at Issue': asg.conditionAtIssue,
          'Issued By': asg.issuedByName || asg.issuedByUid,
        })),
      };
    }
  }
}

export function downloadCSV(dataset: ReportDataset): void {
  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const headerLine = dataset.columns.map(escapeCsv).join(',');
  const dataLines = dataset.rows.map((row) =>
    dataset.columns.map((col) => escapeCsv(row[col] ?? '')).join(',')
  );
  const csvContent = [headerLine, ...dataLines].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${dataset.fileNameBase}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadExcel(dataset: ReportDataset): void {
  const worksheet = XLSX.utils.json_to_sheet(dataset.rows, { header: dataset.columns });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  XLSX.writeFile(workbook, `${dataset.fileNameBase}.xlsx`);
}
