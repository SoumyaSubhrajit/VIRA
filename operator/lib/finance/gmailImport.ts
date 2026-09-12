import { getAuthorizedGoogleClient } from '@/lib/google/auth';
import { getExistingFinanceSourceIds, saveFinanceTransaction, setFinanceImportState, type FinanceDirection } from './db';

type GmailHeader = { name?: string; value?: string };
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailMessage = { id?: string; internalDate?: string; payload?: GmailPart & { headers?: GmailHeader[] } };

function decodeBase64Url(value: string): string {
  return Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8');
}

function messageText(part?: GmailPart): string {
  if (!part) return '';
  const own = part.body?.data && (part.mimeType === 'text/plain' || part.mimeType === 'text/html')
    ? decodeBase64Url(part.body.data)
    : '';
  return [own, ...(part.parts ?? []).map(messageText)].filter(Boolean).join('\n')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function header(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function categoryFor(text: string): string {
  if (/swiggy|zomato|restaurant|cafe|food|grocery|blinkit|zepto/i.test(text)) return 'Food';
  if (/uber|ola|rapido|fuel|petrol|metro|irctc|railway/i.test(text)) return 'Transport';
  if (/rent|landlord/i.test(text)) return 'Rent';
  if (/gym|fitness/i.test(text)) return 'Gym';
  if (/netflix|spotify|movie|bookmyshow|entertainment/i.test(text)) return 'Entertainment';
  return 'Misc';
}

function credibleFinancialSender(sender: string): boolean {
  return /(?:bank|payments?|paytm|phonepe|googlepay|gpay|razorpay|upi|slice|jupiter|money|finance|wallet|card|credit|debit)/i.test(sender);
}

export function parseTransactionEmail(input: { sourceId: string; subject: string; sender: string; body: string; occurredAt: string }) {
  const text = `${input.subject} ${input.body}`.replace(/\s+/g, ' ');
  const subjectLooksFinancial = /(?:transaction|debited|credited|payment|purchase|spent|refund|UPI)/i.test(input.subject);
  if (!credibleFinancialSender(input.sender) && !subjectLooksFinancial) return null;

  const currency = '(?:INR|Rs\\.?|₹)';
  const number = '([0-9][0-9,]*(?:\\.[0-9]{1,2})?)';
  const debitAction = '(?:debited|spent|paid|withdrawn|purchased|sent)';
  const creditAction = '(?:credited|received|deposited|refunded)';
  const patterns: Array<{ direction: FinanceDirection; regex: RegExp; amountGroup: number }> = [
    { direction: 'debit', regex: new RegExp(`${currency}\\s*${number}[^.]{0,55}?${debitAction}`, 'i'), amountGroup: 1 },
    { direction: 'debit', regex: new RegExp(`${debitAction}[^.]{0,55}?${currency}\\s*${number}`, 'i'), amountGroup: 1 },
    { direction: 'credit', regex: new RegExp(`${currency}\\s*${number}[^.]{0,55}?${creditAction}`, 'i'), amountGroup: 1 },
    { direction: 'credit', regex: new RegExp(`${creditAction}[^.]{0,55}?${currency}\\s*${number}`, 'i'), amountGroup: 1 },
  ];
  const detected = patterns.map((item) => ({ ...item, match: text.match(item.regex) })).find((item) => item.match);
  if (!detected?.match) return null;
  const direction = detected.direction;
  const amount = Number(detected.match[detected.amountGroup].replaceAll(',', ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const merchant = text.match(/\b(?:at|to|from|towards)\s+([A-Z0-9][A-Z0-9 .&@_-]{2,45}?)(?=\s+(?:on|using|via|ref|UPI|from|for|\.))/i)?.[1]?.trim() ?? 'Unknown';
  const reference = text.match(/\b(?:UPI ref(?:erence)?|UTR|transaction ID|txn ID|reference(?: no)?)[:#\s-]*([A-Z0-9-]{6,35})/i)?.[1] ?? null;
  return {
    sourceId: input.sourceId, source: 'gmail' as const, amount, direction, merchant,
    category: categoryFor(`${merchant} ${text}`), occurredAt: input.occurredAt,
    reference, subject: input.subject, sender: input.sender,
  };
}

export async function importGmailTransactions(): Promise<{ scanned: number; imported: number; skipped: number }> {
  const authorized = await getAuthorizedGoogleClient();
  if (!authorized) throw new Error('Google account is not connected.');
  if (!authorized.connection.scopes.includes('https://www.googleapis.com/auth/gmail.readonly')) {
    throw new Error('Gmail read permission is missing. Reconnect Google once to authorize finance imports.');
  }
  try {
    const list = await authorized.client.request<{ messages?: Array<{ id?: string }> }>({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
      params: { maxResults: 250, q: 'newer_than:30d -in:sent {subject:debited subject:credited subject:payment subject:transaction subject:UPI}' },
    });
    const listedIds = (list.data.messages ?? []).flatMap((item) => item.id ? [item.id] : []);
    const existingIds = await getExistingFinanceSourceIds(listedIds);
    const ids = listedIds.filter((id) => !existingIds.has(id));
    let imported = 0;
    let skipped = existingIds.size;
    for (let offset = 0; offset < ids.length; offset += 20) {
      const messages = await Promise.all(ids.slice(offset, offset + 20).map(async (id) => {
        const response = await authorized.client.request<GmailMessage>({
          url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`,
          params: { format: 'full' },
        });
        return response.data;
      }));
      for (const message of messages) {
        if (!message.id) continue;
        const transaction = parseTransactionEmail({
          sourceId: message.id,
          subject: header(message, 'Subject'),
          sender: header(message, 'From'),
          body: messageText(message.payload),
          occurredAt: new Date(Number(message.internalDate || Date.now())).toISOString(),
        });
        if (transaction && await saveFinanceTransaction(transaction)) imported += 1;
        else skipped += 1;
      }
    }
    await setFinanceImportState(null);
    return { scanned: listedIds.length, imported, skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gmail finance import failed.';
    await setFinanceImportState(message);
    throw error;
  }
}
