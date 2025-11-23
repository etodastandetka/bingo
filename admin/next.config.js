/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // КРИТИЧНО: для создания standalone build для PM2
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    BOT_TOKEN: process.env.BOT_TOKEN,
  },
}

module.exports = nextConfig

