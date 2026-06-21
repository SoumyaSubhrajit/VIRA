import * as XLSX from 'xlsx';
import path from 'path';

/**
 * Convert an Excel serial date number to a JS Date.
 * Handles Excel's 1900 leap-year bug.
 */
export function excelDateToDate(serial: number): Date {
  // Excel epoch: Jan 0, 1900 → offset 25569 days to Unix epoch
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

/**
 * Read a sheet from an xlsx file and return it as an array of row arrays.
 * @param fileName  Filename relative to the /data directory (e.g. 'gym.xlsx')
 * @param sheetName Sheet name to read
 * @param headerRow 0-indexed row that contains column headers (default: 0)
 */
export function readSheetRaw(
  fileName: string,
  sheetName: string
): unknown[][] {
  const filePath = path.isAbsolute(fileName) 
    ? fileName 
    : path.join(process.cwd(), 'data', fileName);
  const buf = require('fs').readFileSync(filePath);
  const workbook = XLSX.read(buf, { type: 'buffer' });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in "${fileName}". Available: ${workbook.SheetNames.join(', ')}`);
  }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
}

/**
 * Read a sheet and return as array of objects using the first non-empty row as header.
 */
export function readSheetAsObjects(
  fileName: string,
  sheetName: string,
  headerRowIndex = 0
): Record<string, unknown>[] {
  const rows = readSheetRaw(fileName, sheetName);
  const headers = rows[headerRowIndex] as string[];
  const dataRows = rows.slice(headerRowIndex + 1);
  return dataRows
    .filter((row) => row.some((cell) => cell !== null && cell !== ''))
    .map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = (row as unknown[])[i] ?? null;
      });
      return obj;
    });
}
