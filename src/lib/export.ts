export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  width?: number;
}

/** Stops spreadsheet apps executing cell text as a formula. A leading + stays when it starts a phone number. */
export function csvSafe(value: string): string {
  if (/^\+[\d\s()-]+$/.test(value)) return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const cell = (raw: string | number | null | undefined) => {
    if (typeof raw === 'number') return String(raw);
    const text = csvSafe(raw ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    columns.map((c) => cell(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => cell(c.value(row))).join(',')),
  ];
  // The byte order mark tells Excel this is UTF-8, so Bangla names stay readable.
  return `﻿${lines.join('\r\n')}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv<T>(rows: T[], columns: ExportColumn<T>[], fileName: string) {
  downloadBlob(new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' }), fileName);
}

export async function downloadXlsx<T>(rows: T[], columns: ExportColumn<T>[], fileName: string, sheetName = 'Data') {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(14, c.header.length + 2) }));
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  for (const row of rows) sheet.addRow(columns.map((c) => c.value(row) ?? ''));
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName,
  );
}
