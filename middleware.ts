import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let the login page through — otherwise we'd get an infinite redirect loop
  if (pathname === '/app/login') {
    return NextResponse.next();
  }

  const session      = req.cookies.get('strix-session')?.value ?? '';
  const sessionToken = process.env.AUTH_TOKEN ?? '';

  // If no token configured yet, allow through (dev convenience)
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
  matcher: ['/app/:path*'],
};
