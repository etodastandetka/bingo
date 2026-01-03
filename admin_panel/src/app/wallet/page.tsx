'use client';

import { useState } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { AddWalletModal } from '@/components/AddWalletModal';

interface Wallet {
  id: string;
  name: string;
  requisites: string;
  bank: string;
  email: string;
  password: string;
  hash?: string;
  isActive: boolean;
}

const mockWallets: Wallet[] = [
  {
    id: '1',
    name: 'Султан демир',
    requisites: '1180000364360397',
    bank: 'DEMIRBANK',
    email: 'sultan@name-kotik.com',
    password: '********',
    isActive: true,
  },
  {
    id: '2',
    name: 'temirlan',
    requisites: '1180000364772043',
    bank: 'DEMIRBANK',
    email: 'temirlan_k@luxservice.online',
    password: '',
    isActive: false,
  },
];

const banks = ['DEMIRBANK', 'Bakai', 'Optima', 'MBank', 'Megapay', 'Omoney'];

export default function WalletPage() {
  const [wallets, setWallets] = useState<Wallet[]>(mockWallets);
  const [activeWalletId, setActiveWalletId] = useState<string>('1');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const activeWallet = wallets.find((w) => w.id === activeWalletId);

  const formatRequisites = (req: string) => {
    if (req.length < 8) return req;
    return `${req.slice(0, 4)}****${req.slice(-4)}`;
  };

  const handleDelete = (id: string) => {
    if (confirm('Вы уверены, что хотите удалить этот кошелек?')) {
      setWallets(wallets.filter((w) => w.id !== id));
      if (activeWalletId === id && wallets.length > 1) {
        setActiveWalletId(wallets.find((w) => w.id !== id)?.id || '');
      }
    }
  };

  const handleAddWallet = (wallet: Omit<Wallet, 'id'>) => {
    const newWallet: Wallet = {
      ...wallet,
      id: Date.now().toString(),
    };
    setWallets([...wallets, newWallet]);
    if (wallet.isActive) {
      setActiveWalletId(newWallet.id);
    }
    setIsAddModalOpen(false);
  };

  return (
    <>
      <main className="flex flex-1 flex-col gap-4 px-4 pb-8 pt-10 text-white">
        <header className="flex items-center justify-center relative">
          <h1 className="text-2xl font-semibold text-white">Кошелек</h1>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="absolute right-0 rounded-xl bg-sky-500 p-3 text-white transition hover:bg-sky-600"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="space-y-2">
          <label className="text-sm text-white/70">Активный кошелек</label>
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full rounded-xl border border-sky-400/30 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
            >
              <div className="flex items-center justify-between">
                <span>
                  {activeWallet
                    ? `${activeWallet.name} - ${formatRequisites(activeWallet.requisites)} ${activeWallet.isActive ? '(Активен)' : ''}`
                    : 'Выберите кошелек'}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className={`h-5 w-5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {isDropdownOpen && (
              <div className="absolute z-10 mt-2 w-full rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm">
                <div className="p-2 text-xs text-white/60">Выберите активный кошелек</div>
                {wallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => {
                      setActiveWalletId(wallet.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left transition ${
                      activeWalletId === wallet.id
                        ? 'bg-sky-500 text-white'
                        : 'text-white/80 hover:bg-white/5'
                    }`}
                  >
                    {wallet.name} - {formatRequisites(wallet.requisites)}
                    {wallet.isActive && ' (Активен)'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-1 flex-col gap-4 overflow-y-auto scrollbar-hide">
          {wallets.map((wallet) => (
            <article
              key={wallet.id}
              className={`rounded-2xl border p-4 ${
                wallet.isActive ? 'border-sky-400/30 bg-white/5' : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white">{wallet.name}</h3>
                  {wallet.isActive && (
                    <span className="rounded-full bg-sky-500 px-2 py-0.5 text-xs text-white">Активен</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className="rounded-lg bg-blue-500 p-2 text-white transition hover:bg-blue-600">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(wallet.id)}
                    className="rounded-lg bg-red-500 p-2 text-white transition hover:bg-red-600"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-white/60">Реквизит (16 цифр)</label>
                  <input
                    type="text"
                    value={wallet.requisites}
                    readOnly
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60">Банк</label>
                  <input
                    type="text"
                    value={wallet.bank}
                    readOnly
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60">Почта</label>
                  <input
                    type="email"
                    value={wallet.email}
                    readOnly
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </div>
                {wallet.password && (
                  <div>
                    <label className="text-xs text-white/60">Пароль</label>
                    <input
                      type="password"
                      value={wallet.password}
                      readOnly
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    />
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      </main>
      <BottomNav />
      {isAddModalOpen && <AddWalletModal onClose={() => setIsAddModalOpen(false)} onAdd={handleAddWallet} banks={banks} />}
    </>
  );
}
