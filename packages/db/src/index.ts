import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// Explicit named re-exports — `export *` from @prisma/client (CJS) makes
// Turbopack emit runtime-interop code and warns on every server render.
// Only these enums + the Prisma namespace are consumed via @vrs/db.
export {
  Prisma,
  PrismaClient,
  Source,
  MerchType,
  AgreementStatus,
  CalculateResultStatus,
  UserRole,
  FunctionType,
  TargetSystem,
  NotificationType,
} from '@prisma/client';
