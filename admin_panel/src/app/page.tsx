'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BottomNav } from '@/components/BottomNav';
import { RefreshButton } from '@/components/RefreshButton';

type TabType = 'pending' | 'delayed';

interface Request {
  id: string;
  name: string;
  transactionId: string;
  amount: number;
  date: string;
  time: string;
  status: TabType;
  bankImage: string;
}

const tabs: { label: string; value: TabType }[] = [
  { label: 'Ожидающие', value: 'pending' },
  { label: 'Отложенные', value: 'delayed' },
];

// Пример данных - в реальном приложении будут приходить с API
const mockRequests: Request[] = [];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('pending');

  const filteredRequests = mockRequests.filter((req) => req.status === activeTab);

  return (
    <>
      <main className="flex flex-1 flex-col gap-6 px-4 pb-8 pt-10 text-white">
        <header className="flex items-center justify-center relative">
          <div className="flex flex-col items-center">
            <h1 className="text-2xl font-semibold text-white">Заявки</h1>
            <p className="text-sm text-white/70">Актуальные транзакции</p>
          </div>
          <div className="absolute right-0">
            <RefreshButton />
          </div>
        </header>

        <section>
          <div className="grid grid-cols-2 gap-3">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`rounded-[18px] px-4 py-3 text-center text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition ${
                    isActive ? 'bg-sky-500' : 'bg-white/10'
                  }`}
                >
                  <p className={`text-base font-medium ${isActive ? 'text-white' : 'text-white/80'}`}>
                    {tab.label}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {filteredRequests.length > 0 ? (
          <section className="flex flex-1 flex-col gap-3 overflow-y-auto scrollbar-hide">
            {filteredRequests.map((request) => (
              <article
                key={request.id}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="relative h-16 w-16 shrink-0">
                  <Image
                    src={request.bankImage}
                    alt={request.name}
                    fill
                    className="rounded-2xl object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-white truncate">{request.name}</p>
                  <p className="text-xs text-white/60 mt-1">ID: {request.transactionId}</p>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className="text-xs text-white/60">
                    {request.date} • {request.time}
                  </p>
                  <p className="text-base font-semibold text-sky-400">
                    +{request.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-transparent text-center">
            <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-sky-500/20 border border-sky-400/30 text-sky-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
              <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M7 5h10a2 2 0 0 1 2 2v12H5V7a2 2 0 0 1 2-2z" />
                <path d="M15 3v4H9V3" strokeLinecap="round" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-white">Нет заявок</h2>
              <p className="text-sm text-white/70">
                Как только появится новая заявка, она отобразится здесь.
              </p>
            </div>
          </section>
        )}
      </main>
      <BottomNav />
    </>
  );
}
