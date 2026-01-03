'use client';

import { useState } from 'react';

interface Wallet {
  name: string;
  requisites: string;
  bank: string;
  email: string;
  password: string;
  hash?: string;
  isActive: boolean;
}

interface AddWalletModalProps {
  onClose: () => void;
  onAdd: (wallet: Omit<Wallet, 'id'>) => void;
  banks: string[];
}

export function AddWalletModal({ onClose, onAdd, banks }: AddWalletModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    requisites: '',
    bank: '',
    email: '',
    password: '',
    hash: '',
    isActive: false,
  });
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.requisites || !formData.bank) {
      alert('Заполните все обязательные поля');
      return;
    }
    if (formData.requisites.length !== 16) {
      alert('Реквизит должен содержать 16 цифр');
      return;
    }
    onAdd(formData);
    setFormData({
      name: '',
      requisites: '',
      bank: '',
      email: '',
      password: '',
      hash: '',
      isActive: false,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0f1a] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-6 text-2xl font-semibold text-white">Добавить кошелек</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-white/70">
              Название <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Название кошелька"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-white/70">
              Реквизит (16 цифр) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.requisites}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 16);
                setFormData({ ...formData, requisites: value });
              }}
              placeholder="1234567890123456"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40"
              required
            />
            <p className="mt-1 text-xs text-white/40">{formData.requisites.length}/16 цифр</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-white/70">
              Hash <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.hash}
              onChange={(e) => setFormData({ ...formData, hash: e.target.value })}
              placeholder="Введите hash"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40"
              required
            />
          </div>

          <div className="relative">
            <label className="mb-1 block text-sm text-white/70">
              Банк <span className="text-red-400">*</span>
            </label>
            <button
              type="button"
              onClick={() => setIsBankDropdownOpen(!isBankDropdownOpen)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-white transition ${
                formData.bank
                  ? 'border-sky-400/30 bg-white/5'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={formData.bank ? 'text-white' : 'text-white/40'}>
                  {formData.bank || 'Выберите банк'}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className={`h-5 w-5 transition-transform ${isBankDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {isBankDropdownOpen && (
              <div className="absolute z-10 mt-2 w-full rounded-lg border border-white/10 bg-white/10 backdrop-blur-sm">
                {banks.map((bank) => (
                  <button
                    key={bank}
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, bank });
                      setIsBankDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-white transition hover:bg-white/5"
                  >
                    {bank}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-white/70">Почта</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@example.com"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-white/70">
              Пароль <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="h-5 w-5 rounded border-white/20 bg-white/5 text-sky-500"
            />
            <label htmlFor="isActive" className="text-sm text-white/70">
              Сделать активным
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-sky-500 px-4 py-2 text-white transition hover:bg-sky-600"
            >
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

