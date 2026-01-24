-- Создание таблицы для хранения текущих лимитов казино
CREATE TABLE IF NOT EXISTS casino_limits (
  id SERIAL PRIMARY KEY,
  casino VARCHAR(100) UNIQUE NOT NULL,
  current_limit DECIMAL(12, 2) DEFAULT 0 NOT NULL,
  base_limit DECIMAL(12, 2),
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_casino_limits_casino ON casino_limits(casino);

-- Создание таблицы для логирования операций с лимитами
CREATE TABLE IF NOT EXISTS casino_limit_logs (
  id SERIAL PRIMARY KEY,
  casino VARCHAR(100) NOT NULL,
  request_id INTEGER,
  request_type VARCHAR(20) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  limit_before DECIMAL(12, 2) NOT NULL,
  limit_after DECIMAL(12, 2) NOT NULL,
  user_id BIGINT,
  account_id VARCHAR(255),
  processed_by VARCHAR(255),
  is_mismatch BOOLEAN DEFAULT FALSE,
  mismatch_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_casino_limit_logs_casino_created ON casino_limit_logs(casino, created_at);
CREATE INDEX IF NOT EXISTS idx_casino_limit_logs_request_id ON casino_limit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_casino_limit_logs_user_id ON casino_limit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_casino_limit_logs_mismatch ON casino_limit_logs(is_mismatch);

