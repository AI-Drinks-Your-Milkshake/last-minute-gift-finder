import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Strix',
  description: 'AI-powered gift ideas tailored to any person, any occasion — in seconds.',
  openGraph: {
    title: 'Strix',
    description: 'AI-powered gift ideas tailored to any person, any occasion — in seconds.',
    type: 'website',
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
