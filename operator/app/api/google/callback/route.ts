import { NextRequest, NextResponse } from 'next/server';
import {
  EXPECTED_GOOGLE_EMAIL,
  GOOGLE_SCOPES,
  createGoogleOAuthClient,
  encryptGoogleTokens,
  googleRedirectUri,
} from '@/lib/google/auth';
import { saveGoogleConnection } from '@/lib/google/db';
import { updateSchedulerSettings } from '@/lib/scheduler/db';

export const runtime = 'nodejs';

interface GoogleUserInfo {
  email?: string;
}

interface GoogleTaskList {
  id?: string;
  title?: string;
}

function schedulerRedirect(params: Record<string, string>): URL {
  const url = new URL('/scheduler', googleRedirectUri());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

export async function GET(request: NextRequest) {
  const storedState = request.cookies.get('vira_google_oauth_state')?.value;
  const returnedState = request.nextUrl.searchParams.get('state');
  const code = request.nextUrl.searchParams.get('code');
  const oauthError = request.nextUrl.searchParams.get('error');

  if (oauthError) return NextResponse.redirect(schedulerRedirect({ google: 'error', reason: oauthError }));
  if (!storedState || !returnedState || storedState !== returnedState || !code) {
    return NextResponse.redirect(schedulerRedirect({ google: 'error', reason: 'invalid_oauth_state' }));
  }

  try {
    const client = createGoogleOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const user = await client.request<GoogleUserInfo>({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo',
    });
    const email = user.data.email?.toLowerCase();
    if (!email || email !== EXPECTED_GOOGLE_EMAIL) {
      await client.revokeCredentials().catch(() => undefined);
      return NextResponse.redirect(schedulerRedirect({ google: 'wrong-account', expected: EXPECTED_GOOGLE_EMAIL }));
    }

    const taskLists = await client.request<{ items?: GoogleTaskList[] }>({
      url: 'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100',
    });
    let taskList = taskLists.data.items?.find((item) => item.title === 'VIRA Daily Command') ?? null;
    if (!taskList) {
      const created = await client.request<GoogleTaskList>({
        url: 'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
        method: 'POST',
        data: { title: 'VIRA Daily Command' },
      });
      taskList = created.data;
    }
    if (!taskList.id) throw new Error('Google Tasks did not return a task-list ID.');

    await saveGoogleConnection({
      email,
      encryptedTokens: encryptGoogleTokens(tokens),
      scopes: tokens.scope?.split(' ') ?? [...GOOGLE_SCOPES],
      taskListId: taskList.id,
      taskListTitle: taskList.title ?? 'VIRA Daily Command',
      calendarId: 'primary',
      calendarSyncEnabled: true,
      tasksSyncEnabled: true,
      gmailSendEnabled: true,
    });
    await updateSchedulerSettings({ reminderEmail: email, emailEnabled: true });

    const response = NextResponse.redirect(schedulerRedirect({ google: 'connected' }));
    response.cookies.delete('vira_google_oauth_state');
    return response;
  } catch (error) {
    console.error('[google/callback]', error);
    return NextResponse.redirect(schedulerRedirect({ google: 'error', reason: 'connection_failed' }));
  }
}
