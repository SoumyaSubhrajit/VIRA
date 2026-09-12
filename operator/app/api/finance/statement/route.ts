import { NextRequest, NextResponse } from 'next/server';
import { importStatementPdf } from '@/lib/finance/statementImport';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('statement');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Attach a PDF in the statement field.' }, { status: 400 });
    if (file.type && file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF statements are accepted.' }, { status: 400 });
    const result = await importStatementPdf(new Uint8Array(await file.arrayBuffer()), file.name);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Statement import failed.';
    console.error('[api/finance/statement]', { message });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
