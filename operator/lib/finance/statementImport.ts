import crypto from 'crypto';
import { PDFParse } from 'pdf-parse';
import {
  financeStatementAlreadyImported,
  recordFinanceStatementImport,
  saveFinanceTransaction,
  type FinanceDirection,
} from './db';

export interface StatementImportResult {
  filename: string;
  duplicate: boolean;
  extracted: number;
  imported: number;
  skipped: number;
}

function categoryFor(text: string): string {
  if (/swiggy|zomato|restaurant|cafe|food|grocery|blinkit|zepto|chicken|hotel/i.test(text)) return 'Food';
  if (/uber|ola|rapido|fuel|petrol|metro|irctc|railway|travel|bus/i.test(text)) return 'Transport';
  if (/rent|landlord|housing/i.test(text)) return 'Rent';
  if (/gym|fitness/i.test(text)) return 'Gym';
  if (/netflix|spotify|movie|bookmyshow|entertainment|game/i.test(text)) return 'Entertainment';
  return 'Misc';
}

function parseDate(value: string): string | null {
  const cleaned = value.replace(/\bat\b/i, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  const match = cleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(.*)$/);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  const fallback = new Date(`${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')} ${match[4] || ''}`);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

export function parseStatementText(text: string, fingerprint: string) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const transactions: Array<{
    sourceId: string; source: 'statement'; amount: number; direction: FinanceDirection;
    merchant: string; category: string; occurredAt: string; reference: string | null;
    subject: string; sender: string;
  }> = [];
  const seen = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    const reference = lines[index].match(/^UPI Transaction ID[:#\s-]*([A-Z0-9-]{6,35})$/i)?.[1];
    if (!reference || seen.has(reference)) continue;
    const before = lines.slice(Math.max(0, index - 6), index);
    const after = lines.slice(index + 1, Math.min(lines.length, index + 5));
    const transactionDetail = [...before].reverse().find((line) => /^(?:paid to|sent to|payment to|received from|credited|refunded|self transfer to)\b/i.test(line));
    if (!transactionDetail || /^self transfer to\b/i.test(transactionDetail)) continue;
    const amountMatch = after.map((line) => line.match(/^(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/i)).find(Boolean);
    if (!amountMatch) continue;
    const direction: FinanceDirection = /^(?:received from|credited|refunded)\b/i.test(transactionDetail) ? 'credit' : 'debit';
    const amount = Number(amountMatch[1].replaceAll(',', ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const month = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';
    const dateLine = [...before].reverse().find((line) => new RegExp(`^(?:\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}|${month}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+${month},?\\s+\\d{4})$`, 'i').test(line));
    const timeLine = dateLine ? before[before.indexOf(dateLine) + 1]?.match(/^\d{1,2}:\d{2}\s*(?:AM|PM)$/i)?.[0] : null;
    const dateText = dateLine ? `${dateLine} ${timeLine ?? ''}` : null;
    const occurredAt = dateText ? parseDate(dateText) : null;
    if (!occurredAt) continue;
    const named = transactionDetail.match(/^(?:paid to|sent to|payment to|received from)\s+(.+)$/i)?.[1]?.trim();
    const merchant = named?.slice(0, 100) || 'Unknown';
    seen.add(reference);
    const block = [...before, lines[index], ...after].join(' ');
    transactions.push({
      sourceId: `statement:${fingerprint}:${reference}`,
      source: 'statement', amount, direction, merchant,
      category: categoryFor(`${merchant} ${block}`), occurredAt, reference,
      subject: 'Imported statement', sender: 'PDF statement',
    });
  }
  return transactions;
}

export async function importStatementPdf(data: Uint8Array, filename: string): Promise<StatementImportResult> {
  if (data.byteLength < 5 || Buffer.from(data.subarray(0, 5)).toString('ascii') !== '%PDF-') {
    throw new Error('The selected file is not a valid PDF.');
  }
  if (data.byteLength > 15 * 1024 * 1024) throw new Error('Statement PDF must be 15 MB or smaller.');
  const fingerprint = crypto.createHash('sha256').update(data).digest('hex');
  if (await financeStatementAlreadyImported(fingerprint)) {
    return { filename, duplicate: true, extracted: 0, imported: 0, skipped: 0 };
  }
  const parser = new PDFParse({ data });
  let text = '';
  try {
    text = (await parser.getText()).text;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    console.error('[finance/statement-pdf]', error);
    if (/password/i.test(message)) throw new Error('This PDF is password-protected. Export an unlocked statement and try again.');
    throw new Error('VIRA could not read this PDF statement.');
  } finally {
    await parser.destroy();
  }
  const transactions = parseStatementText(text, fingerprint);
  if (transactions.length === 0) {
    const diagnosticLines = text.split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => /₹|INR|Rs\.?|paid|received|sent|transaction|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(line))
      .slice(0, 160);
    console.error('[finance/statement-format]', diagnosticLines);
    throw new Error('No recognizable Google Pay transactions were found in this PDF.');
  }
  let imported = 0;
  for (const transaction of transactions) if (await saveFinanceTransaction(transaction)) imported += 1;
  await recordFinanceStatementImport(fingerprint, filename, transactions.length);
  return { filename, duplicate: false, extracted: transactions.length, imported, skipped: transactions.length - imported };
}
