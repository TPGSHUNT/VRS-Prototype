-- CreateEnum
CREATE TYPE "Source" AS ENUM ('R', 'S', 'D', 'B', 'F', 'C', 'N', 'E', 'Q', 'T');

-- CreateEnum
CREATE TYPE "MerchType" AS ENUM ('ADVCOOP', 'BOPIS', 'CLPSTP', 'COMMISSN', 'COMMTG', 'COTRKT', 'CPRPR', 'CSTINCAF', 'DGMEDIAN', 'DGRACING', 'DMGDC', 'ENDCAP', 'EXCLUSIV', 'FIXTURES', 'FREIGHT', 'FRONTEND', 'LABRFUND', 'MILKICE', 'MKTSTORE', 'MRKDWNC', 'MRKDWNNC', 'NEWITEM', 'NSA', 'OTHER', 'PLCALLOW', 'POSTAUDT', 'PREPAID', 'PRIVBRND', 'RECALL', 'S5S5', 'SCAN', 'SCNBK', 'SIDEWING', 'SUPCHAIN', 'TPR', 'VOLCOKE', 'VOLGRWTH', 'VOLPEPSI', 'VOLUME');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('SUBMITTED_BY_VENDOR', 'PRE_NEGOTIATION', 'PENDING_DMM_APPROVAL', 'PENDING_GMM_APPROVAL', 'PENDING_AP_APPROVAL', 'ASSIGNED', 'EXPIRED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalculateResultStatus" AS ENUM ('OPEN', 'PENDING_REVIEW', 'REVIEWED', 'APPROVED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AP_ANALYST', 'AP_MANAGER', 'BUYER', 'BUYER_DELEGATE', 'DMM', 'GMM', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "ReportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReportJobType" AS ENUM ('REBATE_PROGRAM_EXTRACT', 'UNAPPROVED_EXTRACT', 'HISTORY_EXTRACT', 'EARNINGS_SUMMARY_BY_MERCH_TYPE', 'BATCH_DETAIL_REPORT');

-- CreateEnum
CREATE TYPE "FunctionType" AS ENUM ('ACCRUAL', 'RECLASS', 'PREPAID', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "TargetSystem" AS ENUM ('RSL', 'AP', 'GL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REPORT_COMPLETE', 'REPORT_FAILED', 'QUEUE_PENDING', 'AGREEMENT_APPROVED', 'AGREEMENT_REJECTED', 'PERIOD_CLOSED', 'TIER_ALERT', 'ANOMALY_FLAG');

-- CreateTable
CREATE TABLE "FiscalPeriod" (
    "id" TEXT NOT NULL,
    "fiscalPeriod" INTEGER NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,

    CONSTRAINT "FiscalPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProgramType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateType" (
    "code" TEXT NOT NULL,
    "source" "Source" NOT NULL,
    "merchType" "MerchType" NOT NULL,
    "description" TEXT NOT NULL,
    "usedByMdse" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RebateType_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "vendorNumber" INTEGER NOT NULL,
    "apNumber" TEXT,
    "ipNumber" INTEGER,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "analystCode" TEXT,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPortalUser" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorPortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "agmtId" SERIAL NOT NULL,
    "vendorId" TEXT NOT NULL,
    "merchType" "MerchType" NOT NULL,
    "source" "Source" NOT NULL,
    "description" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "delegateId" TEXT,
    "programTypeId" TEXT NOT NULL,
    "estimatedValue" DECIMAL(15,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'PRE_NEGOTIATION',
    "submittedViaPortal" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "dmmApprovedBy" TEXT,
    "dmmApprovedAt" TIMESTAMP(3),
    "gmmApprovedBy" TEXT,
    "gmmApprovedAt" TIMESTAMP(3),
    "apApprovedBy" TEXT,
    "apApprovedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateProgram" (
    "id" TEXT NOT NULL,
    "programNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "rebateTypeCode" TEXT NOT NULL,
    "programTypeId" TEXT NOT NULL,
    "source" "Source" NOT NULL,
    "analystId" TEXT NOT NULL,
    "agreementId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "extractBeginDate" DATE,
    "extractEndDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "payType" TEXT,
    "frequency" TEXT,
    "altApNumber" INTEGER,
    "payApNumber" INTEGER,
    "earnType" TEXT,
    "sbtType" TEXT,
    "pctOfCost" DECIMAL(8,4),
    "pctLevel" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RebateProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateTier" (
    "id" TEXT NOT NULL,
    "rebateProgramId" TEXT NOT NULL,
    "tierLevel" INTEGER NOT NULL,
    "fromAmount" DECIMAL(15,2) NOT NULL,
    "toAmount" DECIMAL(15,2),
    "rate" DECIMAL(8,6) NOT NULL,
    "tierType" TEXT NOT NULL DEFAULT 'INCREMENTAL',

    CONSTRAINT "RebateTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateVendor" (
    "id" TEXT NOT NULL,
    "rebateProgramId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RebateVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateVendorDept" (
    "id" TEXT NOT NULL,
    "rebateVendorId" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "classCode" TEXT NOT NULL DEFAULT '-1',
    "ipVendorNum" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RebateVendorDept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculateResult" (
    "id" TEXT NOT NULL,
    "rebateVendorDeptId" TEXT NOT NULL,
    "fiscalPeriod" INTEGER NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "receiptAmount" DECIMAL(15,2),
    "salesAmount" DECIMAL(15,2),
    "dropshipAmount" DECIMAL(15,2),
    "fixedAmount" DECIMAL(15,2),
    "tierLevel" INTEGER,
    "rateApplied" DECIMAL(8,6),
    "pmuEarnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "marginEarnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "advcoopEarnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "otherCoopEarnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalEarnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "adjustmentReason" TEXT,
    "finalEarnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "finalEarningsLegacy" DECIMAL(15,2),
    "status" "CalculateResultStatus" NOT NULL DEFAULT 'OPEN',
    "runAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalculateResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "targetSystem" "TargetSystem" NOT NULL,
    "functionType" "FunctionType" NOT NULL,
    "fiscalPeriod" INTEGER NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3),
    "exportedBy" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "finalizedBy" TEXT,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcctControlMaster" (
    "id" TEXT NOT NULL,
    "rebateTypeCode" TEXT NOT NULL,
    "functionType" "FunctionType" NOT NULL,
    "targetSystem" "TargetSystem" NOT NULL,
    "accountCode" TEXT NOT NULL,
    "costCenter" TEXT NOT NULL,
    "transactionTypeCode" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcctControlMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "calculateResultId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "acctControlId" TEXT NOT NULL,

    CONSTRAINT "BatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculateResultAdjustment" (
    "id" TEXT NOT NULL,
    "calculateResultId" TEXT NOT NULL,
    "adjustmentAmount" DECIMAL(15,2) NOT NULL,
    "adjustmentReason" TEXT NOT NULL,
    "appliedBy" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" TEXT,

    CONSTRAINT "CalculateResultAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Check" (
    "id" TEXT NOT NULL,
    "rebateVendorId" TEXT NOT NULL,
    "checkNumber" TEXT NOT NULL,
    "checkDate" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "appliedToPeriod" INTEGER,
    "appliedToYear" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deduction" (
    "id" TEXT NOT NULL,
    "rebateVendorId" TEXT NOT NULL,
    "deductionNumber" TEXT NOT NULL,
    "deductionDate" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "rebateVendorId" TEXT NOT NULL,
    "invoiceType" TEXT NOT NULL,
    "fiscalPeriod" INTEGER NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "dueDate" DATE NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "deliveryStatus" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportJob" (
    "id" TEXT NOT NULL,
    "type" "ReportJobType" NOT NULL,
    "params" JSONB NOT NULL,
    "status" "ReportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedById" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "outputUrl" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSummary" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "source" "Source" NOT NULL,
    "fiscalPeriod" INTEGER NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "transactionVolume" DECIMAL(15,2) NOT NULL,
    "transactionVolumePy" DECIMAL(15,2) NOT NULL,
    "yoyVariancePct" DECIMAL(8,4) NOT NULL,
    "currentTier" INTEGER,
    "tierThresholdNext" DECIMAL(15,2),
    "paceToTargetPct" DECIMAL(8,4),
    "tierAlert" BOOLEAN NOT NULL DEFAULT false,
    "anomalyFlag" BOOLEAN NOT NULL DEFAULT false,
    "anomalyReason" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalPeriod_fiscalPeriod_fiscalYear_key" ON "FiscalPeriod"("fiscalPeriod", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramType_code_key" ON "ProgramType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_vendorNumber_key" ON "Vendor"("vendorNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_apNumber_key" ON "Vendor"("apNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_analystCode_key" ON "User"("analystCode");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPortalUser_email_key" ON "VendorPortalUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_agmtId_key" ON "Agreement"("agmtId");

-- CreateIndex
CREATE UNIQUE INDEX "RebateProgram_programNumber_key" ON "RebateProgram"("programNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RebateTier_rebateProgramId_tierLevel_key" ON "RebateTier"("rebateProgramId", "tierLevel");

-- CreateIndex
CREATE UNIQUE INDEX "RebateVendor_rebateProgramId_vendorId_key" ON "RebateVendor"("rebateProgramId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "RebateVendorDept_rebateVendorId_departmentCode_key" ON "RebateVendorDept"("rebateVendorId", "departmentCode");

-- CreateIndex
CREATE UNIQUE INDEX "CalculateResult_rebateVendorDeptId_fiscalPeriod_fiscalYear_key" ON "CalculateResult"("rebateVendorDeptId", "fiscalPeriod", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_batchNumber_key" ON "Batch"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_fiscalPeriod_fiscalYear_targetSystem_functionType_key" ON "Batch"("fiscalPeriod", "fiscalYear", "targetSystem", "functionType");

-- CreateIndex
CREATE UNIQUE INDEX "AcctControlMaster_rebateTypeCode_functionType_targetSystem_key" ON "AcctControlMaster"("rebateTypeCode", "functionType", "targetSystem");

-- CreateIndex
CREATE UNIQUE INDEX "BatchItem_batchId_calculateResultId_key" ON "BatchItem"("batchId", "calculateResultId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSummary_vendorId_departmentCode_source_fiscalPerio_key" ON "AnalyticsSummary"("vendorId", "departmentCode", "source", "fiscalPeriod", "fiscalYear");

-- AddForeignKey
ALTER TABLE "VendorPortalUser" ADD CONSTRAINT "VendorPortalUser_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_programTypeId_fkey" FOREIGN KEY ("programTypeId") REFERENCES "ProgramType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateProgram" ADD CONSTRAINT "RebateProgram_rebateTypeCode_fkey" FOREIGN KEY ("rebateTypeCode") REFERENCES "RebateType"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateProgram" ADD CONSTRAINT "RebateProgram_programTypeId_fkey" FOREIGN KEY ("programTypeId") REFERENCES "ProgramType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateProgram" ADD CONSTRAINT "RebateProgram_analystId_fkey" FOREIGN KEY ("analystId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateProgram" ADD CONSTRAINT "RebateProgram_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateTier" ADD CONSTRAINT "RebateTier_rebateProgramId_fkey" FOREIGN KEY ("rebateProgramId") REFERENCES "RebateProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateVendor" ADD CONSTRAINT "RebateVendor_rebateProgramId_fkey" FOREIGN KEY ("rebateProgramId") REFERENCES "RebateProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateVendor" ADD CONSTRAINT "RebateVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateVendorDept" ADD CONSTRAINT "RebateVendorDept_rebateVendorId_fkey" FOREIGN KEY ("rebateVendorId") REFERENCES "RebateVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculateResult" ADD CONSTRAINT "CalculateResult_rebateVendorDeptId_fkey" FOREIGN KEY ("rebateVendorDeptId") REFERENCES "RebateVendorDept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcctControlMaster" ADD CONSTRAINT "AcctControlMaster_rebateTypeCode_fkey" FOREIGN KEY ("rebateTypeCode") REFERENCES "RebateType"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchItem" ADD CONSTRAINT "BatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchItem" ADD CONSTRAINT "BatchItem_calculateResultId_fkey" FOREIGN KEY ("calculateResultId") REFERENCES "CalculateResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchItem" ADD CONSTRAINT "BatchItem_acctControlId_fkey" FOREIGN KEY ("acctControlId") REFERENCES "AcctControlMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculateResultAdjustment" ADD CONSTRAINT "CalculateResultAdjustment_calculateResultId_fkey" FOREIGN KEY ("calculateResultId") REFERENCES "CalculateResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculateResultAdjustment" ADD CONSTRAINT "CalculateResultAdjustment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_rebateVendorId_fkey" FOREIGN KEY ("rebateVendorId") REFERENCES "RebateVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deduction" ADD CONSTRAINT "Deduction_rebateVendorId_fkey" FOREIGN KEY ("rebateVendorId") REFERENCES "RebateVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_rebateVendorId_fkey" FOREIGN KEY ("rebateVendorId") REFERENCES "RebateVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportJob" ADD CONSTRAINT "ReportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSummary" ADD CONSTRAINT "AnalyticsSummary_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
