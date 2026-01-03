'use client';

import { useState, useEffect } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { RefreshButton } from '@/components/RefreshButton';

interface PlatformLimit {
  key: string;
  name: string;
  limit: number;
}

export default function LimitsPage() {
  const [limits, setLimits] = useState<PlatformLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLimits = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/limits');
      const data = await response.json();
      
      if (data.success) {
        setLimits(data.data || []);
      } else {
        setError(data.error || 'Ошибка загрузки данных');
      }
    } catch (err) {
      setError('Не удалось загрузить статистику');
      console.error('Error fetching limits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLimits();
  }, []);

  const formatLimit = (limit: number): string => {
    if (limit === 0) return '0 ₽';
    return `${limit.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
  };

  const getStatus = (limit: number): { text: string; color: string } => {
    if (limit === 0) {
      return { text: 'Недоступно', color: 'bg-gray-400/20 text-gray-200' };
    }
    if (limit > 100000) {
      return { text: 'Активно', color: 'bg-emerald-400/20 text-emerald-200' };
    }
    if (limit > 50000) {
      return { text: 'Средний', color: 'bg-yellow-400/20 text-yellow-200' };
    }
    return { text: 'Низкий', color: 'bg-red-400/20 text-red-200' };
  };

  return (
    <>
      <main className="flex flex-1 flex-col gap-5 px-5 pb-6 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/60">Контроль ограничений</p>
            <h1 className="text-2xl font-semibold">Лимиты</h1>
          </div>
          <RefreshButton onClick={fetchLimits} />
        </div>

        {loading ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-transparent text-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-500/20 border border-sky-400/30 text-sky-300">
              <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <p className="text-sm text-white/70">Загрузка статистики...</p>
          </section>
        ) : error ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-transparent text-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/20 border border-red-400/30 text-red-300">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-white">Ошибка</h2>
              <p className="text-sm text-white/70">{error}</p>
            </div>
            <button
              onClick={fetchLimits}
              className="mt-4 rounded-xl bg-sky-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
            >
              Попробовать снова
            </button>
          </section>
        ) : limits.length === 0 ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-transparent text-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gray-500/20 border border-gray-400/30 text-gray-300">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 20V9M12 20V4M19 20v-7" strokeLinecap="round" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-white">Нет данных</h2>
              <p className="text-sm text-white/70">Статистика недоступна</p>
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            {limits.map((platform) => {
              const status = getStatus(platform.limit);
              return (
                <article key={platform.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-white/60">{platform.name}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xl font-semibold text-white">{formatLimit(platform.limit)}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status.color}`}>
                      {status.text}
                    </span>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
      <BottomNav />
    </>
  );
}


