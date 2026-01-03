'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface RefreshButtonProps {
  onClick?: () => void | Promise<void>;
}

export function RefreshButton({ onClick }: RefreshButtonProps = {}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (onClick) {
      startTransition(async () => {
        await onClick();
      });
    } else {
      startTransition(() => {
        router.refresh();
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Обновить данные"
      className="rounded-xl bg-white/10 border border-white/20 p-3 text-white transition hover:bg-white/15 disabled:opacity-50"
      disabled={isPending}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-5 w-5 ${isPending ? 'animate-spin' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          d="M20 12a8 8 0 0 1-14 5M4 12a8 8 0 0 1 14-5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M6 17v-4H2M18 7v4h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

