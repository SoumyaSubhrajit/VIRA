import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedGoogleClient, getGoogleConnectionStatus } from '@/lib/google/auth';
import { deleteGoogleConnection, updateGoogleConnection } from '@/lib/google/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(getGoogleConnectionStatus());
  } catch (error) {
    console.error('[api/google/status GET]', error);
    return NextResponse.json({ error: 'Failed to read Google connection status.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const update: Record<string, boolean> = {};
    for (const key of ['calendarSyncEnabled', 'tasksSyncEnabled', 'gmailSendEnabled'] as const) {
      if (key in body) {
        if (typeof body[key] !== 'boolean') return NextResponse.json({ error: `${key} must be true or false.` }, { status: 400 });
        update[key] = body[key];
      }
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No Google preference was provided.' }, { status: 400 });
    const connection = updateGoogleConnection(update);
    if (!connection) return NextResponse.json({ error: 'Google account is not connected.' }, { status: 409 });
    return NextResponse.json(getGoogleConnectionStatus());
  } catch (error) {
    console.error('[api/google/status PATCH]', error);
    return NextResponse.json({ error: 'Failed to update Google preferences.' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const authorized = getAuthorizedGoogleClient();
    if (authorized) await authorized.client.revokeCredentials().catch(() => undefined);
    deleteGoogleConnection();
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[api/google/status DELETE]', error);
    return NextResponse.json({ error: 'Failed to disconnect Google.' }, { status: 500 });
  }
}
