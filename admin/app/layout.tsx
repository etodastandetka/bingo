import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bingo Admin Panel',
  description: 'Admin panel for Bingo bot management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}

