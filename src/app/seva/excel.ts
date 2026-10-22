/** Excel sheet names cannot hold : \ / ? * [ ], and file names cannot hold \ / : * ? " < > | (a coordinator may be named anything). */
export function safeName(name: string, max: number): string {
  return (
    name
      .replace(/[\\/:*?"<>|[\]\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^['\s.]+|['\s.]+$/g, '')
      .slice(0, max)
      .trim() || 'Export'
  );
}

/**
 * Builds and downloads an .xlsx file. The xlsx library is loaded only when someone exports.
 * Every value is written as a typed cell, so text such as "=SUM(A1)" stays text and is never run as a formula.
 */
export async function downloadExcel(rows: Record<string, unknown>[], sheet: string, fileName: string): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] ?? {}).map(k => ({ wch: Math.min(40, Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeName(sheet, 31));
  XLSX.writeFile(wb, safeName(fileName.replace(/\.xlsx$/i, ''), 120) + '.xlsx');
}

export function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
}
