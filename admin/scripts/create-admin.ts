import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createAdmin() {
  const username = process.env.ADMIN_USERNAME || 'dastan'
  const password = process.env.ADMIN_PASSWORD || 'dastan10dz'
  const email = process.env.ADMIN_EMAIL || 'admin@bingo.com'

  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    const admin = await prisma.adminUser.upsert({
      where: { username },
      update: {
        password: hashedPassword,
        email,
      },
      create: {
        username,
        password: hashedPassword,
        email,
        isActive: true,
        isSuperAdmin: true,
      },
    })

    console.log('✅ Admin user created/updated successfully!')
    console.log(`Username: ${admin.username}`)
    console.log(`Email: ${admin.email}`)
    console.log(`Password: ${password} (please change it after first login)`)
  } catch (error) {
    console.error('❌ Error creating admin user:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

createAdmin()

