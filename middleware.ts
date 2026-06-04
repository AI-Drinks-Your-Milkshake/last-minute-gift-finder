import { NextRequest, NextResponse } from 'next/server';

// The gift finder (/app) is PUBLIC — anyone can use it without logging in.
// The shared password now only gates the operator/admin pages (e.g. the
// signups list). "Admin" everywhere else = simply holding a valid
// strix-session cookie (see app/(app)/app/page.tsx). Pinterest / Pin Preview
// are hidden for non-admins rather than redirected.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const session      = req.cookies.get('strix-session')?.value ?? '';
  const sessionToken = process.env.AUTH_TOKEN ?? '';

  // If no token configured yet, allow through (dev convenience).
  if (!sessionToken) {
    return NextResponse.next();
  }

  if (session !== sessionToken) {
    const loginUrl = new URL('/app/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Admin-only routes. The public wizard at /app is intentionally NOT matched.
  matcher: ['/app/signups', '/app/signups/:path*'],
};
