import { NextResponse } from 'next/server';
import { getCareerData } from '@/lib/careerData';

export async function GET() {
  try {
    const data = getCareerData('default-user');
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/career]', err);
    return NextResponse.json(
      { error: 'Failed to load career data', detail: String(err) },
      { status: 500 }
    );
  }
}
