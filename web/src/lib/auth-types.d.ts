// Module augmentation — extends NextAuth Session and JWT to carry our role/analystCode

import { UserRole } from '@vrs/db';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      analystCode: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    analystCode: string | null;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    analystCode: string | null;
  }
}
