-- AlterEnum
ALTER TYPE "FunctionType" ADD VALUE 'RECEIVED';

-- DropIndex
DROP INDEX "AcctControlMaster_rebateTypeCode_functionType_targetSystem_key";

-- AlterTable
ALTER TABLE "AcctControlMaster" ADD COLUMN     "accountOffset" TEXT,
ADD COLUMN     "acctType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "costOffset" TEXT,
ADD COLUMN     "merchType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rebateSource" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reverse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reverseSign" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seq" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "accountCode" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AcctControlMaster_rebateTypeCode_functionType_targetSystem_idx" ON "AcctControlMaster"("rebateTypeCode", "functionType", "targetSystem");
