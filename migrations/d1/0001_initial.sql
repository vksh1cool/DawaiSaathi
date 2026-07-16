-- DawaiSaathi initial D1 schema. Keep this aligned with prisma/schema.prisma.
-- Wrangler records this migration in d1_migrations when it is applied.
PRAGMA foreign_keys = ON;

CREATE TABLE "Household" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "caregiverName" TEXT NOT NULL,
  "uiLanguage" TEXT NOT NULL DEFAULT 'en',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Patient" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "householdId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'hi',
  "voiceGender" TEXT NOT NULL DEFAULT 'female',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Patient_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ScanBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "rawExtractionJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ScanPhoto" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  CONSTRAINT "ScanPhoto_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScanBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Medication" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "scanBatchId" TEXT,
  "brandName" TEXT NOT NULL,
  "displayGeneric" TEXT NOT NULL,
  "saltsJson" TEXT NOT NULL,
  "form" TEXT NOT NULL DEFAULT 'tablet',
  "packSize" INTEGER,
  "mrpInr" REAL,
  "expiryDate" TEXT,
  "batchNumber" TEXT,
  "manufacturer" TEXT,
  "highRisk" BOOLEAN NOT NULL DEFAULT false,
  "highRiskReason" TEXT,
  "fieldConfidenceJson" TEXT,
  "usualFrequencyHint" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Medication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Schedule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "medicationId" TEXT NOT NULL,
  "timesJson" TEXT NOT NULL,
  "foodRelation" TEXT NOT NULL DEFAULT 'any',
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Schedule_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DoseEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scheduleId" TEXT NOT NULL,
  "medicationId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "scheduledAtUtc" DATETIME NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAtUtc" DATETIME,
  "confirmedAtUtc" DATETIME,
  "confirmedVia" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DoseEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DoseEvent_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DoseEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ReminderCall" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "scheduledAtUtc" DATETIME NOT NULL,
  "doseEventIdsJson" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'twilio',
  "twilioCallSid" TEXT,
  "twilioStatus" TEXT,
  "digitsPressed" TEXT,
  "outcome" TEXT,
  "replayCount" INTEGER NOT NULL DEFAULT 0,
  "audioFile" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "InteractionFinding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "pairKey" TEXT NOT NULL,
  "medAId" TEXT NOT NULL,
  "medBId" TEXT NOT NULL,
  "saltA" TEXT NOT NULL,
  "saltB" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "explanationEn" TEXT NOT NULL,
  "explanationHi" TEXT NOT NULL,
  "actionEn" TEXT NOT NULL,
  "actionHi" TEXT NOT NULL,
  "evidenceJson" TEXT NOT NULL DEFAULT '[]',
  "acknowledged" BOOLEAN NOT NULL DEFAULT false,
  "acknowledgedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InteractionFinding_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "GenericMatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "medicationId" TEXT NOT NULL,
  "jaProductCode" TEXT,
  "jaProductName" TEXT,
  "jaPackSize" INTEGER,
  "jaMrpInr" REAL,
  "jaUnitPriceInr" REAL,
  "brandUnitPriceInr" REAL,
  "monthlySavingsInr" INTEGER,
  "confidence" TEXT,
  "estimated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenericMatch_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CaregiverAlert" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "doseEventIdsJson" TEXT NOT NULL DEFAULT '[]',
  "messageEn" TEXT NOT NULL,
  "messageHi" TEXT NOT NULL,
  "readAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaregiverAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ApiCache" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "payload" TEXT NOT NULL,
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AudioAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "hash" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "scriptText" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OpenAiBudget" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "day" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "DoseEvent_status_scheduledAtUtc_idx" ON "DoseEvent"("status", "scheduledAtUtc");
CREATE UNIQUE INDEX "DoseEvent_scheduleId_scheduledAtUtc_key" ON "DoseEvent"("scheduleId", "scheduledAtUtc");
CREATE UNIQUE INDEX "ReminderCall_twilioCallSid_key" ON "ReminderCall"("twilioCallSid");
CREATE INDEX "InteractionFinding_patientId_acknowledged_idx" ON "InteractionFinding"("patientId", "acknowledged");
CREATE UNIQUE INDEX "AudioAsset_hash_key" ON "AudioAsset"("hash");
CREATE INDEX "OpenAiBudget_day_operation_idx" ON "OpenAiBudget"("day", "operation");
