export function formatBytes(value: number | null) {
  if (value === null) return 'Size unknown';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(value > 1024 * 100 ? 0 : 1)} KiB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(value > 1024 * 1024 * 100 ? 0 : 1)} MiB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(value > 1024 * 1024 * 1024 * 100 ? 0 : 1)} GiB`;
}
