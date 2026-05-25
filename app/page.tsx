import { redirect } from 'next/navigation';

// Marketing landing lives here. For now, redirect to the app.
// A full marketing page (long-form, SEO) will replace this later.
export default function RootPage() {
  redirect('/app');
}
