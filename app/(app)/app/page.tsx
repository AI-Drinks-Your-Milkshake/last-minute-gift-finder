import { cookies } from 'next/headers';
import GiftFinderWizard from '@/components/GiftFinderWizard';

// Read cookies → render dynamically (admin state must not be cached).
export const dynamic = 'force-dynamic';

export default function AppPage() {
  // MVP "admin" = whoever logged in with the shared password (holds a valid
  // strix-session cookie). Admins see the Pin Preview / Pinterest panel; the
  // gift finder itself is public to everyone.
  const token   = process.env.AUTH_TOKEN ?? '';
  const session = cookies().get('strix-session')?.value ?? '';
  const isAdmin = Boolean(token) && session === token;

  return <GiftFinderWizard isAdmin={isAdmin} />;
}
