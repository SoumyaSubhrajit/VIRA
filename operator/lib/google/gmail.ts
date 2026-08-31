import crypto from 'crypto';
import { getAuthorizedGoogleClient } from './auth';

export interface GmailDeliveryResult {
  attempted: boolean;
  sent: boolean;
  messageId?: string;
  error?: string;
}

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function sendWithConnectedGmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<GmailDeliveryResult> {
  try {
    const authorized = getAuthorizedGoogleClient();
    if (!authorized || !authorized.connection.gmailSendEnabled) {
      return { attempted: false, sent: false };
    }

    const boundary = `vira_${crypto.randomBytes(12).toString('hex')}`;
    const message = [
      `From: VIRA Mission Control <${authorized.connection.email}>`,
      `To: ${input.to}`,
      `Subject: ${encodeSubject(input.subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      input.text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      input.html,
      '',
      `--${boundary}--`,
    ].join('\r\n');
    const response = await authorized.client.request<{ id?: string }>({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      method: 'POST',
      data: { raw: base64Url(message) },
    });
    return { attempted: true, sent: true, messageId: response.data.id ?? undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gmail send failed.';
    console.error('[google/gmail] Send failed', { message });
    return { attempted: true, sent: false, error: message };
  }
}
