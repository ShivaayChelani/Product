-- CreateTable
CREATE TABLE "admob_ssv_events" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ad_unit" TEXT NOT NULL,
    "reward_item" TEXT,
    "reward_amount" INTEGER,
    "timestamp" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admob_ssv_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admob_ssv_events_transaction_id_key" ON "admob_ssv_events"("transaction_id");

-- CreateIndex
CREATE INDEX "admob_ssv_events_user_id_idx" ON "admob_ssv_events"("user_id");

-- CreateIndex
CREATE INDEX "admob_ssv_events_created_at_idx" ON "admob_ssv_events"("created_at");
