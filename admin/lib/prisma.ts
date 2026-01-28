import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ВАЖНО: Параметры connection pool задаются через DATABASE_URL
// Добавьте к вашему DATABASE_URL параметры:
// ?connection_limit=100&pool_timeout=60
// где:
// - connection_limit - максимальное количество соединений в пуле (по умолчанию 17, рекомендуется 100)
// - pool_timeout - время ожидания свободного соединения из пула в секундах (по умолчанию 10, рекомендуется 60)
// 
// КРИТИЧНО: Если видите ошибки "Timed out fetching a new connection from the connection pool",
// увеличьте connection_limit в DATABASE_URL до 100 и pool_timeout до 60
// 
// Автоматическое обновление: запустите npx tsx scripts/fix-connection-pool.ts
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

