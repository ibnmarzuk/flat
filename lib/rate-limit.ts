import { getDb } from "@/lib/db";

type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export async function consumeWalletRateLimit(
  endpoint: "auth_nonce" | "auth_verify" | "transaction_verify" | "network_verify" | "wif_weekly_verify" | "wif_swap_verify",
  walletAddress: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const key = endpoint + ":" + walletAddress.toLowerCase();
  const db = getDb();
  const rows = await db`
    insert into public.api_rate_limits (rate_key, window_started_at, request_count, updated_at)
    values (${key}, now(), 1, now())
    on conflict (rate_key) do update set
      request_count = case
        when public.api_rate_limits.window_started_at <= now() - make_interval(secs => ${windowSeconds}) then 1
        else public.api_rate_limits.request_count + 1
      end,
      window_started_at = case
        when public.api_rate_limits.window_started_at <= now() - make_interval(secs => ${windowSeconds}) then now()
        else public.api_rate_limits.window_started_at
      end,
      updated_at = now()
    returning request_count, window_started_at
  `;
  const row = rows[0] as { request_count: number; window_started_at: Date | string } | undefined;
  if (!row) throw new Error("Rate limit could not be evaluated.");
  const started = new Date(row.window_started_at).getTime();
  const retryAfterSeconds = Math.max(1, Math.ceil((started + windowSeconds * 1000 - Date.now()) / 1000));
  return { allowed: row.request_count <= limit, remaining: Math.max(0, limit - row.request_count), retryAfterSeconds };
}
