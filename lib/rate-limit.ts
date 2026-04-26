import { kv } from '@vercel/kv';

const LIMIT_PER_DAY = 5;

function isConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function checkRateLimit(ip: string): Promise<{
  allowed: boolean;
  remaining: number;
}> {
  if (!isConfigured()) {
    // No KV → skip limiting (safe for local dev)
    return { allowed: true, remaining: LIMIT_PER_DAY };
  }

  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC
  const key = `ratelimit:${ip}:${date}`;

  // Atomic increment — returns the new value after increment
  const count = await kv.incr(key);

  if (count === 1) {
    // First hit today: set TTL so key auto-expires at midnight UTC
    const midnight = new Date();
    midnight.setUTCHours(24, 0, 0, 0);
    const ttl = Math.ceil((midnight.getTime() - Date.now()) / 1000);
    await kv.expire(key, ttl);
  }

  return {
    allowed: count <= LIMIT_PER_DAY,
    remaining: Math.max(0, LIMIT_PER_DAY - count),
  };
}
