import { EXPECTED_GOOGLE_EMAIL, getAuthorizedGoogleClient } from '@/lib/google/auth';
import { importStatementPdf, type StatementImportResult } from './statementImport';

type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = { id?: string; payload?: GmailPart };

function statementAlias(): string {
  const [local, domain] = EXPECTED_GOOGLE_EMAIL.split('@');
  return `${local}+vira@${domain}`;
}

function pdfParts(part?: GmailPart): GmailPart[] {
  if (!part) return [];
  const own = part.filename && (part.mimeType === 'application/pdf' || part.filename.toLowerCase().endsWith('.pdf'))
    ? [part]
    : [];
  return [...own, ...(part.parts ?? []).flatMap(pdfParts)];
}

function decodeBase64Url(value: string): Uint8Array {
  return Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
}

export async function importGmailStatementAttachments(): Promise<{
  address: string;
  messages: number;
  statements: number;
  imported: number;
  results: StatementImportResult[];
}> {
  const authorized = await getAuthorizedGoogleClient();
  if (!authorized) throw new Error('Google account is not connected.');
  if (!authorized.connection.scopes.includes('https://www.googleapis.com/auth/gmail.readonly')) {
    throw new Error('Gmail read permission is missing. Reconnect Google once.');
  }
  const address = statementAlias();
  const list = await authorized.client.request<{ messages?: Array<{ id?: string }> }>({
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
    params: { maxResults: 50, q: `{to:${address} subject:gpay_statement} has:attachment filename:pdf newer_than:1y` },
  });
  const messageIds = (list.data.messages ?? []).flatMap((item) => item.id ? [item.id] : []);
  const results: StatementImportResult[] = [];
  for (const messageId of messageIds) {
    const message = await authorized.client.request<GmailMessage>({
      url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
      params: { format: 'full' },
    });
    for (const part of pdfParts(message.data.payload)) {
      let data: Uint8Array;
      if (part.body?.data) data = decodeBase64Url(part.body.data);
      else if (part.body?.attachmentId) {
        const attachment = await authorized.client.request<{ data?: string }>({
          url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
        });
        if (!attachment.data.data) continue;
        data = decodeBase64Url(attachment.data.data);
      } else continue;
      results.push(await importStatementPdf(data, part.filename || 'statement.pdf'));
    }
  }
  return {
    address,
    messages: messageIds.length,
    statements: results.length,
    imported: results.reduce((sum, result) => sum + result.imported, 0),
    results,
  };
}
