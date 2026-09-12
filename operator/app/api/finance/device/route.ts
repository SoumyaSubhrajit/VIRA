import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { saveFinanceTransaction } from '@/lib/finance/db';

export const runtime = 'nodejs';

type DeviceTransaction = {
  eventId?: unknown;
  packageName?: unknown;
  amount?: unknown;
  direction?: unknown;
  merchant?: unknown;
  occurredAt?: unknown;
};

function reject(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const configuredToken = process.env.VIRA_DEVICE_TOKEN;
  if (!configuredToken || configuredToken.length < 24) return reject('Device capture is not configured on the server.', 503);
  if (request.headers.get('authorization') !== `Bearer ${configuredToken}`) return reject('Unauthorized device.', 401);
  try {
    const body = await request.json() as DeviceTransaction;
    const packageName = typeof body.packageName === 'string' ? body.packageName.trim().slice(0, 160) : '';
    const merchant = typeof body.merchant === 'string' ? body.merchant.trim().replace(/\s+/g, ' ').slice(0, 160) : '';
    const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
    const direction = body.direction === 'credit' || body.direction === 'debit' ? body.direction : '';
    const occurredAt = typeof body.occurredAt === 'string' ? body.occurredAt : '';
    const timestamp = Date.parse(occurredAt);
    if (!packageName || !merchant || !Number.isFinite(amount) || amount <= 0 || amount > 100000000 || !direction || !Number.isFinite(timestamp)) return reject('Invalid device transaction.');
    if (timestamp < Date.now() - 1000 * 60 * 60 * 24 * 45 || timestamp > Date.now() + 1000 * 60 * 10) return reject('Transaction timestamp outside the accepted window.');
    const event = typeof body.eventId === 'string' ? body.eventId.slice(0, 200) : `${packageName}|${occurredAt}|${amount}|${direction}|${merchant}`;
    const sourceId = `device:${crypto.createHash('sha256').update(event).digest('hex')}`;
    const inserted = await saveFinanceTransaction({ sourceId, source: 'device', amount, direction, merchant, category: 'Unclassified', occurredAt: new Date(timestamp).toISOString(), reference: null, subject: 'Android payment notification', sender: packageName });
    return NextResponse.json({ ok: true, inserted, sourceId });
  } catch (error) {
    console.error('[api/finance/device]', error);
    return reject('Could not save device transaction.');
  }
}

export async function GET(request: NextRequest) {
  const configuredToken = process.env.VIRA_DEVICE_TOKEN;
  if (!configuredToken || configuredToken.length < 24) return reject('Device capture is not configured on the server.', 503);
  if (request.headers.get('authorization') !== `Bearer ${configuredToken}`) return reject('Unauthorized device.', 401);
  return NextResponse.json({ ok: true, service: 'finance-device', serverTime: new Date().toISOString() });
}
