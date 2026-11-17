import React, { useEffect, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import type { Asset } from '../types/eams';
import { generateAssetQrCodeDataUrl } from '../utils/assetQr';

interface QrCodeModalProps {
  asset: Asset | null;
  onClose: () => void;
}

function BarcodePattern({ value }: { value: string }) {
  // Deterministic visual Code-128 style bar pattern from string char codes
  const bars: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    bars.push((code % 3) + 1, ((code >> 2) % 2) + 1, ((code >> 4) % 3) + 1);
  }
  let x = 4;
  return (
    <svg viewBox="0 0 220 42" className="w-48 h-10" aria-label={`Barcode for ${value}`}>
      {bars.map((w, idx) => {
        const curX = x;
        x += w * 2 + 1.5;
        if (curX > 214) return null;
        return idx % 2 === 0 ? (
          <rect key={idx} x={curX} y={2} width={w * 1.4} height={34} fill="#0f172a" />
        ) : null;
      })}
    </svg>
  );
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({ asset, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [scanUrl, setScanUrl] = useState<string>('');

  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    generateAssetQrCodeDataUrl(asset, { width: 220 })
      .then((res) => {
        if (!cancelled) {
          setQrDataUrl(res.dataUrl);
          setScanUrl(res.scanUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl('');
          setScanUrl('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [asset]);

  if (!asset) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 no-print">
          <h2 id="qr-modal-title" className="text-base font-semibold text-slate-900">
            Asset Tag & QR Label
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR tag modal"
            className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center space-y-4">
          <div className="w-full border border-slate-200 rounded-xl p-5 bg-slate-50/70 flex flex-col items-center space-y-3">
            <div className="text-xs font-medium text-slate-500">AssetLedger Property Tag</div>
            <div className="text-lg font-bold font-mono text-slate-900 tracking-tight">
              {asset.assetCode}
            </div>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${asset.assetCode}`}
                className="w-40 h-40 border border-slate-200 rounded-lg bg-white p-1.5"
              />
            ) : (
              <div className="w-40 h-40 border border-slate-200 rounded-lg bg-white flex items-center justify-center text-xs text-slate-400">
                Generating QR...
              </div>
            )}
            <div className="text-sm font-semibold text-slate-900">{asset.name}</div>
            <div className="text-xs text-slate-500 font-mono">S/N: {asset.serialNumber}</div>
            {scanUrl && (
              <div className="text-[11px] font-mono text-slate-500 break-all max-w-xs">
                {scanUrl}
              </div>
            )}
            <BarcodePattern value={asset.assetCode} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-50 border-t border-slate-200 no-print">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Close
          </button>
          {qrDataUrl && (
            <a
              href={qrDataUrl}
              download={`${asset.assetCode}-qr.png`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              Download PNG
            </a>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Tag
          </button>
        </div>
      </div>
    </div>
  );
};
