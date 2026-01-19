import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ВАЖНО: Параметры connection pool задаются через DATABASE_URL
// Добавьте к вашему DATABASE_URL параметры:
// ?connection_limit=30&pool_timeout=30
// где:
// - connection_limit - максимальное количество соединений в пуле (по умолчанию зависит от провайдера)
// - pool_timeout - время ожидания свободного соединения из пула в секундах (по умолчанию 10)
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

