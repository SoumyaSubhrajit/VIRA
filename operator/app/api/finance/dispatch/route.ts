import { NextRequest, NextResponse } from 'next/server';
import { dispatchFinanceEmail } from '@/lib/finance/email';
export const runtime='nodejs';
export async function POST(request:NextRequest) {
  if(!process.env.SCHEDULER_SECRET || request.headers.get('authorization')!==`Bearer ${process.env.SCHEDULER_SECRET}`) return NextResponse.json({error:'Unauthorized'},{status:401});
  return NextResponse.json(await dispatchFinanceEmail());
}
