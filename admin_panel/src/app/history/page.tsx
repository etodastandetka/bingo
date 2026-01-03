'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { BottomNav } from '@/components/BottomNav';
import { RefreshButton } from '@/components/RefreshButton';
import { DatePicker } from '@/components/DatePicker';

type FilterType = 'all' | 'deposits' | 'withdrawals' | 'manual';

interface Transaction {
  id: string;
  name: string;
  transactionId: string;
  amount: number;
  date: string;
  time: string;
  status: 'success' | 'declined';
  closedBy: 'auto' | { type: 'admin'; login: string } | { type: 'user'; name: string };
  bankImage: string;
}

const mockTransactions: Transaction[] = [
  {
    id: '1',
    name: 'Юсуф Elkassa',
    transactionId: '6429249395',
    amount: 50.9,
    date: '26.11.2025',
    time: '00:13',
    status: 'success',
    closedBy: { type: 'user', name: 'dastan' },
    bankImage: '/images/mbank.png',
  },
  {
    id: '2',
    name: 'INCO',
    transactionId: '5884268022',
    amount: 436.55,
    date: '25.11.2025',
    time: '23:43',
    status: 'declined',
    closedBy: { type: 'admin', login: 'admin_user' },
    bankImage: '/images/optima.jpg',
  },
  {
    id: '3',
    name: 'Рыся',
    transactionId: '5313672919',
    amount: 200.46,
    date: '25.11.2025',
    time: '23:42',
    status: 'declined',
    closedBy: 'auto',
    bankImage: '/images/bakai.jpg',
  },
  {
    id: '4',
    name: 'isa',
    transactionId: '8595236748',
    amount: 50.66,
    date: '25.11.2025',
    time: '23:41',
    status: 'declined',
    closedBy: { type: 'admin', login: 'moderator' },
    bankImage: '/images/demirbank.jpg',
  },
  {
    id: '5',
    name: 'Рыся',
    transactionId: '5313672919',
    amount: 200.58,
    date: '25.11.2025',
    time: '23:38',
    status: 'declined',
    closedBy: { type: 'user', name: 'dastan' },
    bankImage: '/images/megapay.jpg',
  },
  {
    id: '6',
    name: 'Время Денги',
    transactionId: '8488416174',
    amount: 1000.22,
    date: '25.11.2025',
    time: '23:24',
    status: 'success',
    closedBy: 'auto',
    bankImage: '/images/omoney.jpg',
  },
];

const filters = [
  { label: 'Все', value: 'all' as FilterType, icon: 'menu' },
  { label: 'Пополнения', value: 'deposits' as FilterType, icon: 'down' },
  { label: 'Выводы', value: 'withdrawals' as FilterType, icon: 'up' },
  { label: 'Ручное', value: 'manual' as FilterType, icon: 'edit' },
];

export default function HistoryPage() {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<{ from: string; to: string } | string | null>(null);

  const filteredTransactions = useMemo(() => {
    let filtered = mockTransactions;

    // Фильтр по типу
    if (activeFilter !== 'all') {
      // Здесь можно добавить логику фильтрации по типу транзакции
      // Пока оставляем все транзакции
    }

    // Фильтр по дате или диапазону
    if (selectedDateRange) {
      filtered = filtered.filter((transaction) => {
        // Преобразуем формат даты из '26.11.2025' в '2025-11-26'
        const [day, month, year] = transaction.date.split('.');
        const transactionDate = `${year}-${month}-${day}`;
        
        if (typeof selectedDateRange === 'string') {
          return transactionDate === selectedDateRange;
        } else {
          return transactionDate >= selectedDateRange.from && transactionDate <= selectedDateRange.to;
        }
      });
    }

    return filtered;
  }, [activeFilter, selectedDateRange]);

  return (
    <>
      <main className="flex flex-1 flex-col gap-4 px-4 pb-8 pt-10 text-white">
        <header className="flex items-center justify-center relative">
          <div className="flex flex-col items-center">
            <h1 className="text-2xl font-semibold text-sky-400">История</h1>
            <p className="text-sm text-white/70">Все транзакции</p>
          </div>
          <div className="absolute right-0">
            <RefreshButton />
          </div>
        </header>

        <DatePicker value={selectedDateRange || undefined} onChange={setSelectedDateRange} range={true} />

        <section className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {filters.map((filter) => {
            const isActive = activeFilter === filter.value;
            return (
              <button
                key={filter.value}
                onClick={() => setActiveFilter(filter.value)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition whitespace-nowrap ${
                  isActive
                    ? 'bg-sky-500 text-white'
                    : 'bg-white/10 text-white/80 hover:bg-white/15'
                }`}
              >
                {filter.icon === 'menu' && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                  </svg>
                )}
                {filter.icon === 'down' && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M19 12l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {filter.icon === 'up' && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {filter.icon === 'edit' && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {filter.label}
              </button>
            );
          })}
        </section>

        <section className="flex flex-1 flex-col gap-3 overflow-y-auto scrollbar-hide">
          {filteredTransactions.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-transparent text-center py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gray-500/20 border border-gray-400/30 text-gray-300">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 5h10a2 2 0 0 1 2 2v12H5V7a2 2 0 0 1 2-2z" />
                  <path d="M15 3v4H9V3" strokeLinecap="round" />
                </svg>
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">Нет транзакций</h2>
                <p className="text-sm text-white/70">
                  {selectedDateRange ? 'На выбранный период транзакций не найдено' : 'Транзакции не найдены'}
                </p>
              </div>
            </div>
          ) : (
            filteredTransactions.map((transaction) => (
            <article
              key={transaction.id}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="relative h-16 w-16 shrink-0">
                <Image
                  src={transaction.bankImage}
                  alt={transaction.name}
                  fill
                  className="rounded-2xl object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-white truncate">{transaction.name}</p>
                <p className="text-xs text-white/60 mt-1">ID: {transaction.transactionId}</p>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <p className="text-xs text-white/60">
                  {transaction.date} • {transaction.time}
                </p>
                <p
                  className={`text-base font-semibold ${
                    transaction.status === 'success' ? 'text-sky-400' : 'text-red-400'
                  }`}
                >
                  +{transaction.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p
                  className={`text-xs font-medium ${
                    transaction.status === 'success' ? 'text-sky-400' : 'text-red-400'
                  }`}
                >
                  {transaction.status === 'success' ? 'Успешно' : 'Отклонено'}
                </p>
              </div>
            </article>
            ))
          )}
        </section>
      </main>
      <BottomNav />
    </>
  );
}
