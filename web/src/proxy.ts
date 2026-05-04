// Next.js 16 — replaces middleware.ts. The function is named `proxy` (not `middleware`).
// NextAuth's `auth` middleware checks the JWT cookie and routes unauthenticated users
// to /login per the `authorized` callback in /auth.ts.

export { auth as proxy } from '../auth';

export const config = {
  // Run on every path EXCEPT NextAuth API routes, _next assets, favicon, and the login page itself.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)'],
};
