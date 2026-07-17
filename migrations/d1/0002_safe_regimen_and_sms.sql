-- Safety migration: do not keep a legacy reminder active if it has no exact,
-- caregiver-verified regimen wording. No call may invent a tablet count.
ALTER TABLE "Schedule" ADD COLUMN "doseInstruction" TEXT;
ALTER TABLE "Patient" ADD COLUMN "smsReminderConsentAt" DATETIME;
ALTER TABLE "Patient" ADD COLUMN "smsReminderConsentVersion" TEXT;

UPDATE "Schedule"
SET "active" = false
WHERE "doseInstruction" IS NULL;

UPDATE "DoseEvent"
SET "status" = 'skipped',
    "nextAttemptAtUtc" = NULL
WHERE "status" = 'scheduled'
  AND "scheduleId" IN (
    SELECT "id" FROM "Schedule" WHERE "doseInstruction" IS NULL
  );

-- One row per final reminder call is the idempotency boundary for a consented
-- SMS follow-up. A row is claimed before Twilio is called.
CREATE TABLE "SmsDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "reminderCallId" TEXT NOT NULL,
  "toE164" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'unconfirmed_reminder',
  "bodyVersion" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "twilioMessageSid" TEXT,
  "errorCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SmsDelivery_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SmsDelivery_reminderCallId_fkey" FOREIGN KEY ("reminderCallId") REFERENCES "ReminderCall" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SmsDelivery_reminderCallId_key" ON "SmsDelivery"("reminderCallId");
CREATE UNIQUE INDEX "SmsDelivery_twilioMessageSid_key" ON "SmsDelivery"("twilioMessageSid");
CREATE INDEX "SmsDelivery_patientId_createdAt_idx" ON "SmsDelivery"("patientId", "createdAt");
CREATE INDEX "SmsDelivery_status_createdAt_idx" ON "SmsDelivery"("status", "createdAt");
