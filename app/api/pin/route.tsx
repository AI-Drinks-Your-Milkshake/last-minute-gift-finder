// Pinterest pin image generation endpoint.
//
// Calls Screenshotone to screenshot /pin-render/{slug} — the bare
// PinTemplate page — and streams the resulting JPEG back to the caller.
//
// Screenshotone visits the page with a real Chrome instance, so the
// output exactly matches the PinPreview the wizard shows: real product
// photos, vibe CSS variables, brick-staggered grid layout.
//
// Required env var: SCREENSHOTONE_ACCESS_KEY
// Sign up free at https://screenshotone.com — free tier includes 100
// screenshots/month, plenty for development and initial batch posting.
//
// URL: GET /api/pin?slug={pageSlug}
//
// The slug is used to construct the pin-render URL that Screenshotone
// visits. The vibe is already baked into the stored page result that
// /pin-render reads from KV, so no separate vibe param is needed here.

import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';   // needs fetch + env vars; not edge

// How long to cache each pin image in the browser and at the CDN edge.
// 7 days is reasonable — pins don't change after generation.
const CACHE_TTL = 60 * 60 * 24 * 7;

function siteUrl(): string {
  // VERCEL_PROJECT_PRODUCTION_URL is set automatically on Vercel Pro/Team.
  // Fall back to NEXT_PUBLIC_SITE_URL for self-hosted / local overrides.
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'lastminutegiftfinder.vercel.app';
  return host.startsWith('http') ? host : `https://${host}`;
}

export async function GET(request: NextRequest) {
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY;
  if (!accessKey) {
    return new Response(
      JSON.stringify({ error: 'SCREENSHOTONE_ACCESS_KEY is not set.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  if (!slug) {
    return new Response(
      JSON.stringify({ error: 'slug param is required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // The page Screenshotone will visit.
  const pinRenderUrl = `${siteUrl()}/pin-render/${encodeURIComponent(slug)}`;

  // Screenshotone API — returns a JPEG of the rendered page.
  // viewport matches PinTemplate's native 1000×1500 dimensions exactly.
  const ssParams = new URLSearchParams({
    access_key:          accessKey,
    url:                 pinRenderUrl,
    viewport_width:      '1000',
    viewport_height:     '1500',
    device_scale_factor: '2',     // 2× → 2000×3000 output (retina quality)
    format:              'jpeg',
    image_quality:       '90',
    full_page:           'false',
    block_ads:           'true',
    block_cookie_banners:'true',
    // Wait for all network requests to finish so product images load.
    wait_until:          'networkidle2',
    // Give images extra time to load — product photos come from external CDNs.
    timeout:             '15',
  });

  const screenshotUrl = `https://api.screenshotone.com/take?${ssParams}`;

  let screenshotRes: Response;
  try {
    screenshotRes = await fetch(screenshotUrl);
  } catch (err) {
    console.error('[api/pin] Screenshotone fetch failed:', err);
    return new Response(
      JSON.stringify({ error: 'Screenshot service unreachable.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!screenshotRes.ok) {
    const body = await screenshotRes.text().catch(() => '');
    console.error('[api/pin] Screenshotone error:', screenshotRes.status, body);
    return new Response(
      JSON.stringify({ error: `Screenshot service returned ${screenshotRes.status}.` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Stream the JPEG straight back to the caller with caching headers.
  return new Response(screenshotRes.body, {
    headers: {
      'Content-Type':  'image/jpeg',
      'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
    },
  });
}
