import { NextResponse } from 'next/server';
import crypto from 'crypto';

interface CashdeskConfig {
  hash: string;
  cashierpass: string;
  login: string;
  cashdeskid: number;
}

interface MostbetConfig {
  api_key: string;
  secret: string;
  cashpoint_id: number;
}

interface BalanceResult {
  balance: number;
  limit: number;
}

const CASHDESK_CONFIG: Record<string, CashdeskConfig> = {
  '1xbet': {
    hash: process.env.XBET_HASH || '97f471a9db92debbda38201af67e15f64d086e94ae4b919d8a6a4f64958912cf',
    cashierpass: process.env.XBET_CASHIERPASS || 'wiaWAfE9',
    login: process.env.XBET_LOGIN || 'zhenishbAd',
    cashdeskid: parseInt(process.env.XBET_CASHDESKID || '1388580'),
  },
  melbet: {
    hash: process.env.MELBET_HASH || 'd34f03473c467b538f685f933b2dc7a3ea8c877901231235693c10be014eb6f4',
    cashierpass: process.env.MELBET_CASHIERPASS || 'd1WRq!ke',
    login: process.env.MELBET_LOGIN || 'uuuadetz',
    cashdeskid: parseInt(process.env.MELBET_CASHDESKID || '1390018'),
  },
};

const MOSTBET_CONFIG: MostbetConfig = {
  api_key: process.env.MOSTBET_API_KEY || 'api-key:0522f4fb-0a18-4ec2-8e27-428643602db4',
  secret: process.env.MOSTBET_SECRET || '7b6c63ae-2615-4466-a3eb-f5fca2c5c6dc',
  cashpoint_id: parseInt(process.env.MOSTBET_CASHPOINT_ID || '117753'),
};

async function getCashdeskBalance(
  casino: '1xbet' | 'melbet',
  cfg: CashdeskConfig
): Promise<BalanceResult> {
  try {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    const formattedDt = `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;

    const confirmStr = `${cfg.cashdeskid}:${cfg.hash}`;
    const confirm = crypto.createHash('md5').update(confirmStr).digest('hex');

    const step1 = `hash=${cfg.hash}&cashierpass=${cfg.cashierpass}&dt=${formattedDt}`;
    const sha1 = crypto.createHash('sha256').update(step1).digest('hex');

    const step2 = `dt=${formattedDt}&cashierpass=${cfg.cashierpass}&cashdeskid=${cfg.cashdeskid}`;
    const md5Hash = crypto.createHash('md5').update(step2).digest('hex');

    const combined = sha1 + md5Hash;
    const sign = crypto.createHash('sha256').update(combined).digest('hex');

    const url = `https://partners.servcul.com/CashdeskBotAPI/Cashdesk/${cfg.cashdeskid}/Balance?confirm=${confirm}&dt=${formattedDt}`;
    const headers = { sign };

    const response = await fetch(url, { headers, method: 'GET' });

    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.Balance !== 'undefined') {
        return {
          balance: parseFloat(data.Balance) || 0,
          limit: parseFloat(data.Limit) || 0,
        };
      }
    }
  } catch (error) {
    console.error(`Error getting ${casino} balance:`, error);
  }

  return { balance: 0, limit: 0 };
}

async function getMostbetBalance(cfg: MostbetConfig): Promise<BalanceResult> {
  try {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const path = `/mbc/gateway/v1/api/cashpoint/${cfg.cashpoint_id}/balance`;
    const url = `https://apimb.com/mbc/gateway/v1/api/cashpoint/${cfg.cashpoint_id}/balance`;

    const signString = `${cfg.api_key}${path}${timestamp}`;
    const signature = crypto
      .createHmac('sha256', cfg.secret)
      .update(signString)
      .digest('hex');

    const headers = {
      'X-Api-Key': cfg.api_key,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      'Content-Type': 'application/json',
      'Accept': '*/*',
    };

    const response = await fetch(url, { headers, method: 'GET' });

    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.balance !== 'undefined') {
        return {
          balance: parseFloat(data.balance) || 0,
          limit: 0,
        };
      }
    }
  } catch (error) {
    console.error('Error getting Mostbet balance:', error);
  }

  return { balance: 0, limit: 0 };
}

async function getPlatformLimits(): Promise<
  Array<{ key: string; name: string; limit: number }>
> {
  const limits: Array<{ key: string; name: string; limit: number }> = [];

  try {
    const xbetCfg = CASHDESK_CONFIG['1xbet'];
    if (xbetCfg.cashdeskid > 0) {
      const xbetBal = await getCashdeskBalance('1xbet', xbetCfg);
      limits.push({ key: '1xbet', name: '1xbet', limit: xbetBal.limit });
    } else {
      limits.push({ key: '1xbet', name: '1xbet', limit: 0 });
    }

    const melbetCfg = CASHDESK_CONFIG.melbet;
    if (melbetCfg.cashdeskid > 0) {
      const melbetBal = await getCashdeskBalance('melbet', melbetCfg);
      limits.push({ key: 'melbet', name: 'Melbet', limit: melbetBal.limit });
    } else {
      limits.push({ key: 'melbet', name: 'Melbet', limit: 0 });
    }

    limits.push({ key: '1win', name: '1WIN', limit: 0 });

    const mostbetCfg = MOSTBET_CONFIG;
    if (mostbetCfg.cashpoint_id > 0) {
      const mostbetBal = await getMostbetBalance(mostbetCfg);
      limits.push({ key: 'mostbet', name: 'Mostbet', limit: mostbetBal.limit });
    } else {
      limits.push({ key: 'mostbet', name: 'Mostbet', limit: 0 });
    }
  } catch (error) {
    console.error('Error getting platform limits:', error);
    return [
      { key: '1xbet', name: '1xbet', limit: 0 },
      { key: 'melbet', name: 'Melbet', limit: 0 },
      { key: '1win', name: '1WIN', limit: 0 },
      { key: 'mostbet', name: 'Mostbet', limit: 0 },
    ];
  }

  return limits;
}

export async function GET() {
  try {
    const limits = await getPlatformLimits();
    return NextResponse.json({ success: true, data: limits });
  } catch (error) {
    console.error('Error fetching limits:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch limits' },
      { status: 500 }
    );
  }
}
