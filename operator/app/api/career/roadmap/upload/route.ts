import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { importCareerRoadmap } from '@/lib/careerRoadmap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('roadmap');
    const goalTitle = String(formData.get('goalTitle') ?? '').trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Upload a PDF, Markdown, or text file.' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be 10 MB or smaller.' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    let rawText = '';

    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const parser = new PDFParse({ data: bytes });
      try {
        rawText = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    } else {
      rawText = bytes.toString('utf-8');
    }

    const snapshot = await importCareerRoadmap({
      goalTitle: goalTitle || undefined,
      rawText,
    });
    return NextResponse.json({ snapshot });
  } catch (error) {
    console.error('[api/career/roadmap/upload POST]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Roadmap upload failed' },
      { status: 400 },
    );
  }
}
