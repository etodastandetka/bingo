import { BottomNav } from '@/components/BottomNav';
import { RebelBanner } from '@/components/RebelBanner';

const menuItems = [
  { label: 'Настройки каналов', hint: 'Статус и токены' },
  { label: 'Комиссии', hint: 'Условия партнёров' },
  { label: 'Сотрудники', hint: 'Права доступа' },
  { label: 'Поддержка', hint: 'Чат и инструкции' },
];

export default function MenuPage() {
  return (
    <>
      <main className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-6">
        <RebelBanner className="mb-2" />
        <div>
          <p className="text-sm text-white/60">Быстрые настройки</p>
          <h1 className="text-2xl font-semibold">Меню</h1>
        </div>
        <section className="rounded-3xl border border-white/10 bg-white/5 p-2">
          {menuItems.map((item) => (
            <button
              key={item.label}
              className="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left text-white transition hover:bg-white/5"
            >
              <div>
                <p className="text-base font-semibold">{item.label}</p>
                <p className="text-sm text-white/60">{item.hint}</p>
              </div>
              <span className="text-white/40">&rsaquo;</span>
            </button>
          ))}
        </section>
      </main>
      <BottomNav />
    </>
  );
}

