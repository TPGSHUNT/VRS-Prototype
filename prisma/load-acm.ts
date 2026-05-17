// Standalone, idempotent, NON-DESTRUCTIVE loader for the real
// AcctControlMaster routing matrix (VRS_DATA_ROUND_4.xlsx → committed
// fixture). Touches ONLY RebateType (additive, skipDuplicates) and
// AcctControlMaster (a reference table) — never the real Phase 3.1 ingest.
// Safe to run against the live real-ingest DB. Re-runnable: it clears and
// reloads AcctControlMaster only. See memory
// project_db_holds_real_ingest_seed_is_destructive — do NOT use db:seed here.
import { readFileSync } from 'node:fs';
import { PrismaClient, type FunctionType, type TargetSystem } from '@prisma/client';

const prisma = new PrismaClient();

interface AcmFixture {
  rebateTypeCodes: string[];
  entries: {
    seq: number;
    rebateTypeCode: string;
    merchType: string;
    rebateSource: string;
    acctType: string;
    functionType: FunctionType;
    targetSystem: TargetSystem;
    transactionTypeCode: string;
    accountCode: string | null;
    accountOffset: string | null;
    costCenter: string;
    costOffset: string | null;
    reverseSign: boolean;
    reverse: boolean;
  }[];
}

async function main() {
  const ACM: AcmFixture = JSON.parse(
    readFileSync(new URL('./fixtures/acct-control-master.json', import.meta.url), 'utf-8'),
  );

  const before = await prisma.acctControlMaster.count();
  const calcBefore = await prisma.calculateResult.count();
  console.log(`AcctControlMaster before: ${before} | CalculateResult (must be unchanged): ${calcBefore}`);

  // 1. Ensure the 203 real rebate_type codes exist for the FK. Additive only.
  const existing = new Set(
    (await prisma.rebateType.findMany({ select: { code: true } })).map((r) => r.code),
  );
  const missing = ACM.rebateTypeCodes.filter((c) => !existing.has(c));
  const rtAdded = await prisma.rebateType.createMany({
    data: missing.map((code) => ({
      code,
      description: `${code} (real rebate type — VRS_DATA_ROUND_4)`,
    })),
    skipDuplicates: true,
  });
  console.log(`RebateType: ${existing.size} existing, +${rtAdded.count} added (real ACM codes)`);

  // 2. Reload AcctControlMaster (reference table) from the fixture.
  await prisma.acctControlMaster.deleteMany();
  const acmAdded = await prisma.acctControlMaster.createMany({ data: ACM.entries });
  console.log(`AcctControlMaster: loaded ${acmAdded.count} rows`);

  const calcAfter = await prisma.calculateResult.count();
  if (calcAfter !== calcBefore) throw new Error(`SAFETY: CalculateResult changed ${calcBefore}→${calcAfter}`);
  console.log(`CalculateResult unchanged: ${calcAfter} ✓`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
