/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  reactStrictMode: true,
  // output: 'standalone' - убрано, используем обычный билд для совместимости с next start
  
  // Оптимизация производительности
  compress: true, // Включить gzip сжатие
  poweredByHeader: false, // Убрать заголовок X-Powered-By для безопасности
  
  // Оптимизация изображений
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Экспериментальные функции для оптимизации
  experimental: {
    // Оптимизация серверных компонентов
    serverComponentsExternalPackages: ['@prisma/client'],
    // Оптимизация CSS
    optimizeCss: true,
  },
  
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    BOT_TOKEN: process.env.BOT_TOKEN || '8413027203:AAHhXadiHxW8WUSGp8tzxPqOF7iLHf8lI_s',
    OPERATOR_BOT_TOKEN: process.env.OPERATOR_BOT_TOKEN || '8279477654:AAHZHyx5Ez_qeOYx610ayISgHhtz9Uy7F_0',
    BOT_TOKEN_MOSTBET: process.env.BOT_TOKEN_MOSTBET,
    BOT_TOKEN_1XBET: process.env.BOT_TOKEN_1XBET,
  },
  
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    }
    
    // Оптимизация для production
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Vendor chunk для node_modules
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20,
            },
            // Common chunk для общих модулей
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              enforce: true,
            },
          },
        },
      }
    }
    
    return config
  },
}

module.exports = nextConfig

