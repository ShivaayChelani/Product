-- CreateTable
CREATE TABLE "media_cleanup_tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL DEFAULT 'image',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_cleanup_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_cleanup_tasks_public_id_resource_type_key" ON "media_cleanup_tasks"("public_id", "resource_type");

-- CreateIndex
CREATE INDEX "media_cleanup_tasks_status_updated_at_idx" ON "media_cleanup_tasks"("status", "updated_at");
