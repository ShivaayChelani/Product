ALTER TABLE "reels" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "reels_tags_idx" ON "reels" USING GIN ("tags");