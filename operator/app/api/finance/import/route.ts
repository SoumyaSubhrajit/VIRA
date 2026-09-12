import { NextRequest, NextResponse } from 'next/server';
import { importGmailTransactions } from '@/lib/finance/gmailImport';
import { importGmailStatementAttachments } from '@/lib/finance/gmailStatementImport';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.SCHEDULER_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const [alerts, statements] = await Promise.all([
      importGmailTransactions(),
      importGmailStatementAttachments(),
    ]);
    return NextResponse.json({ alerts, statements });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Finance import failed.';
    console.error('[api/finance/import]', { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
