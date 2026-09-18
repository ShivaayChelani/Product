-- CreateTable
CREATE TABLE "moderation_cases" (
    "id" TEXT NOT NULL,
    "case_identifier" TEXT NOT NULL,
    "case_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "entity_name" TEXT,
    "reporter_id" TEXT,
    "reporter_name" TEXT,
    "reason" TEXT,
    "severity" TEXT,
    "priority" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assigned_moderator_id" TEXT,
    "assigned_moderator_name" TEXT,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moderation_cases_case_identifier_key" ON "moderation_cases"("case_identifier");

-- CreateIndex
CREATE INDEX "moderation_cases_status_idx" ON "moderation_cases"("status");

-- CreateIndex
CREATE INDEX "moderation_cases_case_type_idx" ON "moderation_cases"("case_type");