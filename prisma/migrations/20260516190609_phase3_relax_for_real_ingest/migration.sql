-- AlterTable
ALTER TABLE "RebateProgram" ALTER COLUMN "source" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RebateType" ALTER COLUMN "source" DROP NOT NULL,
ALTER COLUMN "merchType" DROP NOT NULL;
