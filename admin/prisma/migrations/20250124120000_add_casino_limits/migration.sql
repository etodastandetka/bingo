-- CreateTable
CREATE TABLE "casino_limits" (
    "id" SERIAL NOT NULL,
    "casino" VARCHAR(100) NOT NULL,
    "current_limit" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "base_limit" DECIMAL(12, 2),
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casino_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casino_limit_logs" (
    "id" SERIAL NOT NULL,
    "casino" VARCHAR(100) NOT NULL,
    "request_id" INTEGER,
    "request_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(12, 2) NOT NULL,
    "limit_before" DECIMAL(12, 2) NOT NULL,
    "limit_after" DECIMAL(12, 2) NOT NULL,
    "user_id" BIGINT,
    "account_id" VARCHAR(255),
    "processed_by" VARCHAR(255),
    "is_mismatch" BOOLEAN NOT NULL DEFAULT false,
    "mismatch_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casino_limit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "casino_limits_casino_key" ON "casino_limits"("casino");

-- CreateIndex
CREATE INDEX "casino_limits_casino_idx" ON "casino_limits"("casino");

-- CreateIndex
CREATE INDEX "casino_limit_logs_casino_created_idx" ON "casino_limit_logs"("casino", "created_at");

-- CreateIndex
CREATE INDEX "casino_limit_logs_request_id_idx" ON "casino_limit_logs"("request_id");

-- CreateIndex
CREATE INDEX "casino_limit_logs_user_id_idx" ON "casino_limit_logs"("user_id");

-- CreateIndex
CREATE INDEX "casino_limit_logs_mismatch_idx" ON "casino_limit_logs"("is_mismatch");

