import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LastMinuteGiftFinder — Last-minute gift, found fast.',
  description: 'Specific, thoughtful gift ideas in under a minute — personalized by interest, occasion, and vibe, on Amazon and ready to ship fast. Built for anyone too busy to shop.',
  openGraph: {
    title: 'LastMinuteGiftFinder — Last-minute gift, found fast.',
    description: 'Specific, thoughtful gift ideas in under a minute — personalized by interest, occasion, and vibe, on Amazon and ready to ship fast.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
