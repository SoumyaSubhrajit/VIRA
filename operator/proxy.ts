import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticationConfigured, SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/cron/tick',
  '/api/scheduler/dispatch',
  '/api/gym/dispatch',
  '/api/finance/dispatch',
  '/api/finance/import',
  '/api/notion/sync',
  '/api/finance/device',
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const authenticated = isAuthenticationConfigured()
    && await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (authenticated || (!isAuthenticationConfigured() && process.env.NODE_ENV !== 'production')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
