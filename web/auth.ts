// NextAuth v5 (Auth.js) — credentials provider for role-sim.
// In production this swaps for Azure Entra ID SAML; the rest of the auth surface stays.
//
// Role-sim mode: clicking a role card on the login page sends the seeded user's email here.
// We accept any email that matches a seeded active user (no password required for the prototype).

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@vrs/db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'role-sim',
      credentials: {
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        if (!email || typeof email !== 'string') return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          analystCode: user.analystCode,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.analystCode = user.analystCode;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as never;
        session.user.analystCode = (token.analystCode as string | null) ?? null;
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const isOnLogin = request.nextUrl.pathname.startsWith('/login');
      if (isOnLogin) return true;
      return !!session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
