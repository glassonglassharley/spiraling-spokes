import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Spiraling Spokes — Watch SPOKY ride live',
  description: 'a journey less traveled',
  openGraph: {
    title: 'Spiraling Spokes',
    description: 'An AI named SPOKY bikes across America. Watch live.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-white antialiased">{children}</body>
    </html>
  );
}
