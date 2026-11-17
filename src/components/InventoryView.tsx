import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  Laptop,
  Monitor,
  Package,
  Plus,
  Printer,
  QrCode,
  Search,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import { useEams } from '../services/eamsStore';
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  type Asset,
  type AssetCategory,
  type AssetCondition,
  type AssetStatus,
} from '../types/eams';
import { generateAssetQrCodeDataUrl, type GeneratedAssetQr } from '../utils/assetQr';
import { generateNextAssetCode, hasPermission } from '../utils/assetRules';
import { downloadAssetImportTemplate } from '../utils/excelImport';
import { ConfirmDialog } from './ConfirmDialog';
import { ExcelImportModal } from './ExcelImportModal';
import { QrCodeModal } from './QrCodeModal';
import { StatusBadge } from './StatusBadge';

interface InventoryViewProps {
  initialStatusFilter?: AssetStatus | 'All';
  openAddSignal?: number;
  initialAssetCode?: string | null;
}

function CategoryFallbackIcon({ category }: { category: AssetCategory }) {
  const cls = 'w-8 h-8 text-slate-400';
  if (category === 'Laptop' || category === 'Desktop') return <Laptop className={cls} />;
  if (category === 'Monitor') return <Monitor className={cls} />;
  if (category === 'Mobile Phone' || category === 'Tablet') return <Smartphone className={cls} />;
  return <Package className={cls} />;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  initialStatusFilter = 'All',
  openAddSignal = 0,
  initialAssetCode = null,
}) => {
  const {
    assets,
    assignments,
    maintenanceRecords,
    locations,
    currentUser,
    saveAsset,
    bulkImportAssets,
    updateAssetStatusDirect,
    uploadImageAsset,
  } = useEams();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [sortField, setSortField] = useState<'assetCode' | 'name' | 'purchaseCost' | 'purchaseDate'>('assetCode');
  const [sortAsc, setSortAsc] = useState(true);

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [detailQr, setDetailQr] = useState<GeneratedAssetQr | null>(null);
  const [copiedScanUrl, setCopiedScanUrl] = useState(false);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [confirmRetire, setConfirmRetire] = useState<{ asset: Asset; nextStatus: AssetStatus } | null>(null);

  const canManage = currentUser ? hasPermission(currentUser.role, 'manage_inventory') : false;

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  useEffect(() => {
    if (!initialAssetCode) return;
    const match = assets.find(
      (a) => a.assetCode.toLowerCase() === initialAssetCode.trim().toLowerCase()
    );
    if (match) {
      setSelectedAsset(match);
    }
  }, [assets, initialAssetCode]);

  useEffect(() => {
    if (!selectedAsset) {
      setDetailQr(null);
      setCopiedScanUrl(false);
      return;
    }
    let cancelled = false;
    setCopiedScanUrl(false);
    generateAssetQrCodeDataUrl(selectedAsset, { width: 192 })
      .then((res) => {
        if (!cancelled) setDetailQr(res);
      })
      .catch(() => {
        if (!cancelled) setDetailQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAsset]);

  const [form, setForm] = useState({
    assetCode: '',
    name: '',
    category: 'Laptop' as AssetCategory,
    brand: '',
    model: '',
    serialNumber: '',
    imei: '',
    purchaseDate: '2026-11-17',
    purchaseCost: '0',
    vendorName: '',
    warrantyStartDate: '2026-11-17',
    warrantyExpiryDate: '2029-11-17',
    invoiceNumber: '',
    location: locations[0]?.name || 'Head Office',
    condition: 'New' as AssetCondition,
    status: 'Available' as AssetStatus,
    notes: '',
    imageUrl: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const openCreateModal = () => {
    setEditingAsset(null);
    setForm({
      assetCode: generateNextAssetCode(assets),
      name: '',
      category: 'Laptop',
      brand: '',
      model: '',
      serialNumber: '',
      imei: '',
      purchaseDate: '2026-11-17',
      purchaseCost: '1500',
      vendorName: '',
      warrantyStartDate: '2026-11-17',
      warrantyExpiryDate: '2029-11-17',
      invoiceNumber: '',
      location: locations[0]?.name || 'Head Office',
      condition: 'New',
      status: 'Available',
      notes: '',
      imageUrl: '',
    });
    setFormError('');
    setShowModal(true);
  };

  useEffect(() => {
    if (openAddSignal > 0 && canManage) {
      openCreateModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAddSignal]);

  const openEditModal = (asset: Asset) => {
    setEditingAsset(asset);
    setForm({
      assetCode: asset.assetCode,
      name: asset.name,
      category: asset.category,
      brand: asset.brand,
      model: asset.model,
      serialNumber: asset.serialNumber,
      imei: asset.imei || '',
      purchaseDate: asset.purchaseDate,
      purchaseCost: String(asset.purchaseCost),
      vendorName: asset.vendorName || '',
      warrantyStartDate: asset.warrantyStartDate || '',
      warrantyExpiryDate: asset.warrantyExpiryDate || '',
      invoiceNumber: asset.invoiceNumber || '',
      location: asset.location,
      condition: asset.condition,
      status: asset.status,
      notes: asset.notes || '',
      imageUrl: asset.imageUrl || '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImageAsset(file, 'assets');
      setForm((prev) => ({ ...prev, imageUrl: url }));
    } catch {
      setFormError('Failed to process uploaded image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const cost = Number.parseFloat(form.purchaseCost);
    if (!form.name.trim() || !form.brand.trim() || !form.model.trim() || !form.serialNumber.trim()) {
      setFormError('Asset name, brand, model, and serial number are required.');
      return;
    }
    if (Number.isNaN(cost) || cost < 0) {
      setFormError('Purchase cost must be a valid non-negative number.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveAsset({
        ...(editingAsset ? { id: editingAsset.id } : {}),
        assetCode: form.assetCode.trim(),
        name: form.name.trim(),
        category: form.category,
        brand: form.brand.trim(),
        model: form.model.trim(),
        serialNumber: form.serialNumber.trim(),
        imei: form.imei.trim(),
        purchaseDate: form.purchaseDate,
        purchaseCost: cost,
        vendorName: form.vendorName.trim(),
        warrantyStartDate: form.warrantyStartDate,
        warrantyExpiryDate: form.warrantyExpiryDate,
        invoiceNumber: form.invoiceNumber.trim(),
        location: form.location,
        condition: form.condition,
        status: form.status,
        assignedEmployeeId: editingAsset?.assignedEmployeeId || '',
        assignedEmployeeName: editingAsset?.assignedEmployeeName || '',
        notes: form.notes.trim(),
        imageUrl: form.imageUrl,
      });
      if (selectedAsset?.id === saved.id) setSelectedAsset(saved);
      setShowModal(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save asset.');
    } finally {
      setSaving(false);
    }
  };

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets
      .filter((a) => {
        if (categoryFilter !== 'All' && a.category !== categoryFilter) return false;
        if (statusFilter !== 'All' && a.status !== statusFilter) return false;
        if (locationFilter !== 'All' && a.location !== locationFilter) return false;
        if (!q) return true;
        return (
          a.assetCode.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.serialNumber.toLowerCase().includes(q) ||
          a.brand.toLowerCase().includes(q) ||
          a.model.toLowerCase().includes(q) ||
          (a.assignedEmployeeName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'purchaseCost') cmp = a.purchaseCost - b.purchaseCost;
        else cmp = String(a[sortField]).localeCompare(String(b[sortField]));
        return sortAsc ? cmp : -cmp;
      });
  }, [assets, search, categoryFilter, statusFilter, locationFilter, sortField, sortAsc]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc((v) => !v);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const selectedAssetHistory = useMemo(() => {
    if (!selectedAsset) return { asgs: [], mnts: [] };
    return {
      asgs: assignments.filter((a) => a.assetId === selectedAsset.id),
      mnts: maintenanceRecords.filter((m) => m.assetId === selectedAsset.id),
    };
  }, [assignments, maintenanceRecords, selectedAsset]);

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, name, serial, assignee..."
              aria-label="Search asset inventory"
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by asset category"
            className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700"
          >
            <option value="All">All Categories</option>
            {ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by asset status"
            className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700"
          >
            <option value="All">All Statuses</option>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            aria-label="Filter by location"
            className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700"
          >
            <option value="All">All Locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500 tabular-nums mr-1">
            {filteredAssets.length} of {assets.length} assets
          </span>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => downloadAssetImportTemplate(locations.map((l) => l.name))}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Template
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Import Assets
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Asset
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inventory Table */}
      {filteredAssets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <div className="text-sm font-medium text-slate-900">
            {assets.length === 0 ? 'No assets in inventory yet' : 'No assets match these criteria'}
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {assets.length === 0
              ? 'Bulk-onboard legacy hardware via CSV or Excel using pre-defined column mapping, or register an asset individually.'
              : 'Clear filters or register a new asset.'}
          </p>
          {assets.length === 0 && canManage && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Import Assets (CSV / Excel)
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Asset
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                  <th className="px-3 py-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('assetCode')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Asset ID <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Asset & Category <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-2.5 py-3 whitespace-nowrap">Serial #</th>
                  <th className="px-2.5 py-3 whitespace-nowrap">Status</th>
                  <th className="px-2.5 py-3 whitespace-nowrap">Condition</th>
                  <th className="px-2.5 py-3 whitespace-nowrap">Custodian</th>
                  <th className="px-2.5 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('purchaseCost')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Cost <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">
                      {asset.assetCode}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedAsset(asset)}
                        className="text-left group block max-w-[230px]"
                      >
                        <div className="font-medium text-slate-900 group-hover:text-blue-700 leading-snug truncate">
                          {asset.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {asset.category} · {asset.brand} {asset.model}
                        </div>
                      </button>
                    </td>
                    <td className="px-2.5 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {asset.serialNumber}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <StatusBadge label={asset.status} />
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <StatusBadge label={asset.condition} />
                    </td>
                    <td className="px-2.5 py-2.5 text-xs">
                      {asset.assignedEmployeeName ? (
                        <div className="max-w-[150px]">
                          <div className="font-medium text-slate-900 truncate">{asset.assignedEmployeeName}</div>
                          <div className="text-slate-500 truncate">{asset.location}</div>
                        </div>
                      ) : (
                        <div className="text-slate-500 truncate max-w-[150px]">{asset.location}</div>
                      )}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-xs font-medium text-slate-900 whitespace-nowrap">
                      ${asset.purchaseCost.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setQrAsset(asset)}
                        aria-label={`View QR tag for ${asset.assetCode}`}
                        className="p-1 text-slate-500 hover:text-slate-900 rounded-md mr-1 align-middle"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAsset(asset)}
                        className="text-xs font-medium text-blue-700 hover:underline mr-2"
                      >
                        Details
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openEditModal(asset)}
                          className="text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Asset Detail Drawer */}
      {selectedAsset && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-detail-title"
        >
          <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-xl border-l border-slate-200 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <div className="text-xs font-mono text-slate-500">{selectedAsset.assetCode}</div>
                <h2 id="asset-detail-title" className="text-base font-semibold text-slate-900">
                  {selectedAsset.name}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQrAsset(selectedAsset)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  QR Label
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAsset(null)}
                  aria-label="Close asset detail"
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Photo + Status Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-stretch">
                <div className="sm:col-span-2 aspect-[4/3] bg-slate-100 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center">
                  {selectedAsset.imageUrl ? (
                    <img
                      src={selectedAsset.imageUrl}
                      alt={selectedAsset.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 p-4 text-center">
                      <CategoryFallbackIcon category={selectedAsset.category} />
                      <span className="text-xs text-slate-500">{selectedAsset.category}</span>
                    </div>
                  )}
                </div>
                <div className="sm:col-span-3 p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={selectedAsset.status} />
                    <StatusBadge label={selectedAsset.condition} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-slate-500">Serial Number</div>
                      <div className="font-mono text-slate-900 font-medium mt-0.5">
                        {selectedAsset.serialNumber}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Purchase Cost</div>
                      <div className="font-mono tabular-nums text-slate-900 font-semibold mt-0.5">
                        ${selectedAsset.purchaseCost.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Assigned To</div>
                      <div className="text-slate-900 font-medium mt-0.5">
                        {selectedAsset.assignedEmployeeName || 'In Stockroom'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Location</div>
                      <div className="text-slate-900 font-medium mt-0.5">
                        {selectedAsset.location}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Procurement & Warranty Specs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border border-slate-200 rounded-xl p-4 text-xs">
                <div>
                  <div className="text-slate-500">Brand / Model</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {selectedAsset.brand} {selectedAsset.model}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Vendor</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {selectedAsset.vendorName || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Invoice Number</div>
                  <div className="font-mono text-slate-900 mt-0.5">
                    {selectedAsset.invoiceNumber || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Purchase Date</div>
                  <div className="font-mono tabular-nums text-slate-900 mt-0.5">
                    {selectedAsset.purchaseDate}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Warranty Start</div>
                  <div className="font-mono tabular-nums text-slate-900 mt-0.5">
                    {selectedAsset.warrantyStartDate || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Warranty Expiry</div>
                  <div className="font-mono tabular-nums text-slate-900 mt-0.5">
                    {selectedAsset.warrantyExpiryDate || 'N/A'}
                  </div>
                </div>
                {selectedAsset.imei && (
                  <div className="col-span-2">
                    <div className="text-slate-500">IMEI</div>
                    <div className="font-mono text-slate-900 mt-0.5">{selectedAsset.imei}</div>
                  </div>
                )}
              </div>

              {/* Mobile Scan QR Code */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-32 h-32 shrink-0 bg-white border border-slate-200 rounded-lg p-1.5 flex items-center justify-center">
                  {detailQr ? (
                    <img
                      src={detailQr.dataUrl}
                      alt={`Unique QR code for ${selectedAsset.assetCode}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[11px] text-slate-400">Generating QR...</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Mobile Scan QR Code
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Scan with any mobile camera to open{' '}
                      <span className="font-mono text-slate-700">{selectedAsset.assetCode}</span>{' '}
                      directly on your device.
                    </p>
                  </div>
                  {detailQr && (
                    <div className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 truncate">
                      {detailQr.scanUrl}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
                    {detailQr && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(detailQr.scanUrl);
                              setCopiedScanUrl(true);
                              setTimeout(() => setCopiedScanUrl(false), 2000);
                            } catch {
                              // Ignore clipboard errors in restricted contexts
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 whitespace-nowrap"
                        >
                          {copiedScanUrl ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedScanUrl ? 'Link Copied' : 'Copy Scan Link'}
                        </button>
                        <a
                          href={detailQr.dataUrl}
                          download={`${selectedAsset.assetCode}-qr.png`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download QR PNG
                        </a>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setQrAsset(selectedAsset)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Property Tag
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Lifecycle Actions */}
              {canManage && selectedAsset.status !== 'Assigned' && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                  <span className="text-xs font-medium text-slate-500 mr-2">Lifecycle State:</span>
                  {selectedAsset.status === 'Purchased' && (
                    <button
                      type="button"
                      onClick={() => updateAssetStatusDirect(selectedAsset.id, 'Available').then(() => setSelectedAsset({ ...selectedAsset, status: 'Available' }))}
                      className="px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                    >
                      Mark Available
                    </button>
                  )}
                  {selectedAsset.status !== 'Lost' && (
                    <button
                      type="button"
                      onClick={() => setConfirmRetire({ asset: selectedAsset, nextStatus: 'Lost' })}
                      className="px-3 py-1.5 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                    >
                      Mark Lost
                    </button>
                  )}
                  {selectedAsset.status !== 'Retired' && (
                    <button
                      type="button"
                      onClick={() => setConfirmRetire({ asset: selectedAsset, nextStatus: 'Retired' })}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200"
                    >
                      Retire Asset
                    </button>
                  )}
                  {selectedAsset.status === 'Retired' && (
                    <button
                      type="button"
                      onClick={() => setConfirmRetire({ asset: selectedAsset, nextStatus: 'Disposed' })}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200"
                    >
                      Dispose Asset
                    </button>
                  )}
                </div>
              )}

              {/* Lifecycle Assignment History */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Custody & Assignment History ({selectedAssetHistory.asgs.length})
                </h3>
                {selectedAssetHistory.asgs.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 border border-slate-200 rounded-xl">
                    No prior assignments recorded for this asset.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
                    {selectedAssetHistory.asgs.map((asg) => (
                      <div key={asg.id} className="p-3.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{asg.employeeName}</div>
                          <div className="text-slate-500 font-mono">
                            Issued {asg.issueDate}
                            {asg.returnDate ? ` → Returned ${asg.returnDate}` : ' → Active'}
                          </div>
                        </div>
                        <StatusBadge label={asg.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Maintenance History */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Maintenance Records ({selectedAssetHistory.mnts.length})
                </h3>
                {selectedAssetHistory.mnts.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 border border-slate-200 rounded-xl">
                    No maintenance tickets logged for this asset.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
                    {selectedAssetHistory.mnts.map((m) => (
                      <div key={m.id} className="p-3.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-900">{m.issueDescription}</span>
                          <StatusBadge label={m.repairStatus} />
                        </div>
                        <div className="text-slate-500 font-mono">
                          Reported {m.reportedDate} · Vendor: {m.repairVendor || 'Internal'} · Cost: $
                          {(m.repairCost || 0).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Register / Edit Asset Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-modal-title"
        >
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 id="asset-modal-title" className="text-base font-semibold text-slate-900">
                {editingAsset ? `Edit Asset (${editingAsset.assetCode})` : 'Register New Asset'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close asset modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ast-code" className="block text-xs font-medium text-slate-700 mb-1">
                    Asset ID *
                  </label>
                  <input
                    id="ast-code"
                    type="text"
                    required
                    value={form.assetCode}
                    onChange={(e) => setForm({ ...form, assetCode: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Asset Name *
                  </label>
                  <input
                    id="ast-name"
                    type="text"
                    required
                    placeholder='e.g. MacBook Pro 14" M4'
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-cat" className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    id="ast-cat"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as AssetCategory })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {ASSET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ast-brand" className="block text-xs font-medium text-slate-700 mb-1">
                    Brand *
                  </label>
                  <input
                    id="ast-brand"
                    type="text"
                    required
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-model" className="block text-xs font-medium text-slate-700 mb-1">
                    Model *
                  </label>
                  <input
                    id="ast-model"
                    type="text"
                    required
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-serial" className="block text-xs font-medium text-slate-700 mb-1">
                    Serial Number *
                  </label>
                  <input
                    id="ast-serial"
                    type="text"
                    required
                    value={form.serialNumber}
                    onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-imei" className="block text-xs font-medium text-slate-700 mb-1">
                    IMEI (Mobile / Tablet)
                  </label>
                  <input
                    id="ast-imei"
                    type="text"
                    value={form.imei}
                    onChange={(e) => setForm({ ...form, imei: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-cost" className="block text-xs font-medium text-slate-700 mb-1">
                    Purchase Cost ($) *
                  </label>
                  <input
                    id="ast-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.purchaseCost}
                    onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-pdate" className="block text-xs font-medium text-slate-700 mb-1">
                    Purchase Date
                  </label>
                  <input
                    id="ast-pdate"
                    type="date"
                    value={form.purchaseDate}
                    onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-wexp" className="block text-xs font-medium text-slate-700 mb-1">
                    Warranty Expiry Date
                  </label>
                  <input
                    id="ast-wexp"
                    type="date"
                    value={form.warrantyExpiryDate}
                    onChange={(e) => setForm({ ...form, warrantyExpiryDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-vendor" className="block text-xs font-medium text-slate-700 mb-1">
                    Vendor Name
                  </label>
                  <input
                    id="ast-vendor"
                    type="text"
                    value={form.vendorName}
                    onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-inv" className="block text-xs font-medium text-slate-700 mb-1">
                    Invoice Number
                  </label>
                  <input
                    id="ast-inv"
                    type="text"
                    value={form.invoiceNumber}
                    onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ast-loc" className="block text-xs font-medium text-slate-700 mb-1">
                    Current Location *
                  </label>
                  {locations.length > 0 ? (
                    <select
                      id="ast-loc"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {!locations.some((l) => l.name === form.location) && form.location && (
                        <option value={form.location}>{form.location}</option>
                      )}
                      {locations.map((l) => (
                        <option key={l.id} value={l.name}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="ast-loc"
                      type="text"
                      required
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="e.g. Head Office"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  )}
                </div>
                <div>
                  <label htmlFor="ast-cond" className="block text-xs font-medium text-slate-700 mb-1">
                    Condition
                  </label>
                  <select
                    id="ast-cond"
                    value={form.condition}
                    onChange={(e) => setForm({ ...form, condition: e.target.value as AssetCondition })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {ASSET_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ast-status" className="block text-xs font-medium text-slate-700 mb-1">
                    Lifecycle Status
                  </label>
                  <select
                    id="ast-status"
                    value={form.status}
                    disabled={editingAsset?.status === 'Assigned'}
                    onChange={(e) => setForm({ ...form, status: e.target.value as AssetStatus })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  >
                    {ASSET_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ast-image" className="block text-xs font-medium text-slate-700 mb-1">
                    Asset Image
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{form.imageUrl ? 'Change Image' : 'Upload Photo'}</span>
                    <input
                      id="ast-image"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              <div>
                <label htmlFor="ast-notes" className="block text-xs font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  id="ast-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <QrCodeModal asset={qrAsset} onClose={() => setQrAsset(null)} />

      <ExcelImportModal
        open={showImportModal}
        target="assets"
        existingAssets={assets}
        locations={locations.map((l) => l.name)}
        onClose={() => setShowImportModal(false)}
        onImportAssets={bulkImportAssets}
      />

      <ConfirmDialog
        open={Boolean(confirmRetire)}
        title={`Change Asset Status to "${confirmRetire?.nextStatus}"?`}
        description={`Confirm transitioning ${confirmRetire?.asset.assetCode} (${confirmRetire?.asset.name}) to ${confirmRetire?.nextStatus}. This action is recorded in the permanent audit log.`}
        confirmLabel={`Confirm ${confirmRetire?.nextStatus || ''}`}
        tone={confirmRetire?.nextStatus === 'Lost' ? 'danger' : 'primary'}
        onCancel={() => setConfirmRetire(null)}
        onConfirm={async () => {
          if (!confirmRetire) return;
          await updateAssetStatusDirect(confirmRetire.asset.id, confirmRetire.nextStatus);
          if (selectedAsset?.id === confirmRetire.asset.id) {
            setSelectedAsset({ ...confirmRetire.asset, status: confirmRetire.nextStatus });
          }
          setConfirmRetire(null);
        }}
      />
    </div>
  );
};
