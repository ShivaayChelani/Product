ALTER TABLE "events"
    ADD COLUMN "deleted_at" TIMESTAMP(3),
    ADD COLUMN "deleted_by_id" TEXT;

CREATE INDEX "events_deleted_at_idx" ON "events"("deleted_at");

ALTER TABLE "events"
    ADD CONSTRAINT "events_deleted_by_id_fkey"
    FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
