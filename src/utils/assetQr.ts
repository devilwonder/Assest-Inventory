import QRCode from 'qrcode';
import type { Asset } from '../types/eams';

export interface GeneratedAssetQr {
  assetCode: string;
  scanUrl: string;
  dataUrl: string;
}

/**
 * Builds the canonical deep-link URL encoded inside each asset's unique QR code
 * so mobile device cameras can scan and jump straight to the asset's detail view.
 */
export function buildAssetScanUrl(assetCode: string, origin?: string): string {
  const cleanCode = assetCode.trim();
  const baseOrigin =
    origin !== undefined
      ? origin
      : typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : '';
  const query = `?asset=${encodeURIComponent(cleanCode)}`;
  return baseOrigin ? `${baseOrigin.replace(/\/+$/, '')}/${query}` : query;
}

/**
 * Extracts an asset code from a URL search string (e.g. "?asset=AST-2026-0001").
 */
export function parseAssetCodeFromSearch(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const code = params.get('asset')?.trim();
  return code ? code : null;
}

/**
 * Generates a unique, high-contrast QR code PNG data URL for an asset.
 */
export async function generateAssetQrCodeDataUrl(
  asset: Pick<Asset, 'assetCode'>,
  options?: { origin?: string; width?: number }
): Promise<GeneratedAssetQr> {
  const scanUrl = buildAssetScanUrl(asset.assetCode, options?.origin);
  const dataUrl = await QRCode.toDataURL(scanUrl, {
    width: options?.width ?? 220,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
  return {
    assetCode: asset.assetCode,
    scanUrl,
    dataUrl,
  };
}
