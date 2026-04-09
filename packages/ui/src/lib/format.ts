/**
 * Data value formatting helpers.
 *
 * Data in NetCrawl is treated like storage: values are shown using byte-style
 * units (B / kB / MB / GB). One "data" unit = 1 byte.
 */

/** Format a data value with byte-style units (B / kB / MB / GB). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) return `${sign}${Math.round(abs)} B`;
  if (abs < 1_000_000) return `${sign}${(abs / 1000).toFixed(1)} kB`;
  if (abs < 1_000_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} MB`;
  return `${sign}${(abs / 1_000_000_000).toFixed(1)} GB`;
}

/** Format any resource value; uses byte units for `data`, raw number otherwise. */
export function formatResource(kind: string, value: number): string {
  if (kind === 'data') return formatBytes(value);
  return String(Math.round(value));
}
