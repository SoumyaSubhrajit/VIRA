import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'The old 6:30 AM gym email has been retired. Use the protected /api/gym/dispatch sequence.' },
    { status: 410 },
  );
}
