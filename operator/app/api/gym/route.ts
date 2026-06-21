import { NextResponse } from 'next/server';
import { getGymData } from '@/lib/gymData';

export async function GET() {
  try {
    const data = getGymData('default-user');
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/gym]', err);
    return NextResponse.json(
      { error: 'Failed to load gym data', detail: String(err) },
      { status: 500 }
    );
  }
}
