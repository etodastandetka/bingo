import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from './prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const JWT_EXPIRES_IN = '7d'

export interface TokenPayload {
  userId: number
  username: string
  isSuperAdmin: boolean
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch {
    return null
  }
}

export async function authenticateUser(username: string, password: string) {
  const user = await prisma.adminUser.findUnique({
    where: { username },
  })

  if (!user || !user.isActive) {
    return null
  }

  const isValid = await verifyPassword(password, user.password)

  if (!isValid) {
    return null
  }

  const token = generateToken({
    userId: user.id,
    username: user.username,
    isSuperAdmin: user.isSuperAdmin,
  })

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
    },
    token,
  }
}

export async function createAdminUser(username: string, password: string, email?: string) {
  const hashedPassword = await hashPassword(password)

  return prisma.adminUser.create({
    data: {
      username,
      password: hashedPassword,
      email,
      isActive: true,
      isSuperAdmin: true,
    },
  })
}

