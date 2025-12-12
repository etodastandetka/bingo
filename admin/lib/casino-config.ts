import { prisma } from '@/lib/prisma'

// Унифицированное получение конфигурации API казино из БД или env
export async function getCasinoConfig(bookmaker: string) {
  const normalizedBookmaker = bookmaker?.toLowerCase() || ''
  
  // 1xbet
  if (normalizedBookmaker.includes('1xbet') || normalizedBookmaker === '1xbet') {
    const setting = await prisma.botConfiguration.findFirst({ where: { key: '1xbet_api_config' } })
    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.hash && config.cashierpass && config.login && config.cashdeskid) {
        return { hash: config.hash, cashierpass: config.cashierpass, login: config.login, cashdeskid: String(config.cashdeskid) }
      }
    }
    return {
      hash: process.env.XBET_HASH || process.env.ONEXBET_HASH || 'f7ff9a23821a0dd19276392f80d43fd2e481986bebb7418fef11e03bba038101',
      cashierpass: process.env.XBET_CASHIERPASS || process.env.ONEXBET_CASHIERPASS || 'i3EBqvV1hB',
      login: process.env.XBET_LOGIN || process.env.ONEXBET_LOGIN || 'kurbanaevb',
      cashdeskid: process.env.XBET_CASHDESKID || process.env.ONEXBET_CASHDESKID || '1343871',
    }
  }
  
  // Melbet
  if (normalizedBookmaker.includes('melbet') || normalizedBookmaker === 'melbet') {
    const setting = await prisma.botConfiguration.findFirst({ where: { key: 'melbet_api_config' } })
    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.hash && config.cashierpass && config.login && config.cashdeskid) {
        return { hash: config.hash, cashierpass: config.cashierpass, login: config.login, cashdeskid: String(config.cashdeskid) }
      }
    }
    return {
      hash: process.env.MELBET_HASH || '5c6459e67bde6c8ace972e2a4d7e1f83d05e2b68c0741474b0fa57e46a19bda1',
      cashierpass: process.env.MELBET_CASHIERPASS || 'ScgOQgUzZs',
      login: process.env.MELBET_LOGIN || 'bakhtark',
      cashdeskid: process.env.MELBET_CASHDESKID || '1350588',
    }
  }

  // Winwin
  if (normalizedBookmaker.includes('winwin') || normalizedBookmaker === 'winwin') {
    const setting = await prisma.botConfiguration.findFirst({ where: { key: 'winwin_api_config' } })
    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.hash && config.cashierpass && config.login && config.cashdeskid) {
        return { hash: config.hash, cashierpass: config.cashierpass, login: config.login, cashdeskid: String(config.cashdeskid) }
      }
    }
    return {
      hash: process.env.WINWIN_HASH || '4e3ab6e0b47e063017f7e41e3ee5090df5c717c1e908301539cc75199baf7a71',
      cashierpass: process.env.WINWIN_CASHIERPASS || '5JGENBWTuh',
      login: process.env.WINWIN_LOGIN || 'kurbanaevbakh',
      cashdeskid: process.env.WINWIN_CASHDESKID || '1392184',
    }
  }
  
  // Mostbet / MBCash
  if (normalizedBookmaker.includes('mostbet') || normalizedBookmaker === 'mostbet') {
    const setting = await prisma.botConfiguration.findFirst({ where: { key: 'mostbet_api_config' } })
    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.api_key && config.secret && config.cashpoint_id) {
        return {
          api_key: config.api_key,
          secret: config.secret,
          cashpoint_id: String(config.cashpoint_id),
          x_project: config.x_project || 'MBC',
          brand_id: config.brand_id || 1,
        }
      }
    }
    return {
      api_key: process.env.MOSTBET_API_KEY || 'api-key:3d83ac24-7fd2-498d-84b4-f2a7e80401fb',
      secret: process.env.MOSTBET_SECRET || 'baa104d1-73a6-4914-866a-ddbbe0aae11a',
      cashpoint_id: process.env.MOSTBET_CASHPOINT_ID || '48436',
      x_project: process.env.MOSTBET_X_PROJECT || 'MBC',
      brand_id: parseInt(process.env.MOSTBET_BRAND_ID || '1'),
    }
  }

  // 1win
  if (normalizedBookmaker.includes('1win') || normalizedBookmaker === '1win') {
    const setting = await prisma.botConfiguration.findFirst({ where: { key: '1win_api_config' } })
    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.api_key) {
        return { api_key: config.api_key }
      }
    }
    return {
      api_key: process.env.ONEWIN_API_KEY || process.env.ONE_WIN_API_KEY || '0ad11eda9f40c2e05c34dc81c24ebe7f53eabe606c6cc5e553cfe66cd7fa9c8e',
    }
  }

  // 888starz / starz
  if (normalizedBookmaker.includes('888starz') || normalizedBookmaker === '888starz' || normalizedBookmaker.includes('starz')) {
    const setting = await prisma.botConfiguration.findFirst({ where: { key: '888starz_api_config' } })
    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.hash && config.cashierpass && config.login && config.cashdeskid) {
        return { hash: config.hash, cashierpass: config.cashierpass, login: config.login, cashdeskid: String(config.cashdeskid) }
      }
    }
    return {
      hash: process.env.STARZ_HASH || process.env.STARZ888_HASH || '6bb5fbcbc5784359ccbf490167d9b3a82ea6dc3eac22e0d7cc083c2e71b10da0',
      cashierpass: process.env.STARZ_CASHIERPASS || process.env.STARZ888_CASHIERPASS || '8688726678',
      login: process.env.STARZ_LOGIN || process.env.STARZ888_LOGIN || 'kurbanaevba',
      cashdeskid: process.env.STARZ_CASHDESKID || process.env.STARZ888_CASHDESKID || '1376440',
    }
  }

  // 1xCasino / xcasino
  if (normalizedBookmaker.includes('1xcasino') || normalizedBookmaker === '1xcasino' || normalizedBookmaker.includes('xcasino')) {
    const setting = await prisma.botConfiguration.findFirst({ where: { key: '1xcasino_api_config' } })
    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.hash && config.cashierpass && config.login && config.cashdeskid) {
        return { hash: config.hash, cashierpass: config.cashierpass, login: config.login, cashdeskid: String(config.cashdeskid) }
      }
    }
    return {
      hash: process.env.ONEXCASINO_HASH || process.env.XCASINO_HASH || 'ea6a5d009551cbadaf583b4b158341df4a770c4f2fbc8a1eceb0817ca814a588',
      cashierpass: process.env.ONEXCASINO_CASHIERPASS || process.env.XCASINO_CASHIERPASS || '1eezPvxmJO',
      login: process.env.ONEXCASINO_LOGIN || process.env.XCASINO_LOGIN || 'kurbanaevbak',
      cashdeskid: process.env.ONEXCASINO_CASHDESKID || process.env.XCASINO_CASHDESKID || '1383980',
    }
  }

  // BetWinner
  if (normalizedBookmaker.includes('betwinner') || normalizedBookmaker === 'betwinner') {
    const setting = await prisma.botConfiguration.findFirst({ where: { key: 'betwinner_api_config' } })
    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.hash && config.cashierpass && config.login && config.cashdeskid) {
        return { hash: config.hash, cashierpass: config.cashierpass, login: config.login, cashdeskid: String(config.cashdeskid) }
      }
    }
    return {
      hash: process.env.BETWINNER_HASH || 'b2b5dcc4fd7c2dd559bd3c465ee9202f157e0697ed016dbd7db0121ebfec7ff2',
      cashierpass: process.env.BETWINNER_CASHIERPASS || '2768772981',
      login: process.env.BETWINNER_LOGIN || 'kurbanaevba1',
      cashdeskid: process.env.BETWINNER_CASHDESKID || '1392478',
    }
  }

  // WowBet
  if (normalizedBookmaker.includes('wowbet') || normalizedBookmaker === 'wowbet') {
    const setting = await prisma.botConfiguration.findFirst({ where: { key: 'wowbet_api_config' } })
    if (setting) {
      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
      if (config.hash && config.cashierpass && config.login && config.cashdeskid) {
        return { hash: config.hash, cashierpass: config.cashierpass, login: config.login, cashdeskid: String(config.cashdeskid) }
      }
    }
    return {
      hash: process.env.WOWBET_HASH || '62a28327ed306a7a5b12c92f22c5ed10b88ff6ef94787b3890e2b4c77ac16b74',
      cashierpass: process.env.WOWBET_CASHIERPASS || 'yRxTshBn',
      login: process.env.WOWBET_LOGIN || 'bakhtarku',
      cashdeskid: process.env.WOWBET_CASHDESKID || '1425058',
    }
  }

  return null
}




