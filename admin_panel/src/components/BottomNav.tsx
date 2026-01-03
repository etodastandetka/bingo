'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/', label: 'Главная', icon: 'home' },
  { href: '/history', label: 'История', icon: 'clock' },
  { href: '/wallet', label: 'Кошелёк', icon: 'wallet' },
  { href: '/limits', label: 'Лимиты', icon: 'chart' },
  { href: '/menu', label: 'Меню', icon: 'menu' },
];

const iconMap: Record<string, React.JSX.Element> = {
  home: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M3 11.4 11.3 4a1 1 0 0 1 1.4 0L21 11.4V20a1 1 0 0 1-1 1h-5v-5.5h-6V21H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V8a2 2 0 0 1 2-1z" />
      <path d="M17 12h3" strokeLinecap="round" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 20V9M12 20V4M19 20v-7" strokeLinecap="round" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16M7 12h13M4 18h16" strokeLinecap="round" />
    </svg>
  ),
};

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 mt-6 border-t border-white/10 bg-white/5 backdrop-blur-sm px-4 py-3">
      <ul className="flex items-stretch justify-between text-[11px] font-medium uppercase tracking-wide text-white/60">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-lg px-2 py-1 transition-colors',
                  isActive ? 'text-white' : 'text-white/50 hover:text-white'
                )}
              >
                <span
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-full text-base',
                    isActive ? 'bg-sky-500 text-white' : 'bg-white/5'
                  )}
                >
                  {iconMap[item.icon]}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

