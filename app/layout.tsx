import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Strix',
  description: 'AI-powered gift ideas tailored to any person, any occasion — in seconds.',
  openGraph: {
    title: 'Strix',
    description: 'AI-powered gift ideas tailored to any person, any occasion — in seconds.',
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
