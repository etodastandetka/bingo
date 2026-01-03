-- AlterTable
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "bot_type" VARCHAR(20) DEFAULT 'main';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_requests_bot_type" ON "requests"("bot_type");

